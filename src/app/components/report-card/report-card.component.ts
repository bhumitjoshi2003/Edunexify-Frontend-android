import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef,
  Inject, OnDestroy, OnInit, PLATFORM_ID, ViewChild
} from '@angular/core';
import { CommonModule, isPlatformBrowser, Location } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl, Title } from '@angular/platform-browser';
import { Observable, Subject, takeUntil } from 'rxjs';
import { MarksService, ExamResult } from '../../services/marks.service';
import {
  ReportCardTemplateService, ReportCardData, TemplateSection, BrandingConfig,
  ExamColumn, SubjectRow, AmbiguousClassCandidate, isAmbiguousReportCardContext
} from '../../services/report-card-template.service';
import { LoggerService } from '../../services/logger.service';
import { AuthStateService } from '../../auth/auth-state.service';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { ToastService } from '../../services/toast.service';
import { environment } from '../../../environments/environment';
import { ParentChildContextComponent } from '../parent-child-context/parent-child-context.component';
import { ChildAccess } from '../../interfaces/parent-portal';

@Component({
  selector: 'app-report-card',
  standalone: true,
  imports: [CommonModule, ParentChildContextComponent],
  templateUrl: './report-card.component.html',
  styleUrl: './report-card.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportCardComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  studentId = '';
  session = '';

  // ── Demo mode ─────────────────────────────────────────────────────────
  demoMode = false;
  demoStyleName = '';

  // ── Legacy exam-based mode ────────────────────────────────────────────
  examId: number | null = null;
  allResults: ExamResult[] = [];
  displayResults: ExamResult[] = [];
  studentName = '';
  className = '';

  // ── Template-based mode ───────────────────────────────────────────────
  templateId: number | null = null;
  reportCardData: ReportCardData | null = null;
  /** The classId chosen (explicitly, or unambiguously implied) for the current request —
   *  reused for both the data load and the PDF download so both target the exact same
   *  historical class context (see E6E's "do not independently recalculate class"). */
  selectedClassId: number | null = null;

  loading = true;
  notPublished = false;  // true when STUDENT hits a 403 (report not yet published)
  // E6F: the student has more than one legitimate historical class for this session (a
  // mid-session class change with marked exams on both sides). The user must pick one —
  // never silently guessed. See ReportCardDataAssembler.ReportCardContextAmbiguousException.
  ambiguousCandidates: AmbiguousClassCandidate[] | null = null;
  private originalTitle = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private location: Location,
    private titleService: Title,
    private marksService: MarksService,
    private rcTemplateService: ReportCardTemplateService,
    private authState: AuthStateService,
    private cdr: ChangeDetectorRef,
    private logger: LoggerService,
    private toast: ToastService,
    private sanitizer: DomSanitizer,
    @Inject(PLATFORM_ID) private platformId: object
  ) { }

  ngOnInit(): void {
    this.originalTitle = this.titleService.getTitle();
    const params = this.route.snapshot.queryParamMap;
    this.studentId = params.get('studentId') ?? '';
    this.session   = params.get('session') ?? '';
    const examIdStr    = params.get('examId');
    const templateIdStr = params.get('templateId');
    this.examId     = examIdStr     ? Number(examIdStr)     : null;
    this.templateId = templateIdStr ? Number(templateIdStr) : null;
    // A notification link names the historical class so the card opens without asking.
    const classIdParam = Number(params.get('classId'));
    this.selectedClassId = Number.isInteger(classIdParam) && classIdParam > 0 ? classIdParam : null;

    this.demoMode = params.get('demo') === 'true';
    this.demoStyleName = params.get('styleName') ?? 'CBSE Standard';
    if (this.demoMode) {
      this.reportCardData = this.buildSampleData();
      this.templateId = -1;
      this.loading = false;
      this.cdr.markForCheck();
      this.titleService.setTitle('Sample Report Card — Indra Academy Style');
      return;
    }

    if (!this.studentId || !this.session) {
      this.router.navigate(['/dashboard']);
      return;
    }

    // STUDENT role can only view own report card
    if (!this.demoMode) {
      const role = this.authState.getUserRole();
      const authUserId = this.authState.getUserId();
      if (role === 'STUDENT' && this.studentId && this.studentId !== String(authUserId)) {
        this.toast.error('Access Denied', 'You can only view your own report card.');
        this.router.navigate(['/dashboard']);
        return;
      }
    }

    if (this.templateId) {
      this.loadTemplateMode();
    } else {
      this.loadLegacyMode();
    }
  }

  ngOnDestroy(): void {
    this.revokePreview();
    this.revokeInline();
    this.titleService.setTitle(this.originalTitle);
    this.destroy$.next();
    this.destroy$.complete();
  }

  onChildTabSelected(child: ChildAccess): void {
    if (!child.canViewResults) {
      this.toast.error('Results access unavailable', 'Please contact the school administrator.');
      return;
    }
    this.studentId = child.studentId;
    this.loading = true;
    this.reportCardData = null;
    this.notPublished = false;
    this.ambiguousCandidates = null;
    this.selectedClassId = null;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { studentId: child.studentId },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    if (this.templateId) {
      this.loadTemplateMode();
    } else {
      this.loadLegacyMode();
    }
    this.cdr.markForCheck();
  }

  // ── Template-based mode ───────────────────────────────────────────────

  private loadTemplateMode(): void {
    this.ambiguousCandidates = null;
    this.rcTemplateService
      .getReportCard(this.studentId, this.templateId!, this.session, this.selectedClassId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.reportCardData = data;
          this.loading = false;
          this.cdr.markForCheck();
          this.loadInline();
          this.titleService.setTitle(
            `ReportCard_${data.studentName.replace(/\s+/g, '_')}_${this.session}`
          );
        },
        error: (e) => {
          if (e.status === 409 && isAmbiguousReportCardContext(e.error)) {
            // More than one legitimate historical class for this session — show the choice
            // rather than guessing (see E6E's ReportCardContextAmbiguousException).
            this.ambiguousCandidates = e.error.candidates;
          } else if (e.status === 403) {
            this.notPublished = true;
          } else {
            this.logger.error('Error loading template report card:', e);
            this.toast.error('Error', 'Failed to load report card.');
          }
          this.loading = false;
          this.cdr.markForCheck();
        }
      });
  }

  /** User's choice from the E6F ambiguity picker — retries the same request with the selected
   *  classId, which is also reused for the PDF download so both target the same context. */
  selectHistoricalClass(candidate: AmbiguousClassCandidate): void {
    this.selectedClassId = candidate.classId;
    this.ambiguousCandidates = null;
    const pending = this.pendingPdfAction;
    this.pendingPdfAction = null;
    if (!this.templateId) {
      // Results card: the choice was needed for the PDF — carry on with what the user asked for.
      this.cdr.markForCheck();
      if (pending === 'preview') this.inlineUrl ? this.print() : this.loadInline();
      if (pending === 'download') this.downloadPdf();
      return;
    }
    this.loading = true;
    this.cdr.markForCheck();
    this.loadTemplateMode();
  }

  // ── Legacy exam-based mode ────────────────────────────────────────────

  private loadLegacyMode(): void {
    this.marksService.getStudentResults(this.studentId, this.session)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.allResults = data;
          if (data.length > 0) {
            this.studentName = data[0].studentName;
            this.className   = data[0].className;
          }
          this.displayResults = this.examId
            ? data.filter(r => r.examId === this.examId)
            : data;
          this.loading = false;
          this.cdr.markForCheck();
          if (this.displayResults.length > 0) this.loadInline();
          this.updateDocumentTitle();
        },
        error: (e) => {
          this.logger.error('Error loading report card:', e);
          this.loading = false;
          this.cdr.markForCheck();
        },
      });
  }

  // ── Branding helpers ──────────────────────────────────────────────────

  get branding(): BrandingConfig {
    if (!this.reportCardData?.template?.brandingJson) return {};
    try { return JSON.parse(this.reportCardData.template.brandingJson); } catch { return {}; }
  }

  get headerStyle(): string {
    return '';
  }

  get rcLabelStyle(): string {
    return '';
  }

  // logoSrc — resolves the relative logo path (e.g. /uploads/school-logos/1.png)
  // to a full URL the same way the login page does via TenantService.getLogoUrl()
  get logoSrc(): string {
    const url = this.reportCardData?.schoolLogoUrl;
    if (!url) return '';
    if (url.startsWith('http')) return url;
    return `${environment.apiUrl}${url}`;
  }

  // photoSrc — resolves student photo relative path to a full URL
  get photoSrc(): string {
    const url = this.reportCardData?.photoUrl;
    if (!url) return '';
    if (url.startsWith('http')) return url;
    return `${environment.apiUrl}${url}`;
  }

  // classDisplay — e.g. "10" or "10 – A" when section exists
  get classDisplay(): string {
    const cls = this.reportCardData?.className ?? '';
    const sec = this.reportCardData?.sectionName;
    return sec ? `${cls} – ${sec}` : cls;
  }

  // boardLabel — human-readable board type shown in school header
  get boardLabel(): string {
    const map: Record<string, string> = {
      CBSE: 'CBSE Affiliated',
      ICSE: 'ICSE Affiliated',
      STATE: 'State Board',
      OTHER: ''
    };
    return map[this.reportCardData?.boardType ?? ''] ?? '';
  }

  get showCgpa(): boolean {
    return (this.branding.showCgpa !== false) && !!this.reportCardData?.cgpa;
  }

  get showGradePoints(): boolean {
    return this.branding.showGradePoints === true;
  }

  get marksRowCount(): number {
    return this.reportCardData?.weightedResult?.marksTable?.subjectRows?.length ?? 0;
  }

  get examColumnCount(): number {
    return this.reportCardData?.weightedResult?.marksTable?.examColumns?.length ?? 0;
  }

  get coScholasticCount(): number {
    return this.reportCardData?.coScholasticGrades?.length || this.coScholasticActivities.length || 0;
  }

  get isDenseReport(): boolean {
    return this.marksRowCount > 6 || this.examColumnCount > 2 || this.coScholasticCount > 4;
  }

  get isVeryDenseReport(): boolean {
    return this.marksRowCount > 9 || this.examColumnCount > 3 || this.coScholasticCount > 6;
  }

  get schoolInitials(): string {
    const name = this.reportCardData?.schoolName ?? '';
    const words = name.trim().split(/\s+/).filter(w => w.length > 0);
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
  }
  get schoolMotto(): string { return this.branding.schoolMotto ?? ''; }
  get examTerm(): string { return this.branding.examTerm ?? ''; }
  get examDisplay(): string {
    const term = this.examTerm.trim();
    if (!term) return '';
    return term.toLowerCase().includes('exam') ? term : `${term} Examination`;
  }
  /** The backend title (same as the PDF), in the card's letter-spaced style. */
  get titleLetterSpaced(): string {
    const title = (this.reportCardData?.reportTitle || 'REPORT CARD').trim();
    if (title.length > 34) return title;
    return title.split(' ').map(word => word.split('').join(' ')).join('\u00a0\u00a0\u00a0');
  }
  get watermarkEnabled(): boolean { return this.branding.showWatermark === true; }
  get watermarkType(): string { return this.branding.watermarkType ?? 'TEXT'; }
  get watermarkText(): string { return this.branding.watermarkText ?? (this.reportCardData?.schoolName ?? ''); }

  get affiliationLine(): string {
    const parts: string[] = [];
    const aff = this.reportCardData?.affiliationNumber;
    const code = this.reportCardData?.schoolCode;
    const city = this.reportCardData?.schoolCity;
    if (aff) parts.push(`Affiliation No. ${aff}`);
    if (code) parts.push(`School Code ${code}`);
    if (city) parts.push(city);
    return parts.join(' \u00b7 ');
  }


  // ── Template helpers ──────────────────────────────────────────────────

  get enabledSections(): TemplateSection[] {
    return (this.reportCardData?.template?.sections ?? [])
      .filter(s => s.enabled)
      .sort((a, b) => a.displayOrder - b.displayOrder);
  }

  sectionConfig(sectionType: string): any {
    const sec = this.reportCardData?.template?.sections?.find(s => s.sectionType === sectionType);
    if (!sec?.configJson) return {};
    try { return JSON.parse(sec.configJson); } catch { return {}; }
  }

  get coScholasticActivities(): string[] {
    const cfg = this.sectionConfig('CO_SCHOLASTIC');
    return cfg?.activities ?? ['Discipline', 'Sports', 'Co-Curricular'];
  }

  get coScholasticGradeScale(): string[] {
    const cfg = this.sectionConfig('CO_SCHOLASTIC');
    return cfg?.gradeScale ?? ['A', 'B', 'C', 'D'];
  }

  // ── Grading display (grades and pass/fail always come from the backend) ──

  /** Colour only, derived from the backend grade and pass flag — no grading scale lives here. */
  gradeClass(grade: string | null | undefined, passed: boolean | null | undefined): string {
    if (!grade) return 'grade-absent';
    if (passed === false) return 'grade-fail';
    const band = grade.charAt(0);
    return band === 'A' ? 'grade-a' : band === 'B' ? 'grade-b' : 'grade-c';
  }

  // ── Legacy mode helpers ───────────────────────────────────────────────

  private updateDocumentTitle(): void {
    const namePart = this.studentName.trim().replace(/\s+/g, '_');
    const examPart = this.isPerExam && this.displayResults.length > 0
      ? this.displayResults[0].examName.trim().replace(/\s+/g, '_')
      : 'Full_Report';
    const sessionPart = this.session.replace('-', '_');
    this.titleService.setTitle(`ReportCard_${namePart}_${examPart}_${sessionPart}`);
  }

  get isPerExam(): boolean { return this.examId !== null; }

  get cardTitle(): string {
    if (this.isPerExam && this.displayResults.length > 0) {
      return this.displayResults[0].examName + ' — Report Card';
    }
    return 'Annual Report Card';
  }

  // ── Actions ───────────────────────────────────────────────────────────

  // ── PDF: the one printable document ──────────────────────────────────
  // "Preview & Print" and "Download" both use the backend-generated PDF — never window.print()
  // of this page, so no sidebar, top bar or browser page chrome ever reaches the paper. In the
  // Android app both hand that PDF to the system (Capacitor Filesystem + Share).

  downloadingPdf = false;
  previewingPdf = false;
  pdfPreviewUrl: SafeResourceUrl | null = null;
  private pdfObjectUrl: string | null = null;
  private pendingPdfAction: 'preview' | 'download' | null = null;
  @ViewChild('pdfFrame') private pdfFrame?: ElementRef<HTMLIFrameElement>;

  /** Whether this card has a backend PDF (everything except the static sample). */
  get canUsePdf(): boolean { return !this.demoMode && !!this.studentId && !!this.session; }

  /** Template card when a template is chosen; otherwise the card built from the exam results. */
  private pdfRequest(): Observable<Blob> {
    return this.templateId
      ? this.rcTemplateService.downloadPdf(this.studentId, this.templateId, this.session, this.selectedClassId)
      : this.rcTemplateService.downloadResultsPdf(this.studentId, this.session, this.examId, this.selectedClassId);
  }

  private get pdfFileName(): string {
    const name = (this.reportCardData?.studentName ?? this.studentName ?? '').trim().replace(/\s+/g, '_') || 'Student';
    return `${name}_${this.session}_ReportCard.pdf`;
  }

  // ── The page's report card: the backend PDF itself, shown inline ──────
  inlineUrl: SafeResourceUrl | null = null;
  inlineState: 'idle' | 'loading' | 'ready' | 'error' = 'idle';
  private inlineObjectUrl: string | null = null;
  @ViewChild('inlineFrame') private inlineFrame?: ElementRef<HTMLIFrameElement>;

  /** Whether there is a real card to show (template data, or results for the results card). */
  get hasCard(): boolean { return this.templateId ? !!this.reportCardData : this.displayResults.length > 0; }

  /** In the Android app the PDF opens in the system viewer instead of inside the page. */
  get isNative(): boolean { return Capacitor.isNativePlatform(); }

  /** Loads the backend report-card PDF into the page (web). */
  loadInline(): void {
    if (!this.canUsePdf || this.isNative || !isPlatformBrowser(this.platformId)) return;
    const request = this.pdfRequest();
    if (!request) return;
    this.inlineState = 'loading';
    this.cdr.markForCheck();
    request.pipe(takeUntil(this.destroy$)).subscribe({
      next: (blob) => {
        this.revokeInline();
        this.inlineObjectUrl = URL.createObjectURL(blob);
        this.inlineUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.inlineObjectUrl);
        this.inlineState = 'ready';
        this.cdr.markForCheck();
      },
      error: (e) => { this.inlineState = 'error'; this.onPdfError(e, 'preview'); },
    });
  }

  private revokeInline(): void {
    if (this.inlineObjectUrl) URL.revokeObjectURL(this.inlineObjectUrl);
    this.inlineObjectUrl = null;
    this.inlineUrl = null;
  }

  /** Preview & Print: prints the report card shown on the page (the PDF), else opens it in a preview. */
  print(): void {
    if (!this.canUsePdf || this.previewingPdf) return;
    if (this.inlineUrl && !this.isNative) {
      try {
        this.inlineFrame?.nativeElement.contentWindow?.focus();
        this.inlineFrame?.nativeElement.contentWindow?.print();
        return;
      } catch { /* fall back to the preview dialog below */ }
    }
    if (Capacitor.isNativePlatform()) {
      // The app has no browser print: hand the same PDF to Android to open, print or share.
      this.downloadPdf();
      return;
    }
    this.previewingPdf = true;
    this.cdr.markForCheck();
    const request = this.pdfRequest();
    if (!request) { this.previewingPdf = false; return; }
    request.pipe(takeUntil(this.destroy$)).subscribe({
      next: (blob) => {
        this.previewingPdf = false;
        this.revokePreview();
        this.pdfObjectUrl = URL.createObjectURL(blob);
        this.pdfPreviewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.pdfObjectUrl);
        this.cdr.markForCheck();
      },
      error: (e) => { this.previewingPdf = false; this.onPdfError(e, 'preview'); },
    });
  }

  /** Prints the PDF document shown in the preview (not this page). */
  printPreview(): void {
    const frame = this.pdfFrame?.nativeElement;
    try {
      frame?.contentWindow?.focus();
      frame?.contentWindow?.print();
    } catch {
      this.openPreviewInNewTab();   // some browsers do not allow printing an embedded PDF
    }
  }

  openPreviewInNewTab(): void {
    if (this.pdfObjectUrl && isPlatformBrowser(this.platformId)) window.open(this.pdfObjectUrl, '_blank', 'noopener');
  }

  savePreview(): void {
    if (this.pdfObjectUrl) this.saveUrl(this.pdfObjectUrl);
  }

  closePreview(): void {
    this.revokePreview();
    this.cdr.markForCheck();
  }

  private revokePreview(): void {
    if (this.pdfObjectUrl) URL.revokeObjectURL(this.pdfObjectUrl);
    this.pdfObjectUrl = null;
    this.pdfPreviewUrl = null;
  }

  downloadPdf(): void {
    if (!this.canUsePdf || this.downloadingPdf) return;

    this.downloadingPdf = true;
    this.cdr.markForCheck();

    this.pdfRequest().pipe(takeUntil(this.destroy$)).subscribe({
      next: async (blob) => {
        try {
          if (Capacitor.isNativePlatform()) {
            await this.sharePdf(blob);
          } else {
            const url = URL.createObjectURL(blob);
            this.saveUrl(url);
            URL.revokeObjectURL(url);
          }
        } catch (e: any) {
          if (e?.message !== 'Share canceled') {
            this.logger.error('PDF share failed', e);
            this.toast.error('Download Failed', 'Could not generate PDF. Please try again.');
          }
        } finally {
          this.downloadingPdf = false;
          this.cdr.markForCheck();
        }
      },
      error: (e) => { this.downloadingPdf = false; this.onPdfError(e, 'download'); },
    });
  }

  /** Android: save the PDF to the app cache and open the system sheet to view, print or share it. */
  private async sharePdf(blob: Blob): Promise<void> {
    const fileName = this.pdfFileName;
    const base64 = await this.blobToBase64(blob);
    await Filesystem.writeFile({ path: fileName, data: base64, directory: Directory.Cache });
    const { uri } = await Filesystem.getUri({ path: fileName, directory: Directory.Cache });
    await Share.share({ title: 'Report Card', files: [uri], dialogTitle: 'Open, print, or share the report card' });
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  private saveUrl(url: string): void {
    const a = document.createElement('a');
    a.href = url;
    a.download = this.pdfFileName;
    a.click();
  }

  /** PDF errors arrive as a Blob body: read it to show the right message (or the class picker). */
  private async onPdfError(e: any, action: 'preview' | 'download'): Promise<void> {
    let body: any = e?.error;
    if (body instanceof Blob) {
      try { body = JSON.parse(await body.text()); } catch { body = null; }
    }
    if (e?.status === 409 && isAmbiguousReportCardContext(body)) {
      this.pendingPdfAction = action;
      this.ambiguousCandidates = body.candidates;
    } else if (e?.status === 403) {
      this.toast.error('Report card unavailable', body?.message || 'This report card is not available yet.');
    } else if (e?.status === 404) {
      this.toast.info('No results yet', body?.message || 'There are no results to put on this report card yet.');
    } else {
      this.logger.error('Report card PDF failed', e);
      this.toast.error('PDF Failed', 'Could not generate the report card PDF. Please try again.');
    }
    this.cdr.markForCheck();
  }

  /**
   * Back returns to where the card was opened from with that page's selection intact. With
   * in-app history, step back (the previous page keeps its selection in its URL, so browser Back
   * behaves the same); opened directly — e.g. a new tab — fall back to the caller's returnUrl.
   */
  goBack(): void {
    if (this.router.lastSuccessfulNavigation?.previousNavigation) {
      this.location.back();
      return;
    }
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    // Only an in-app dashboard path is accepted — never an external or protocol-relative URL.
    if (returnUrl && returnUrl.startsWith('/dashboard/') && !returnUrl.startsWith('//')) {
      this.router.navigateByUrl(returnUrl);
      return;
    }
    this.location.back();
  }

  private buildSampleData(): ReportCardData {
    const sections: TemplateSection[] = [
      { sectionType: 'SCHOOL_HEADER',      enabled: true, displayOrder: 1 },
      { sectionType: 'STUDENT_INFO',       enabled: true, displayOrder: 2 },
      { sectionType: 'MARKS_TABLE',        enabled: true, displayOrder: 3 },
      { sectionType: 'ASSESSMENT_SUMMARY', enabled: true, displayOrder: 4 },
      { sectionType: 'ATTENDANCE',         enabled: true, displayOrder: 5 },
      { sectionType: 'CO_SCHOLASTIC',      enabled: true, displayOrder: 6 },
      { sectionType: 'TEACHER_REMARKS',    enabled: true, displayOrder: 7 },
      { sectionType: 'PRINCIPAL_REMARKS',  enabled: true, displayOrder: 8 },
      { sectionType: 'PROMOTION_STATUS',   enabled: true, displayOrder: 9 },
      { sectionType: 'SIGNATURES',         enabled: true, displayOrder: 10 },
    ];
    const examColumns: ExamColumn[] = [
      { examId: 1, examName: 'Half-Yearly', maxTotal: 80, weightage: 1.0 },
    ];
    const subjectRows: SubjectRow[] = [
      { subjectName: 'Computer', examMarks: [
          { obtained: 78, max: 80, percentage: 97.5 },
        ], weightedPercentage: 97.5, grade: 'A1' },
      { subjectName: 'General Knowledge', examMarks: [
          { obtained: 71, max: 80, percentage: 88.75 },
        ], weightedPercentage: 88.75, grade: 'A2' },
      { subjectName: 'Mathematics', examMarks: [
          { obtained: 75, max: 80, percentage: 93.75 },
        ], weightedPercentage: 93.75, grade: 'A1' },
    ];
    return {
      studentId: 'S102',
      studentName: 'Himani',
      rollNumber: 'S102',
      className: 'II',
      sectionName: 'A',
      session: '2026-2027',
      dateOfBirth: '29 Jun 2015',
      schoolName: 'Indra Academy',
      affiliationNumber: '2130456',
      schoolCode: '41207',
      schoolCity: 'Lucknow 226001',
      gradingSystem: 'CBSE',
      cgpa: 9.7,
      overallGrade: 'A1',
      template: {
        id: -1,
        schoolId: 0,
        name: 'Sample Template',
        assessmentGroupId: 0,
        assessmentGroupName: 'Half-Yearly Assessment',
        isDefault: true,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        sections,
        brandingJson: JSON.stringify({
          showCgpa: true,
          schoolMotto: 'Scientia · Disciplina · Servitium',
          examTerm: 'Half-Yearly',
        } as BrandingConfig),
      },
      weightedResult: {
        groupId: 0,
        groupName: 'Half-Yearly Assessment',
        groupType: 'EXAM_BASED',
        weightedPercentage: 93.3,
        rank: 0,
        subjectResults: [],
        marksTable: {
          examColumns,
          subjectRows,
          examTotals: [
            { obtained: 224, max: 240 },
          ],
        },
      },
      attendance: {
        workingDays: 200,
        presentDays: 188,
        percentage: 94,
      },
      teacherRemarks: 'Himani is a diligent and curious learner who participates wholeheartedly.',
      principalRemarks: 'A commendable performance. Promoted with distinction.',
      coScholasticGrades: [
        { activity: 'Work Education',      grade: 'A' },
        { activity: 'Art Education',       grade: 'A' },
        { activity: 'Health & Phys. Edu.', grade: 'A' },
      ],
    };
  }

  trackByExamId(index: number, exam: ExamResult): number { return exam.examId; }
  trackByIndex(index: number): number { return index; }
  trackBySection(index: number, section: TemplateSection): string { return section.sectionType; }
}
