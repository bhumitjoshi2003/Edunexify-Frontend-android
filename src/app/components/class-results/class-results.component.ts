import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { MarksService, ClassStudentResult, ClassStudentSubject } from '../../services/marks.service';
import { ExamConfigService, ExamConfig, ExamSubjectEntry, isPublished } from '../../services/exam-config.service';
import { ToastService } from '../../services/toast.service';
import { AuthStateService } from '../../auth/auth-state.service';
import { TeacherService } from '../../services/teacher.service';
import { AcademicSessionService } from '../../services/academic-session.service';
import { LoggerService } from '../../services/logger.service';
import { SchoolService, SchoolClass } from '../../services/school.service';
import { SectionService } from '../../services/section.service';
import { Section } from '../../interfaces/section';

@Component({
  selector: 'app-class-results',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './class-results.component.html',
  styleUrl: './class-results.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClassResultsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  role = '';
  classOptions: string[] = [];
  sessions: string[] = [];
  managedClasses: SchoolClass[] = [];
  sections: Section[] = [];
  selectedSectionId: number | null = null;
  showClassDropdown: boolean = true;

  selectedSession = '';
  selectedClass = '';
  exams: ExamConfig[] = [];
  selectedExamId: number | null = null;
  examSubjects: ExamSubjectEntry[] = [];

  results: ClassStudentResult[] = [];
  loading = false;
  publishing = false;

  /**
   * Selection restored from the URL (?session&className&examId&sectionId) — e.g. coming Back from
   * a report card. Applied once, after the exam list loads; the URL is the only place it lives.
   */
  private restore: { examId: number | null; sectionId: number | null } | null = null;

  constructor(
    private marksService: MarksService,
    private examService: ExamConfigService,
    private authState: AuthStateService,
    private teacherService: TeacherService,
    private academicSessionService: AcademicSessionService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private logger: LoggerService,
    private schoolService: SchoolService,
    private sectionService: SectionService,
    private toast: ToastService,
    private route: ActivatedRoute
  ) { }

  ngOnInit(): void {
    const user = this.authState.getUser();
    this.role = user?.role ?? '';
    const q = this.route.snapshot.queryParamMap;
    const urlSession = q.get('session');
    const urlClass = q.get('className');
    const examParam = Number(q.get('examId'));
    const sectionParam = Number(q.get('sectionId'));
    this.restore = {
      examId: Number.isInteger(examParam) && examParam > 0 ? examParam : null,
      sectionId: Number.isInteger(sectionParam) && sectionParam > 0 ? sectionParam : null,
    };

    this.schoolService.getClasses().pipe(takeUntil(this.destroy$)).subscribe({
      next: classes => { this.classOptions = classes; this.cdr.markForCheck(); },
      error: (err) => this.logger.error('Failed to load classes', err)
    });
    this.schoolService.getManagedClasses().pipe(takeUntil(this.destroy$)).subscribe({
      next: classes => { this.managedClasses = classes; },
      error: (err) => this.logger.error('Failed to load managed classes', err)
    });

    this.academicSessionService.getAllSessions().pipe(takeUntil(this.destroy$)).subscribe({
      next: sessions => {
        this.sessions = sessions.map(s => s.label);
        const current = sessions.find(s => s.current);
        this.selectedSession = urlSession && this.sessions.includes(urlSession)
          ? urlSession
          : current ? current.label : (this.sessions[0] ?? '');
        this.cdr.markForCheck();
        this.initAfterSettings(user, urlClass);
      },
      error: (e) => {
        this.logger.error('Failed to load sessions', e);
        this.initAfterSettings(user);
      }
    });
  }

  private initAfterSettings(user: { userId: string; role: string } | null, urlClass: string | null = null): void {
    if (this.role === 'TEACHER') {
      // Issue #44: Lock teacher to their assigned class — no dropdown shown
      this.showClassDropdown = false;
      this.teacherService.getTeacher(user!.userId).pipe(takeUntil(this.destroy$)).subscribe({
        next: (t) => {
          this.selectedClass = t.classTeacher ?? '';
          this.cdr.markForCheck();
          if (this.selectedClass) {
            this.loadSectionsForClass(this.selectedClass);
            this.loadExams();
          }
        },
        error: (e) => this.logger.error('Error fetching teacher:', e),
      });
    } else {
      this.showClassDropdown = true;
      // A teacher's class is always their own; only admins restore a class from the URL.
      this.selectedClass = urlClass || (this.classOptions.length > 0 ? this.classOptions[0] : '1');
      this.loadSectionsForClass(this.selectedClass);
      this.loadExams();
    }
  }

  loadSectionsForClass(className: string): void {
    const cls = this.managedClasses.find(c => c.name === className);
    if (!cls) return;
    this.sectionService.getSectionsForClass(cls.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: sections => { this.sections = sections; this.cdr.markForCheck(); },
      error: (err) => this.logger.error('Failed to load sections', err)
    });
  }

  onSectionSelect(sectionId: number | null): void {
    this.selectedSectionId = sectionId;
    this.syncUrl();
    this.results = [];
    if (this.selectedExamId) this.loadResults();
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadExams(): void {
    this.exams = [];
    this.selectedExamId = null;
    this.results = [];
    this.examSubjects = [];
    this.selectedSectionId = null;
    this.sections = [];
    this.loadSectionsForClass(this.selectedClass);

    this.examService.getExams(this.selectedSession, this.selectedClass)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.exams = data;
          const restore = this.restore;
          this.restore = null;
          if (restore?.examId && data.some(e => e.id === restore.examId)) {
            this.selectedExamId = restore.examId;
            // Teachers always see their own section (the server enforces it); admins keep theirs.
            if (!this.isTeacher) this.selectedSectionId = restore.sectionId;
            this.onExamChange();
          } else {
            this.syncUrl();
          }
          this.cdr.markForCheck();
        },
        error: (e) => this.logger.error('Error loading exams:', e),
      });
  }

  /** Mirrors the selection into the URL (replacing the entry) so Back from a report card restores it. */
  private syncUrl(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        session: this.selectedSession || null,
        className: this.selectedClass || null,
        examId: this.selectedExamId,
        sectionId: this.selectedSectionId,
      },
      replaceUrl: true,
    });
  }

  onExamChange(): void {
    this.results = [];
    this.examSubjects = [];
    this.syncUrl();
    if (!this.selectedExamId) return;
    this.examService.getExamSubjects(this.selectedExamId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => { this.examSubjects = data; this.cdr.markForCheck(); this.loadResults(); },
        error: (e) => this.logger.error('Error loading exam subjects:', e),
      });
  }

  loadResults(): void {
    if (!this.selectedExamId) return;
    this.loading = true;
    this.marksService.getClassResults(this.selectedClass, this.selectedExamId, this.selectedSectionId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.results = data;
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: (e) => {
          this.logger.error('Error loading class results:', e);
          this.loading = false;
          this.cdr.markForCheck();
        },
      });
  }

  get isAdmin(): boolean { return this.role === 'ADMIN'; }
  get isTeacher(): boolean { return this.role === 'TEACHER'; }

  get selectedExam(): ExamConfig | null {
    return this.exams.find(e => e.id === this.selectedExamId) ?? null;
  }

  get examPublished(): boolean { return isPublished(this.selectedExam); }

  isExamPublished(exam: ExamConfig): boolean { return isPublished(exam); }

  get completeCount(): number { return this.results.filter(r => r.complete).length; }
  get incompleteCount(): number { return this.results.filter(r => !r.complete).length; }
  get passCount(): number { return this.results.filter(r => r.passed === true).length; }

  /** ADMIN only (the server enforces it too): show results to students/parents and lock marks. */
  async publish(): Promise<void> {
    const exam = this.selectedExam;
    if (!exam || !this.isAdmin || this.publishing) return;
    const missing = this.incompleteCount;
    const confirmed = await this.toast.confirm({
      title: 'Publish Results',
      message: `Students and parents will see the results of ${exam.examName}, and marks will be locked until you unpublish.`
        + (missing ? ` ${missing} student(s) still have marks missing — their results will show as incomplete.` : ''),
      confirmText: 'Yes, Publish',
      cancelText: 'Cancel',
      danger: false,
    });
    if (!confirmed) return;
    this.changeStatus(this.examService.publishResults(exam.id), 'Results Published', `${exam.examName} results are now visible to students and parents.`);
  }

  async unpublish(): Promise<void> {
    const exam = this.selectedExam;
    if (!exam || !this.isAdmin || this.publishing) return;
    const confirmed = await this.toast.confirm({
      title: 'Unpublish Results',
      message: `${exam.examName} results will be hidden from students and parents immediately, and marks can be edited again.`,
      confirmText: 'Yes, Unpublish',
      cancelText: 'Cancel',
      danger: true,
    });
    if (!confirmed) return;
    this.changeStatus(this.examService.unpublishResults(exam.id), 'Results Unpublished', `${exam.examName} results are hidden again.`);
  }

  private changeStatus(request$: import('rxjs').Observable<ExamConfig>, title: string, message: string): void {
    this.publishing = true;
    this.cdr.markForCheck();
    request$.pipe(takeUntil(this.destroy$)).subscribe({
      next: updated => {
        this.publishing = false;
        this.exams = this.exams.map(e => e.id === updated.id ? { ...e, ...updated } : e);
        this.toast.success(title, message);
        this.loadResults();
      },
      error: err => {
        this.publishing = false;
        this.logger.error('Error changing result status:', err);
        this.toast.error('Could not change status', err?.error?.message || 'Please try again.');
        this.cdr.markForCheck();
      },
    });
  }

  getMarks(student: ClassStudentResult, subjectName: string): number | null {
    return student.subjects.find(s => s.subjectName === subjectName)?.marksObtained ?? null;
  }

  isEnrolled(student: ClassStudentResult, subjectName: string): boolean {
    return student.subjects.some(s => s.subjectName === subjectName);
  }

  openReportCard(studentId: string, examId: number | null): void {
    const queryParams: Record<string, string> = {
      studentId,
      session: this.selectedSession,
      // Fallback for Back when the card has no in-app history (e.g. opened in a new tab).
      returnUrl: this.router.url,
    };
    if (examId !== null) queryParams['examId'] = String(examId);
    this.router.navigate(['/dashboard/report-card'], { queryParams });
  }

  trackById(index: number, item: { id: number }): number { return item.id; }
  trackByStudentId(index: number, s: ClassStudentResult): string { return s.studentId; }
  trackByIndex(index: number): number { return index; }
}
