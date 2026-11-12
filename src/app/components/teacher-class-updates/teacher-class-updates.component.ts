import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Inject, OnDestroy, OnInit, PLATFORM_ID } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { forkJoin, interval, Observable, of, Subject, takeUntil } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  CLASS_UPDATE_ATTACHMENT_MAX_BYTES,
  CLASS_UPDATE_ATTACHMENT_TYPES,
  CLASS_UPDATE_MESSAGE_MAX,
  CLASS_UPDATE_TITLE_MAX,
  ClassUpdate,
  ClassUpdateAttachmentRef,
  ClassUpdateContext,
  classUpdateContextKey,
  classUpdateContextLabel,
  toLocalDateTimeInput,
} from '../../interfaces/class-update';
import { formatFileSize, homeworkClassLabel } from '../../interfaces/homework';
import { ClassUpdateService } from '../../services/class-update.service';
import { ToastService } from '../../services/toast.service';
import { LoggerService } from '../../services/logger.service';

/** The form's single attachment: the one already on the update, or a newly picked file. */
export interface ClassUpdateFormAttachment {
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

export type ClassUpdateFilter = 'all' | 'active' | 'expired';

/** A one-tap expiry choice: the end (11:59 PM) of a day relative to today. */
export interface ExpiryPreset {
  label: string;
  value: string;
}

interface FormState {
  mode: 'create' | 'edit';
  update: ClassUpdate | null;
  contextKey: string;
  title: string;
  message: string;
  attachment: ClassUpdateFormAttachment | null;
  /** datetime-local value, '' for no expiry. */
  expiry: string;
  saving: boolean;
}

@Component({
  selector: 'app-teacher-class-updates',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './teacher-class-updates.component.html',
  styleUrl: './teacher-class-updates.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeacherClassUpdatesComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  readonly contextLabel = classUpdateContextLabel;
  readonly contextKey = classUpdateContextKey;
  readonly fileSize = formatFileSize;
  readonly acceptTypes = CLASS_UPDATE_ATTACHMENT_TYPES.join(',');
  readonly titleMax = CLASS_UPDATE_TITLE_MAX;
  readonly messageMax = CLASS_UPDATE_MESSAGE_MAX;
  readonly classLabel = homeworkClassLabel;
  readonly skeletons = [0, 1, 2];
  readonly filters: { key: ClassUpdateFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'active', label: 'Active' },
    { key: 'expired', label: 'Expired' },
  ];

  contexts: ClassUpdateContext[] = [];
  recent: ClassUpdate[] = [];
  loading = true;
  failed = false;
  filter: ClassUpdateFilter = 'all';
  /** Refreshed every minute so relative times and expiry countdowns stay live. */
  now = Date.now();
  private readonly expanded = new Set<number>();

  form: FormState | null = null;
  presets: ExpiryPreset[] = [];
  dragOver = false;
  minExpiry = toLocalDateTimeInput(new Date());
  private localPreviewUrl: string | null = null;

  constructor(
    private classUpdates: ClassUpdateService,
    private toast: ToastService,
    private logger: LoggerService,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: object,
  ) {}

  ngOnInit(): void {
    this.load();
    if (isPlatformBrowser(this.platformId)) {
      interval(60_000).pipe(takeUntil(this.destroy$)).subscribe(() => {
        this.now = Date.now();
        this.cdr.markForCheck();
      });
    }
  }

  load(): void {
    this.loading = true;
    this.failed = false;
    this.cdr.markForCheck();
    forkJoin({ contexts: this.classUpdates.myContexts(), recent: this.classUpdates.myRecent() })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ contexts, recent }) => {
          this.contexts = contexts;
          this.recent = recent;
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: error => {
          this.logger.error('Class updates page load failed:', error);
          this.loading = false;
          this.failed = true;
          this.cdr.markForCheck();
        },
      });
  }

  openCreate(): void {
    if (!this.contexts.length) return;
    this.refreshExpiryChoices();
    this.form = {
      mode: 'create', update: null, contextKey: this.contexts.length === 1 ? classUpdateContextKey(this.contexts[0]) : '',
      title: '', message: '', attachment: null, expiry: '', saving: false,
    };
  }

  openEdit(update: ClassUpdate): void {
    this.refreshExpiryChoices();
    const file = update.attachment;
    this.form = {
      mode: 'edit', update, contextKey: '', title: update.title, message: update.message, saving: false,
      expiry: update.expiresAt ? toLocalDateTimeInput(update.expiresAt) : '',
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
    if (!CLASS_UPDATE_ATTACHMENT_TYPES.includes(file.type)) {
      this.toast.error('Unsupported file', `${file.name}: attach a JPG, PNG, WebP image or a PDF.`);
      return;
    }
    if (file.size > CLASS_UPDATE_ATTACHMENT_MAX_BYTES) {
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

  clearExpiry(): void {
    if (this.form) this.form.expiry = '';
  }

  applyPreset(preset: ExpiryPreset): void {
    if (this.form) this.form.expiry = preset.value;
  }

  selectContext(context: ClassUpdateContext): void {
    if (this.form) this.form.contextKey = classUpdateContextKey(context);
  }

  private refreshExpiryChoices(): void {
    const now = new Date();
    this.minExpiry = toLocalDateTimeInput(now);
    const endOfDay = (offset: number) => {
      const d = new Date(now);
      d.setDate(d.getDate() + offset);
      d.setHours(23, 59, 0, 0);
      return toLocalDateTimeInput(d);
    };
    this.presets = [
      { label: 'Tonight', value: endOfDay(0) },
      { label: 'Tomorrow', value: endOfDay(1) },
      { label: '3 days', value: endOfDay(3) },
      { label: '1 week', value: endOfDay(7) },
    ];
  }

  // ─── List presentation ─────────────────────────────────────────────

  setFilter(filter: ClassUpdateFilter): void {
    this.filter = filter;
  }

  get filterIndex(): number {
    return this.filters.findIndex(f => f.key === this.filter);
  }

  get visible(): ClassUpdate[] {
    if (this.filter === 'all') return this.recent;
    const expired = this.filter === 'expired';
    return this.recent.filter(u => this.isExpired(u) === expired);
  }

  get activeCount(): number {
    return this.recent.filter(u => !this.isExpired(u)).length;
  }

  countFor(filter: ClassUpdateFilter): number {
    if (filter === 'all') return this.recent.length;
    return filter === 'active' ? this.activeCount : this.recent.length - this.activeCount;
  }

  isExpired(update: ClassUpdate): boolean {
    return update.expired || (!!update.expiresAt && Date.parse(update.expiresAt) <= this.now);
  }

  /** One of six colour themes, stable per subject (or class). */
  tone(update: Pick<ClassUpdate, 'subjectName' | 'className'>): number {
    const key = (update.subjectName || update.className || '').toLowerCase();
    let hash = 0;
    for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
    return Math.abs(hash) % 6;
  }

  initials(update: Pick<ClassUpdate, 'subjectName' | 'className'>): string {
    if (!update.subjectName) return update.className.slice(0, 3);
    const words = update.subjectName.trim().split(/\s+/);
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

  /** "Expires in 45m" / "Expires in 5h" / "Expires in 2d". */
  expiresIn(update: ClassUpdate): string {
    const minutes = Math.max(1, Math.ceil((Date.parse(update.expiresAt!) - this.now) / 60_000));
    if (minutes < 60) return `Expires in ${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `Expires in ${hours}h`;
    return `Expires in ${Math.floor(hours / 24)}d`;
  }

  /** Share of the update's lifetime still remaining, 0–100 (for the countdown bar). */
  lifeLeft(update: ClassUpdate): number {
    const start = new Date(update.createdAt).getTime();
    const end = Date.parse(update.expiresAt!);
    if (!(end > start)) return 0;
    return Math.min(100, Math.max(3, ((end - this.now) / (end - start)) * 100));
  }

  isLong(update: ClassUpdate): boolean {
    // Matches the three-line clamp on the cards (cards keep an equal size).
    return update.message.length > 130 || update.message.split('\n').length > 3;
  }

  isExpanded(update: ClassUpdate): boolean {
    return this.expanded.has(update.id);
  }

  toggleExpanded(update: ClassUpdate): void {
    if (this.expanded.has(update.id)) this.expanded.delete(update.id);
    else this.expanded.add(update.id);
  }

  get selectedContext(): ClassUpdateContext | undefined {
    const key = this.form?.contextKey;
    return key ? this.contexts.find(c => classUpdateContextKey(c) === key) : undefined;
  }

  get canSave(): boolean {
    const form = this.form;
    if (!form || form.saving || !form.title.trim() || !form.message.trim()) return false;
    return form.mode === 'edit' || !!this.selectedContext;
  }

  save(): void {
    const form = this.form;
    if (!form || !this.canSave) return;
    const expiresAt = this.expiryToSend(form);
    if (expiresAt === undefined) {
      this.toast.warning('Check the expiry', 'The expiry must be in the future.');
      return;
    }
    form.saving = true;
    this.cdr.markForCheck();
    this.uploadedRef(form.attachment).pipe(takeUntil(this.destroy$)).subscribe({
      next: attachment => this.submit(form, attachment, expiresAt),
      error: error => this.failSave(form, 'Unable to upload the attachment', error),
    });
  }

  /**
   * null for no expiry; the original value when unchanged on edit (kept even if already past);
   * otherwise a new future instant. undefined means a new expiry that is not in the future.
   */
  private expiryToSend(form: FormState): string | null | undefined {
    if (!form.expiry) return null;
    const original = form.update?.expiresAt;
    if (original && form.expiry === toLocalDateTimeInput(original)) return original;
    const chosen = new Date(form.expiry);
    if (isNaN(chosen.getTime()) || chosen.getTime() <= Date.now()) return undefined;
    return chosen.toISOString();
  }

  private uploadedRef(attachment: ClassUpdateFormAttachment | null): Observable<ClassUpdateAttachmentRef | null> {
    if (!attachment) return of(null);
    if (attachment.kind === 'existing') return of({ objectKey: attachment.objectKey!, fileName: attachment.fileName });
    return this.classUpdates.uploadAttachmentDirect(attachment.file!)
      .pipe(map(uploaded => ({ objectKey: uploaded.objectKey, fileName: attachment.fileName })));
  }

  private submit(form: FormState, attachment: ClassUpdateAttachmentRef | null, expiresAt: string | null): void {
    const title = form.title.trim();
    const message = form.message.trim();
    const context = this.selectedContext;
    const request$ = form.mode === 'create'
      ? this.classUpdates.create({
          classId: context!.classId, sectionId: context!.sectionId, subjectName: context!.subjectName,
          title, message, attachment, expiresAt,
        })
      : this.classUpdates.update(form.update!.id, { title, message, attachment, expiresAt });
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

  async remove(update: ClassUpdate): Promise<void> {
    const confirmed = await this.toast.confirm({
      title: 'Delete this update?',
      message: 'Students will no longer see it or its attachment. This cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      danger: true,
      icon: 'danger',
    });
    if (!confirmed) return;
    this.classUpdates.delete(update.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.recent = this.recent.filter(u => u.id !== update.id);
        this.toast.success('Deleted', 'The update has been removed.');
        this.cdr.markForCheck();
      },
      error: error => {
        this.logger.error('Class update delete failed:', error);
        this.toast.error('Unable to delete', error?.error?.message || 'Please try again in a moment.');
      },
    });
  }

  private upsert(saved: ClassUpdate): void {
    const i = this.recent.findIndex(u => u.id === saved.id);
    this.recent = i >= 0 ? this.recent.map(u => (u.id === saved.id ? saved : u)) : [saved, ...this.recent];
  }

  trackById(_: number, item: ClassUpdate): number {
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
