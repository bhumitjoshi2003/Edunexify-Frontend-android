import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Inject, OnDestroy, OnInit, PLATFORM_ID } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { interval, Observable, of, Subject, takeUntil } from 'rxjs';
import { map } from 'rxjs/operators';
import { AuthStateService } from '../../auth/auth-state.service';
import {
  ASSESSMENT_ATTACHMENT_MAX_BYTES,
  ASSESSMENT_ATTACHMENT_TYPES,
  ASSESSMENT_INSTRUCTIONS_MAX,
  ASSESSMENT_SYLLABUS_MAX,
  ASSESSMENT_TITLE_MAX,
  ASSESSMENT_TYPES,
  Assessment,
  AssessmentAttachmentRef,
  AssessmentContextClass,
  AssessmentContextSection,
  AssessmentType,
  assessmentClassLabel,
  assessmentDateKey,
  assessmentTimeRange,
  assessmentTypeMeta,
  countdownLabel,
  countdownTone,
  dateParts,
  daysUntil,
} from '../../interfaces/assessment';
import { formatFileSize } from '../../interfaces/homework';
import { AssessmentService } from '../../services/assessment.service';
import { ToastService } from '../../services/toast.service';
import { LoggerService } from '../../services/logger.service';

export type AssessmentManageTab = 'upcoming' | 'past';

interface TabState {
  loaded: boolean;
  loading: boolean;
  failed: boolean;
  items: Assessment[];
}

/** The form's single attachment: the one already on the assessment, or a newly picked file. */
export interface AssessmentFormAttachment {
  kind: 'existing' | 'new';
  fileName: string;
  isPdf: boolean;
  size: number;
  objectKey?: string;
  file?: File;
  previewUrl: string | null;
}

interface FormState {
  mode: 'create' | 'edit';
  assessment: Assessment | null;
  type: AssessmentType;
  title: string;
  classId: number | null;
  /** '' = not chosen, 'whole' = the whole class, otherwise the section id. */
  sectionKey: string;
  subject: string;
  date: string;
  start: string;
  end: string;
  syllabus: string;
  instructions: string;
  attachment: AssessmentFormAttachment | null;
  saving: boolean;
}

@Component({
  selector: 'app-assessment-manage',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './assessment-manage.component.html',
  styleUrl: './assessment-manage.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssessmentManageComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  readonly types = ASSESSMENT_TYPES;
  readonly typeMeta = assessmentTypeMeta;
  readonly classLabel = assessmentClassLabel;
  readonly timeRange = assessmentTimeRange;
  readonly parts = dateParts;
  readonly fileSize = formatFileSize;
  readonly acceptTypes = ASSESSMENT_ATTACHMENT_TYPES.join(',');
  readonly titleMax = ASSESSMENT_TITLE_MAX;
  readonly syllabusMax = ASSESSMENT_SYLLABUS_MAX;
  readonly instructionsMax = ASSESSMENT_INSTRUCTIONS_MAX;
  readonly skeletons = [0, 1, 2];
  readonly tabs: { key: AssessmentManageTab; label: string; icon: string }[] = [
    { key: 'upcoming', label: 'Upcoming', icon: 'event_upcoming' },
    { key: 'past', label: 'Past', icon: 'history' },
  ];

  readonly isAdmin: boolean;
  contexts: AssessmentContextClass[] = [];
  contextsLoaded = false;
  active: AssessmentManageTab = 'upcoming';
  state: Record<AssessmentManageTab, TabState> = {
    upcoming: { loaded: false, loading: false, failed: false, items: [] },
    past: { loaded: false, loading: false, failed: false, items: [] },
  };
  /** Refreshed every minute so countdowns roll over at midnight. */
  now = new Date();

  form: FormState | null = null;
  today = assessmentDateKey(new Date());
  dragOver = false;
  private localPreviewUrl: string | null = null;

  constructor(
    private assessments: AssessmentService,
    authState: AuthStateService,
    private toast: ToastService,
    private logger: LoggerService,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: object,
  ) {
    const role = authState.getUser()?.role;
    // The Principal schedules for the whole school, exactly like an Admin.
    this.isAdmin = role === 'ADMIN' || role === 'PRINCIPAL';
  }

  ngOnInit(): void {
    this.select('upcoming');
    this.loadContexts();
    if (isPlatformBrowser(this.platformId)) {
      interval(60_000).pipe(takeUntil(this.destroy$)).subscribe(() => {
        this.now = new Date();
        this.today = assessmentDateKey(this.now);
        this.cdr.markForCheck();
      });
    }
  }

  // ─── Loading ───────────────────────────────────────────────────────

  loadContexts(): void {
    this.assessments.contexts().pipe(takeUntil(this.destroy$)).subscribe({
      next: contexts => {
        this.contexts = contexts;
        this.contextsLoaded = true;
        this.cdr.markForCheck();
      },
      error: error => {
        this.logger.error('Assessment contexts load failed:', error);
        this.contextsLoaded = true;
        this.cdr.markForCheck();
      },
    });
  }

  select(tab: AssessmentManageTab): void {
    this.active = tab;
    if (!this.state[tab].loaded && !this.state[tab].loading) this.load(tab);
  }

  load(tab: AssessmentManageTab): void {
    const s = this.state[tab];
    s.loading = true;
    s.failed = false;
    this.cdr.markForCheck();
    this.assessments.manage(tab).pipe(takeUntil(this.destroy$)).subscribe({
      next: items => {
        s.items = items;
        s.loaded = true;
        s.loading = false;
        this.cdr.markForCheck();
      },
      error: error => {
        this.logger.error(`Assessments (${tab}) load failed:`, error);
        s.loading = false;
        s.failed = true;
        this.cdr.markForCheck();
      },
    });
  }

  get tabIndex(): number {
    return this.tabs.findIndex(t => t.key === this.active);
  }

  get thisWeekCount(): number {
    return this.state.upcoming.items.filter(a => daysUntil(a.assessmentDate, this.now) <= 7).length;
  }

  /** "Created by you" / "Created by Admin" / "Created by <teacher>". */
  sourceLabel(item: Assessment): string {
    if (item.createdByCurrentUser) return 'Created by you';
    if (item.createdByRole === 'ADMIN') return 'Created by Admin';
    if (item.createdByRole === 'PRINCIPAL') return 'Created by Principal';
    return `Created by ${item.createdByName || 'another teacher'}`;
  }

  countdown(item: Assessment): string {
    return countdownLabel(item.assessmentDate, this.now);
  }

  countdownTone(item: Assessment): string {
    return countdownTone(item.assessmentDate, this.now);
  }

  // ─── Form ──────────────────────────────────────────────────────────

  openCreate(): void {
    if (!this.contexts.length) return;
    this.form = {
      mode: 'create', assessment: null, type: 'CLASS_TEST', title: '', classId: null, sectionKey: '', subject: '',
      date: '', start: '', end: '', syllabus: '', instructions: '', attachment: null, saving: false,
    };
    if (this.contexts.length === 1) this.selectClass(this.contexts[0]);
  }

  openEdit(item: Assessment): void {
    const file = item.attachment;
    this.form = {
      mode: 'edit', assessment: item, type: item.assessmentType, title: item.title, classId: item.classId,
      sectionKey: item.sectionId == null ? 'whole' : String(item.sectionId), subject: item.subjectName,
      date: item.assessmentDate, start: (item.startTime ?? '').slice(0, 5), end: (item.endTime ?? '').slice(0, 5),
      syllabus: item.syllabus, instructions: item.instructions ?? '', saving: false,
      attachment: file && file.objectKey ? {
        kind: 'existing', fileName: file.fileName, isPdf: file.type === 'PDF', size: file.fileSize,
        objectKey: file.objectKey, previewUrl: file.type === 'IMAGE' ? file.url : null,
      } : null,
    };
  }

  closeForm(): void {
    this.form = null;
    this.releasePreview();
  }

  get selectedClass(): AssessmentContextClass | undefined {
    return this.contexts.find(c => c.classId === this.form?.classId);
  }

  get selectedSection(): AssessmentContextSection | undefined {
    const key = this.form?.sectionKey;
    return key ? this.selectedClass?.sections.find(s => this.sectionKey(s) === key) : undefined;
  }

  sectionKey(section: AssessmentContextSection): string {
    return section.sectionId == null ? 'whole' : String(section.sectionId);
  }

  selectClass(context: AssessmentContextClass): void {
    const form = this.form;
    if (!form) return;
    form.classId = context.classId;
    form.sectionKey = '';
    form.subject = '';
    if (context.sections.length === 1) this.selectSection(context.sections[0]);
  }

  selectSection(section: AssessmentContextSection): void {
    const form = this.form;
    if (!form) return;
    form.sectionKey = this.sectionKey(section);
    if (!section.subjects.some(s => s.toLowerCase() === form.subject.toLowerCase())) {
      form.subject = section.subjects.length === 1 ? section.subjects[0] : '';
    }
  }

  get canSave(): boolean {
    const f = this.form;
    if (!f || f.saving || !f.title.trim() || !f.syllabus.trim() || !f.date) return false;
    return f.mode === 'edit' || (!!this.selectedSection && !!f.subject.trim());
  }

  save(): void {
    const form = this.form;
    if (!form || !this.canSave) return;
    if (form.end && !form.start) {
      this.toast.warning('Check the time', 'Add a start time before an end time.');
      return;
    }
    if (form.start && form.end && form.end <= form.start) {
      this.toast.warning('Check the time', 'The end time must be after the start time.');
      return;
    }
    const dateChanged = form.mode === 'create' || form.date !== form.assessment!.assessmentDate;
    if (dateChanged && form.date < this.today) {
      this.toast.warning('Check the date', 'The date cannot be in the past.');
      return;
    }
    form.saving = true;
    this.cdr.markForCheck();
    this.uploadedRef(form.attachment).pipe(takeUntil(this.destroy$)).subscribe({
      next: attachment => this.submit(form, attachment),
      error: error => this.failSave(form, 'Unable to upload the attachment', error),
    });
  }

  private uploadedRef(attachment: AssessmentFormAttachment | null): Observable<AssessmentAttachmentRef | null> {
    if (!attachment) return of(null);
    if (attachment.kind === 'existing') return of({ objectKey: attachment.objectKey!, fileName: attachment.fileName });
    return this.assessments.uploadAttachmentDirect(attachment.file!)
      .pipe(map(uploaded => ({ objectKey: uploaded.objectKey, fileName: attachment.fileName })));
  }

  private submit(form: FormState, attachment: AssessmentAttachmentRef | null): void {
    const common = {
      assessmentType: form.type, title: form.title.trim(), assessmentDate: form.date,
      startTime: form.start || null, endTime: form.end || null, syllabus: form.syllabus.trim(),
      instructions: form.instructions.trim() || null, attachment,
    };
    const section = this.selectedSection;
    const request$ = form.mode === 'create'
      ? this.assessments.create({ ...common, classId: form.classId!, sectionId: section?.sectionId ?? null, subjectName: form.subject.trim() })
      : this.assessments.update(form.assessment!.id, common);
    request$.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.toast.success(form.mode === 'create' ? 'Scheduled' : 'Saved',
          form.mode === 'create' ? 'Students in this class have been notified.' : 'Your changes have been saved.');
        this.closeForm();
        this.refresh();
      },
      error: error => this.failSave(form, form.mode === 'create' ? 'Unable to schedule' : 'Unable to save', error),
    });
  }

  /** After a save the item may move between Upcoming and Past, so reload the open tab and mark the other stale. */
  private refresh(): void {
    const other: AssessmentManageTab = this.active === 'upcoming' ? 'past' : 'upcoming';
    this.state[other].loaded = false;
    this.load(this.active);
  }

  private failSave(form: FormState, title: string, error: any): void {
    this.logger.error(title, error);
    form.saving = false;
    this.toast.error(title, error?.error?.message || error?.error?.detail || 'Please try again in a moment.');
    this.cdr.markForCheck();
  }

  async remove(item: Assessment): Promise<void> {
    const confirmed = await this.toast.confirm({
      title: 'Delete this assessment?',
      message: 'Students will no longer see it and no reminder will be sent. This cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      danger: true,
      icon: 'danger',
    });
    if (!confirmed) return;
    this.assessments.delete(item.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        for (const key of ['upcoming', 'past'] as AssessmentManageTab[]) {
          this.state[key].items = this.state[key].items.filter(a => a.id !== item.id);
        }
        this.toast.success('Deleted', 'The assessment has been removed.');
        this.cdr.markForCheck();
      },
      error: error => {
        this.logger.error('Assessment delete failed:', error);
        this.toast.error('Unable to delete', error?.error?.message || 'Please try again in a moment.');
      },
    });
  }

  // ─── Attachment ────────────────────────────────────────────────────

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) this.acceptFile(file);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (!this.dragOver) {
      this.dragOver = true;
      this.cdr.markForCheck();
    }
  }

  onDragLeave(): void {
    this.dragOver = false;
    this.cdr.markForCheck();
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver = false;
    const file = event.dataTransfer?.files?.[0];
    if (file) this.acceptFile(file);
    this.cdr.markForCheck();
  }

  private acceptFile(file: File): void {
    const form = this.form;
    if (!form) return;
    if (!ASSESSMENT_ATTACHMENT_TYPES.includes(file.type)) {
      this.toast.error('Unsupported file', `${file.name}: attach a JPG, PNG, WebP image or a PDF.`);
      return;
    }
    if (file.size > ASSESSMENT_ATTACHMENT_MAX_BYTES) {
      this.toast.error('File too large', `${file.name}: attachments must be 10 MB or smaller.`);
      return;
    }
    this.releasePreview();
    const isPdf = file.type === 'application/pdf';
    form.attachment = { kind: 'new', fileName: file.name, isPdf, size: file.size, file, previewUrl: isPdf ? null : this.localPreview(file) };
    this.cdr.markForCheck();
  }

  removeAttachment(): void {
    if (!this.form) return;
    this.form.attachment = null;
    this.releasePreview();
    this.cdr.markForCheck();
  }

  trackById(_: number, item: Assessment): number {
    return item.id;
  }

  private localPreview(file: File): string | null {
    if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return null;
    this.localPreviewUrl = URL.createObjectURL(file);
    return this.localPreviewUrl;
  }

  private releasePreview(): void {
    if (this.localPreviewUrl) URL.revokeObjectURL(this.localPreviewUrl);
    this.localPreviewUrl = null;
  }

  ngOnDestroy(): void {
    this.releasePreview();
    this.destroy$.next();
    this.destroy$.complete();
  }
}
