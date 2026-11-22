import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Inject, OnDestroy, OnInit, PLATFORM_ID } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute } from '@angular/router';
import { forkJoin, interval, Observable, of, Subject, takeUntil } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { AuthStateService } from '../../auth/auth-state.service';
import {
  HOMEWORK_ATTACHMENT_MAX_BYTES,
  HOMEWORK_ATTACHMENT_TYPES,
  HOMEWORK_MAX_ATTACHMENTS,
  HomeworkAttachmentRef,
  HomeworkClasswork,
  HomeworkPeriod,
  dueLabel,
  formatFileSize,
  homeworkClassLabel,
  homeworkKind,
  localDateKey,
} from '../../interfaces/homework';
import { HomeworkService } from '../../services/homework.service';
import { TimetableService } from '../../services/timetable.service';
import { TeacherSubstitutionService } from '../../services/teacher-substitution.service';
import { ToastService } from '../../services/toast.service';
import { LoggerService } from '../../services/logger.service';
import { todayDayCode } from '../../utils/teacher-timetable-today.util';
import { Guidance } from '../../guidance/guidance';
import { GuidanceComponent } from '../guidance/guidance.component';

/** One entry in the form's attachment list: already on the post, or newly picked. */
export interface FormAttachment {
  id: string;
  kind: 'existing' | 'new';
  fileName: string;
  isPdf: boolean;
  size: number;
  /** Existing: the stored object key. */
  objectKey?: string;
  /** New: the picked file (uploaded on save). */
  file?: File;
  /** Image thumbnail: the stored URL, or a local object URL for a new image. */
  previewUrl: string | null;
}

interface FormState {
  mode: 'create' | 'edit';
  period: HomeworkPeriod | null;
  work: HomeworkClasswork | null;
  classwork: string;
  homework: string;
  dueDate: string;
  attachments: FormAttachment[];
  saving: boolean;
}

@Component({
  selector: 'app-teacher-homework',
  standalone: true,
  imports: [GuidanceComponent, CommonModule, FormsModule, MatIconModule],
  templateUrl: './teacher-homework.component.html',
  styleUrl: './teacher-homework.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeacherHomeworkComponent implements OnInit, OnDestroy {
  /** A failed load, with Retry — never shown as an empty day. */
  readonly loadErrorGuidance: Guidance = { kind: 'load-error', title: 'Couldn\'t load homework & classwork', message: 'Please check your connection and try again.' };
  readonly noPeriodsGuidance: Guidance = {
    kind: 'empty', title: 'No periods for you today',
    message: 'Homework and classwork are posted from your periods. They appear here on days you teach.',
    actions: [{ label: 'Open Timetable', path: 'timetable', for: ['TEACHER'] }],
  };

  private readonly destroy$ = new Subject<void>();
  readonly classLabel = homeworkClassLabel;
  readonly kind = homeworkKind;
  readonly due = dueLabel;
  readonly fileSize = formatFileSize;
  readonly acceptTypes = HOMEWORK_ATTACHMENT_TYPES.join(',');
  readonly maxAttachments = HOMEWORK_MAX_ATTACHMENTS;
  readonly skeletons = [0, 1, 2];

  readonly today = localDateKey(new Date());
  periods: HomeworkPeriod[] = [];
  todayPosts: HomeworkClasswork[] = [];
  recent: HomeworkClasswork[] = [];
  loading = true;
  failed = false;

  form: FormState | null = null;
  dragOver = false;
  /** Refreshed every minute so relative times stay live. */
  now = Date.now();
  private pendingEntryId: number | null = null;
  private localPreviewUrls: string[] = [];
  private nextAttachmentId = 0;

  constructor(
    private homework: HomeworkService,
    private timetable: TimetableService,
    private substitutions: TeacherSubstitutionService,
    private authState: AuthStateService,
    private route: ActivatedRoute,
    private toast: ToastService,
    private logger: LoggerService,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: object,
  ) {}

  ngOnInit(): void {
    const entry = Number(this.route.snapshot.queryParamMap.get('entry'));
    this.pendingEntryId = Number.isFinite(entry) && entry > 0 ? entry : null;
    this.load();
    if (isPlatformBrowser(this.platformId)) {
      interval(60_000).pipe(takeUntil(this.destroy$)).subscribe(() => {
        this.now = Date.now();
        this.cdr.markForCheck();
      });
    }
  }

  load(): void {
    const teacherId = this.authState.getUser()?.userId;
    if (!teacherId) return;
    this.loading = true;
    this.failed = false;
    this.cdr.markForCheck();
    forkJoin({
      timetable: this.timetable.getTeacherTimetable(teacherId),
      covers: this.substitutions.getMine(this.today).pipe(catchError(error => {
        this.logger.error('Cover periods unavailable for homework page:', error);
        return of([]);
      })),
      todayPosts: this.homework.myPostsOn(this.today),
      recent: this.homework.myRecent(),
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: ({ timetable, covers, todayPosts, recent }) => {
        const day = todayDayCode(new Date());
        const own: HomeworkPeriod[] = timetable
          .filter(e => e.day === day && e.id != null)
          .map(e => ({
            timetableEntryId: e.id!, className: e.className, sectionName: e.sectionName ?? null,
            subjectName: e.subjectName, periodNumber: e.periodNumber, startTime: e.startTime ?? null,
            endTime: e.endTime ?? null, isSubstitution: false,
          }));
        const covered: HomeworkPeriod[] = covers
          .filter(c => c.status === 'ACTIVE')
          .map(c => ({
            timetableEntryId: c.timetableEntryId, className: c.className, sectionName: c.sectionName ?? null,
            subjectName: c.subjectName, periodNumber: c.periodNumber, startTime: c.startTime ?? null,
            endTime: c.endTime ?? null, isSubstitution: true,
          }));
        this.periods = [...own, ...covered].sort((a, b) =>
          (a.startTime ?? '').localeCompare(b.startTime ?? '') || a.periodNumber - b.periodNumber);
        this.todayPosts = todayPosts;
        this.recent = recent;
        this.loading = false;
        this.openPendingEntry();
        this.cdr.markForCheck();
      },
      error: error => {
        this.logger.error('Homework page load failed:', error);
        this.loading = false;
        this.failed = true;
        this.cdr.markForCheck();
      },
    });
  }

  get postedCount(): number {
    return this.periods.filter(p => this.postFor(p)).length;
  }

  get pendingCount(): number {
    return this.periods.length - this.postedCount;
  }

  /** Share of today's periods already posted, 0–100. */
  get progress(): number {
    return this.periods.length ? Math.round((this.postedCount / this.periods.length) * 100) : 0;
  }

  /** One of six colour themes, stable per subject. */
  tone(subject: string | null | undefined): number {
    const key = (subject || '').toLowerCase();
    let hash = 0;
    for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
    return Math.abs(hash) % 6;
  }

  initials(subject: string | null | undefined): string {
    const words = (subject || '?').trim().split(/\s+/);
    return (words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2)).toUpperCase();
  }

  /** "Just now", "12m ago", "3h ago", "Yesterday", "4d ago", then the date. */
  relative(iso: string): string {
    const minutes = Math.floor((this.now - new Date(iso).getTime()) / 60_000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }

  /** Colour of a due label: overdue, due today/tomorrow, or later. */
  dueTone(dueDate: string | null): 'overdue' | 'soon' | 'later' {
    const label = this.due(dueDate) ?? '';
    if (label.startsWith('Was due')) return 'overdue';
    return label === 'Due today' || label === 'Due tomorrow' ? 'soon' : 'later';
  }

  postFor(period: HomeworkPeriod): HomeworkClasswork | undefined {
    return this.todayPosts.find(p => p.timetableEntryId === period.timetableEntryId);
  }

  openCreate(period: HomeworkPeriod): void {
    const existing = this.postFor(period);
    if (existing) { this.openEdit(existing, period); return; }
    this.form = { mode: 'create', period, work: null, classwork: '', homework: '', dueDate: '', attachments: [], saving: false };
  }

  openEdit(work: HomeworkClasswork, period: HomeworkPeriod | null = null): void {
    this.form = {
      mode: 'edit', period, work, classwork: work.classwork ?? '', homework: work.homework ?? '',
      dueDate: work.dueDate ?? '', saving: false,
      attachments: work.attachments.filter(a => a.objectKey).map(a => ({
        id: `a${this.nextAttachmentId++}`, kind: 'existing' as const, fileName: a.fileName, isPdf: a.type === 'PDF',
        size: a.fileSize, objectKey: a.objectKey!, previewUrl: a.type === 'IMAGE' ? a.url : null,
      })),
    };
  }

  closeForm(): void {
    this.form = null;
    this.releasePreviews();
  }

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    this.addFiles(files);
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
    this.addFiles(Array.from(event.dataTransfer?.files ?? []));
  }

  private addFiles(files: File[]): void {
    const form = this.form;
    if (!form) return;
    for (const file of files) {
      if (form.attachments.length >= HOMEWORK_MAX_ATTACHMENTS) {
        this.toast.warning('Attachment limit', `A post can have at most ${HOMEWORK_MAX_ATTACHMENTS} attachments.`);
        break;
      }
      if (!HOMEWORK_ATTACHMENT_TYPES.includes(file.type)) {
        this.toast.error('Unsupported file', `${file.name}: attach a JPG, PNG, WebP image or a PDF.`);
        continue;
      }
      if (file.size > HOMEWORK_ATTACHMENT_MAX_BYTES) {
        this.toast.error('File too large', `${file.name}: attachments must be 10 MB or smaller.`);
        continue;
      }
      const isPdf = file.type === 'application/pdf';
      form.attachments = [...form.attachments, {
        id: `a${this.nextAttachmentId++}`, kind: 'new', fileName: file.name, isPdf, size: file.size, file,
        previewUrl: isPdf ? null : this.localPreview(file),
      }];
    }
    this.cdr.markForCheck();
  }

  removeAttachment(attachment: FormAttachment): void {
    if (!this.form) return;
    this.form.attachments = this.form.attachments.filter(a => a.id !== attachment.id);
    if (attachment.kind === 'new' && attachment.previewUrl) this.revoke(attachment.previewUrl);
    this.cdr.markForCheck();
  }

  get canSave(): boolean {
    return !!this.form && !this.form.saving && (!!this.form.classwork.trim() || !!this.form.homework.trim());
  }

  save(): void {
    const form = this.form;
    if (!form) return;
    if (!form.classwork.trim() && !form.homework.trim()) {
      this.toast.warning('Nothing to post', 'Enter classwork, homework, or both.');
      return;
    }
    if (form.homework.trim() && form.dueDate && form.dueDate < (form.work?.workDate ?? this.today)) {
      this.toast.warning('Check the due date', 'The due date cannot be before the class date.');
      return;
    }
    form.saving = true;
    this.cdr.markForCheck();
    this.uploadedRefs(form.attachments).pipe(takeUntil(this.destroy$)).subscribe({
      next: refs => this.submit(form, refs),
      error: error => this.failSave(form, 'Unable to upload attachments', error),
    });
  }

  /** Uploads the new files (in parallel) and returns the full ordered attachment list. */
  private uploadedRefs(attachments: FormAttachment[]): Observable<HomeworkAttachmentRef[]> {
    if (!attachments.length) return of([]);
    return forkJoin(attachments.map(a => a.kind === 'existing'
      ? of({ objectKey: a.objectKey!, fileName: a.fileName })
      : this.homework.uploadAttachmentDirect(a.file!).pipe(map(uploaded => ({ objectKey: uploaded.objectKey, fileName: a.fileName })))));
  }

  private submit(form: FormState, attachments: HomeworkAttachmentRef[]): void {
    const classwork = form.classwork.trim() || null;
    const homework = form.homework.trim() || null;
    const dueDate = homework && form.dueDate ? form.dueDate : null;
    const request$ = form.mode === 'create'
      ? this.homework.create({ timetableEntryId: form.period!.timetableEntryId, classwork, homework, dueDate, attachments })
      : this.homework.update(form.work!.id, { classwork, homework, dueDate, attachments });
    request$.pipe(takeUntil(this.destroy$)).subscribe({
      next: saved => {
        this.upsert(saved);
        this.toast.success(form.mode === 'create' ? 'Posted' : 'Saved',
          form.mode === 'create' ? 'Students in this class have been notified.' : 'Your changes have been saved.');
        this.closeForm();
        this.cdr.markForCheck();
      },
      error: error => this.failSave(form, form.mode === 'create' ? 'Unable to post' : 'Unable to save', error),
    });
  }

  private failSave(form: FormState, title: string, error: any): void {
    this.logger.error(title, error);
    form.saving = false;
    this.toast.error(title, error?.error?.message || error?.error?.detail || 'Please try again in a moment.');
    this.cdr.markForCheck();
  }

  async remove(work: HomeworkClasswork): Promise<void> {
    const confirmed = await this.toast.confirm({
      title: 'Delete this post?',
      message: 'Students will no longer see it or its attachments. This cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      danger: true,
      icon: 'danger',
    });
    if (!confirmed) return;
    this.homework.delete(work.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.todayPosts = this.todayPosts.filter(p => p.id !== work.id);
        this.recent = this.recent.filter(p => p.id !== work.id);
        this.toast.success('Deleted', 'The post has been removed.');
        this.cdr.markForCheck();
      },
      error: error => {
        this.logger.error('Homework delete failed:', error);
        this.toast.error('Unable to delete', error?.error?.message || 'Please try again in a moment.');
      },
    });
  }

  private upsert(saved: HomeworkClasswork): void {
    const replace = (list: HomeworkClasswork[]) => {
      const i = list.findIndex(p => p.id === saved.id);
      return i >= 0 ? list.map(p => (p.id === saved.id ? saved : p)) : [saved, ...list];
    };
    if (saved.workDate === this.today) this.todayPosts = replace(this.todayPosts);
    this.recent = replace(this.recent);
  }

  private openPendingEntry(): void {
    if (this.pendingEntryId == null) return;
    const period = this.periods.find(p => p.timetableEntryId === this.pendingEntryId);
    this.pendingEntryId = null;
    if (period) this.openCreate(period);
  }

  timeRange(period: HomeworkPeriod): string | null {
    return period.startTime && period.endTime ? `${period.startTime}–${period.endTime}` : null;
  }

  trackAttachment(_: number, attachment: FormAttachment): string {
    return attachment.id;
  }

  private localPreview(file: File): string | null {
    if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return null;
    const url = URL.createObjectURL(file);
    this.localPreviewUrls.push(url);
    return url;
  }

  private revoke(url: string): void {
    if (!this.localPreviewUrls.includes(url)) return;
    URL.revokeObjectURL(url);
    this.localPreviewUrls = this.localPreviewUrls.filter(u => u !== url);
  }

  private releasePreviews(): void {
    this.localPreviewUrls.forEach(url => URL.revokeObjectURL(url));
    this.localPreviewUrls = [];
  }

  ngOnDestroy(): void {
    this.releasePreviews();
    this.destroy$.next();
    this.destroy$.complete();
  }
}
