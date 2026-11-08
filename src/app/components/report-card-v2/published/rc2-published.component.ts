import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { EMPTY, Subject, Subscription, catchError, switchMap, takeUntil, takeWhile, timer } from 'rxjs';
import { Rc2Context, Rc2ContextComponent } from '../rc2-context.component';
import {
  BulkCheck, Publication, PublicationJob, PublishResult, ReportCardDocument, ReportCardV2Service, publicationJobFinished,
} from '../../../services/report-card-v2.service';
import { ReportCardPdfDeliveryService } from '../../../services/report-card-pdf-delivery.service';
import { ToastService } from '../../../services/toast.service';

/**
 * Report Card V2 — Published Report Cards (ADMIN): the official, frozen documents. Publishing
 * freezes every student's card (the backend renders and stores each PDF once); republishing
 * issues a new version; withdrawing hides it from students and parents while keeping the record.
 * Generate & Preview is the live view; everything here is the stored copy.
 *
 * Publishing runs as a background job on the server: Publish starts it and this page follows its
 * progress (also after a reload, or when another administrator started it). Students and parents
 * see the new version only once every card is stored.
 */
@Component({
  selector: 'app-rc2-published',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, Rc2ContextComponent],
  templateUrl: './rc2-published.component.html',
  styleUrls: ['../rc2-shared.css', './rc2-published.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Rc2PublishedComponent implements OnDestroy {
  @ViewChild('pdfFrame') private pdfFrame?: ElementRef<HTMLIFrameElement>;

  ctx: Rc2Context | null = null;
  state: 'idle' | 'no-setup' | 'loading' | 'loaded' | 'error' = 'idle';
  publications: Publication[] = [];
  documents: ReportCardDocument[] = [];
  selected: Publication | null = null;
  docsState: 'idle' | 'loading' | 'loaded' | 'error' = 'idle';
  includeIncomplete = false;
  approvalRequired = false;
  approvalPolicyState: 'loading' | 'ready' | 'error' = 'loading';
  publicationReady = false;
  readinessMessage = '';
  private policySub?: Subscription;
  approvalBusy = false;
  withdrawReason = '';
  busy: 'publish' | 'withdraw' | 'zip' | 'send' | null = null;
  busyDoc: number | null = null;
  zipId: number | null = null;
  lastResult: PublishResult | null = null;
  /** The publication job being followed (running, or just finished). */
  job: PublicationJob | null = null;
  private jobSub?: Subscription;
  bulk: BulkCheck | null = null;
  previewUrl: SafeResourceUrl | null = null;
  previewName = '';
  private previewObjectUrl: string | null = null;
  private previewBlob: Blob | null = null;
  private loadSub?: Subscription;
  private docsSub?: Subscription;
  private destroy$ = new Subject<void>();

  constructor(
    private http: HttpClient,
    private api: ReportCardV2Service,
    private delivery: ReportCardPdfDeliveryService,
    private toast: ToastService,
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnDestroy(): void {
    this.jobSub?.unsubscribe();
    this.closePreview();
    this.destroy$.next();
    this.destroy$.complete();
  }

  onContext(ctx: Rc2Context): void {
    this.ctx = ctx;
    this.checkReadiness();
    this.lastResult = null;
    this.bulk = null;
    this.stopFollowing();
    this.load();
    this.resumeJob();
  }

  async enableApprovals(): Promise<void> {
    const setupId = this.ctx?.setup?.id;
    if (!setupId || this.approvalRequired || this.approvalBusy) return;
    const confirmed = await this.toast.confirm({ title: 'Require teacher and Principal approval?', message: 'New publications require both reviewers to approve the exact revision and inclusion policy. This policy is permanent. Existing issued PDFs remain unchanged.', confirmText: 'Enable approvals', icon: 'question' });
    if (!confirmed || this.ctx?.setup?.id !== setupId) return;
    this.approvalBusy = true;
    this.http.post(`${environment.apiUrl}/report-card-approvals/setups/${setupId}/enable`, {}).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.approvalRequired = true;
        this.approvalBusy = false;
        this.checkReadiness();
        this.toast.success('Approval workflow enabled', 'Teachers and the Principal must now approve each section before new publication.');
        this.cdr.markForCheck();
      },
      error: response => {
        this.approvalBusy = false;
        this.toast.error('Could not enable approvals', response?.error?.message || 'Try again.');
        this.cdr.markForCheck();
      }
    });
  }

  checkReadiness(): void {
    this.policySub?.unsubscribe(); this.approvalPolicyState = 'loading'; this.publicationReady = false;
    const ctx = this.ctx; if (!ctx?.setup) return;
    const params: Record<string, string> = { includeIncomplete: String(this.includeIncomplete) };
    if (ctx.sectionId != null) params['sectionId'] = String(ctx.sectionId);
    this.policySub = this.http.get<{ required: boolean; ready: boolean; message: string }>(`${environment.apiUrl}/report-card-approvals/setups/${ctx.setup.id}/readiness`, { params }).pipe(takeUntil(this.destroy$)).subscribe({
      next: value => { this.approvalRequired = value.required; this.publicationReady = value.ready; this.readinessMessage = value.message; this.approvalPolicyState = 'ready'; this.cdr.markForCheck(); },
      error: () => { this.approvalPolicyState = 'error'; this.readinessMessage = 'Could not verify approval policy. Retry before publication.'; this.cdr.markForCheck(); }
    });
  }

  /** The chosen scope: one section, or the whole class. */
  get sectionId(): number | null { return this.ctx?.sectionId ?? null; }

  /** The ACTIVE publication that students of this scope currently see (a whole-class one covers every section). */
  get active(): Publication | null {
    const sid = this.sectionId;
    return this.publications.find(p => p.status === 'ACTIVE' && p.sectionId === sid)
      ?? (sid != null ? this.publications.find(p => p.status === 'ACTIVE' && p.sectionId == null) ?? null : null);
  }

  /** Publishing a section while the whole class is published is refused by the server; explain it here. */
  get blockedByWholeClass(): boolean {
    return this.sectionId != null && this.active?.sectionId == null && this.active != null;
  }

  /** Versions of this scope, newest first (whole class: every version). */
  get history(): Publication[] {
    const sid = this.sectionId;
    return sid == null ? this.publications : this.publications.filter(p => p.sectionId === sid || p.sectionId == null);
  }

  get scopeLabel(): string {
    return this.sectionId == null ? 'the whole class' : 'this section';
  }

  load(): void {
    this.loadSub?.unsubscribe();
    this.publications = [];
    this.clearDocuments();
    const ctx = this.ctx;
    if (!ctx?.session || !ctx.schoolClass) { this.state = 'idle'; this.cdr.markForCheck(); return; }
    if (!ctx.setups.length) { this.state = 'no-setup'; this.cdr.markForCheck(); return; }
    if (!ctx.setup) { this.state = 'idle'; this.cdr.markForCheck(); return; }
    this.state = 'loading';
    this.cdr.markForCheck();
    this.loadSub = this.api.listPublications(ctx.setup.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: list => {
        this.publications = list;
        this.state = 'loaded';
        const show = this.active ?? this.history[0] ?? null;
        if (show) this.openDocuments(show);
        this.cdr.markForCheck();
      },
      error: e => {
        this.state = 'error';
        this.toast.error('Could not load published report cards', e?.error?.message || 'Please try again.');
        this.cdr.markForCheck();
      },
    });
  }

  /** A publication of this setup is still being generated (by this or another administrator). */
  get publishing(): boolean { return !!this.job && !publicationJobFinished(this.job); }

  get jobPercent(): number {
    const j = this.job;
    if (!j || !j.total) return 0;
    return j.phase === 'ACTIVATING' ? 100 : Math.round((100 * j.processed) / j.total);
  }

  get jobLabel(): string {
    const j = this.job;
    if (!j) return '';
    const scope = j.sectionName ? `Section ${j.sectionName}` : 'the whole class';
    switch (j.phase) {
      case 'QUEUED': return `Version ${j.version} for ${scope}: waiting to start…`;
      case 'ACTIVATING': return `Version ${j.version} for ${scope}: publishing all ${j.total} report cards together…`;
      default: return `Version ${j.version} for ${scope}: ${j.processed} of ${j.total} report cards generated`;
    }
  }

  async publish(): Promise<void> {
    const setup = this.ctx?.setup;
    if (!setup || this.busy || this.publishing || this.approvalPolicyState !== 'ready' || !this.publicationReady) return;
    const context = this.ctx;
    const targetSection = this.sectionId;
    const includeIncomplete = this.includeIncomplete;
    const republish = !!this.active && !this.blockedByWholeClass;
    const ok = await this.toast.confirm({
      title: republish ? `Republish ${setup.name}?` : `Publish ${setup.name}?`,
      message: (republish
        ? `A new version is issued to ${this.scopeLabel} with new QR codes. The current version is marked as superseded and students see only the new one.`
        : `Every student's report card for ${this.scopeLabel} is generated from today's data and frozen as the official copy. Students and parents are notified.`)
        + (this.includeIncomplete ? ' Students with missing marks are included.' : ' Students with missing marks are left out.'),
      confirmText: republish ? 'Republish' : 'Publish',
      icon: 'question',
    });
    if (!ok || this.ctx !== context || this.sectionId !== targetSection || this.includeIncomplete !== includeIncomplete) return;
    this.busy = 'publish';
    this.lastResult = null;
    this.cdr.markForCheck();
    // One id per click: a resent request returns the job it already started.
    const requestId = globalThis.crypto?.randomUUID?.() ?? null;
    this.api.startPublication(setup.id, targetSection, includeIncomplete, requestId).pipe(takeUntil(this.destroy$)).subscribe({
      next: job => {
        this.busy = null;
        if (this.ctx === context) this.follow(job);
        this.cdr.markForCheck();
      },
      error: e => {
        this.busy = null;
        this.toast.error('Could not publish', e?.error?.message || 'Please try again.');
        this.resumeJob(); // a job may still have been started (e.g. the response was lost)
        this.cdr.markForCheck();
      },
    });
  }

  /** Follows the setup's job if one is still running (page reload, or another administrator's). */
  private resumeJob(): void {
    const setupId = this.ctx?.setup?.id;
    if (!setupId) return;
    const context = this.ctx;
    this.api.latestPublicationJob(setupId).pipe(takeUntil(this.destroy$)).subscribe({
      next: job => { if (job && !publicationJobFinished(job) && this.ctx === context) this.follow(job); },
      error: () => { /* progress is optional; publishing itself is unaffected */ },
    });
  }

  private follow(job: PublicationJob): void {
    this.jobSub?.unsubscribe();
    this.job = job;
    this.cdr.markForCheck();
    if (publicationJobFinished(job)) { this.finished(job); return; }
    // A missed poll (network) is retried on the next tick; the job keeps running on the server.
    this.jobSub = timer(2000, 2000).pipe(
      switchMap(() => this.api.publicationJob(job.id).pipe(catchError(() => EMPTY))),
      takeWhile(j => !publicationJobFinished(j), true),
      takeUntil(this.destroy$),
    ).subscribe(j => {
      this.job = j;
      if (publicationJobFinished(j)) this.finished(j);
      this.cdr.markForCheck();
    });
  }

  private finished(job: PublicationJob): void {
    const published = job.status === 'SUCCEEDED';
    this.lastResult = {
      published, publication: null, documents: published ? job.total : 0,
      excludedIncomplete: job.excludedIncomplete, failed: job.failures,
      message: job.message || (published ? `Published version ${job.version}.` : 'Nothing was published.'),
    };
    if (published) {
      this.toast.success(job.version > 1 ? 'Report cards republished' : 'Report cards published', this.lastResult.message);
      this.load();
    } else {
      this.toast.error('Nothing was published', this.lastResult.message);
    }
  }

  private stopFollowing(): void {
    this.jobSub?.unsubscribe();
    this.jobSub = undefined;
    this.job = null;
  }

  async withdraw(p: Publication): Promise<void> {
    if (this.busy) return;
    const ok = await this.toast.confirm({
      title: `Withdraw version ${p.version}?`,
      message: 'Students and parents will no longer see these report cards, and their QR codes will show "Withdrawn by the school". '
        + 'The stored copies are kept for the record. Remarks can be edited again afterwards.',
      confirmText: 'Withdraw',
      danger: true,
      icon: 'warning',
    });
    if (!ok) return;
    this.busy = 'withdraw';
    this.cdr.markForCheck();
    this.api.withdraw(p.id, this.withdrawReason.trim() || null).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.busy = null;
        this.withdrawReason = '';
        this.toast.success('Report cards withdrawn', `Version ${p.version} is no longer visible to students and parents.`);
        this.load();
      },
      error: e => {
        this.busy = null;
        this.toast.error('Could not withdraw', e?.error?.message || 'Please try again.');
        this.cdr.markForCheck();
      },
    });
  }

  openDocuments(p: Publication): void {
    this.docsSub?.unsubscribe();
    this.selected = p;
    this.documents = [];
    this.bulk = null;
    this.docsState = 'loading';
    this.cdr.markForCheck();
    this.docsSub = this.api.publicationDocuments(p.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: docs => { this.documents = docs; this.docsState = 'loaded'; this.cdr.markForCheck(); },
      error: () => { this.docsState = 'error'; this.cdr.markForCheck(); },
    });
  }

  /** Checks every stored PDF first, then downloads one ZIP of the stored files (nothing is regenerated). */
  downloadAll(p: Publication): void {
    if (this.busy) return;
    this.busy = 'zip';
    this.zipId = p.id;
    this.bulk = null;
    this.cdr.markForCheck();
    this.api.bulkCheck(p.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: check => {
        this.bulk = check;
        this.cdr.markForCheck();
        if (check.available === 0) {
          this.busy = null;
          this.toast.error('Nothing to download', 'None of the stored report cards could be found.');
          this.cdr.markForCheck();
          return;
        }
        this.api.downloadZip(p.id).pipe(takeUntil(this.destroy$)).subscribe({
          next: async blob => {
            const name = `${this.fileSafe(p.setupName)}_${p.sectionName ? 'Section_' + this.fileSafe(p.sectionName) + '_' : ''}v${p.version}.zip`;
            try {
              if (this.delivery.native) await this.delivery.share(blob, name); else this.delivery.download(blob, name);
            } catch (e: any) {
              if (e?.message !== 'Share canceled') this.toast.error('Could not save the file', 'Please try again.');
            }
            this.busy = null;
            if (check.missing.length) {
              this.toast.warning(`${check.available} of ${check.total} report cards downloaded`, `${check.missing.length} could not be included — see the list below and manifest.txt in the ZIP.`);
            } else {
              this.toast.success('Download ready', `${check.total} report cards.`);
            }
            this.cdr.markForCheck();
          },
          error: () => {
            this.busy = null;
            this.toast.error('Download failed', 'Please try again.');
            this.cdr.markForCheck();
          },
        });
      },
      error: e => {
        this.busy = null;
        this.toast.error('Could not prepare the download', e?.error?.message || 'Please try again.');
        this.cdr.markForCheck();
      },
    });
  }

  async send(p: Publication): Promise<void> {
    if (this.busy) return;
    const ok = await this.toast.confirm({
      title: 'Email report card links?',
      message: `Parents and students of ${p.documentCount} report card${p.documentCount === 1 ? '' : 's'} receive an email with a secure link. `
        + 'They sign in to Edunexify to view or download the card (no attachments are sent).',
      confirmText: 'Send emails',
      icon: 'question',
    });
    if (!ok) return;
    this.busy = 'send';
    this.cdr.markForCheck();
    this.api.send(p.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: res => {
        this.busy = null;
        if (res.queued === res.documents) this.toast.success('Emails queued', res.message);
        else this.toast.warning('Some emails were not queued', res.message);
        this.cdr.markForCheck();
      },
      error: e => {
        this.busy = null;
        this.toast.error('Could not send', e?.error?.message || 'Please try again.');
        this.cdr.markForCheck();
      },
    });
  }

  /** Opens the STORED PDF of one document (web: in the page; app: the system viewer / share sheet). */
  view(d: ReportCardDocument, action: 'preview' | 'download' = 'preview'): void {
    if (this.busyDoc) return;
    this.busyDoc = d.id;
    this.cdr.markForCheck();
    const fileName = `${this.fileSafe(d.studentName)}_${this.fileSafe(d.title)}_${d.reference}.pdf`;
    this.api.documentPdf(d.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: async blob => {
        try {
          if (this.delivery.native) {
            await this.delivery.share(blob, fileName);
          } else if (action === 'download') {
            this.delivery.download(blob, fileName);
          } else {
            this.closePreview();
            this.previewBlob = blob;
            this.previewName = fileName;
            this.previewObjectUrl = URL.createObjectURL(blob);
            this.previewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.previewObjectUrl);
          }
        } catch (e: any) {
          if (e?.message !== 'Share canceled') this.toast.error('Could not open the PDF', 'Please try again.');
        } finally {
          this.busyDoc = null;
          this.cdr.markForCheck();
        }
      },
      error: async e => {
        this.busyDoc = null;
        let message = 'The stored report card could not be opened.';
        try { const body = e?.error instanceof Blob ? JSON.parse(await e.error.text()) : e?.error; message = body?.message || message; } catch { /* keep default */ }
        this.toast.error('PDF failed', message);
        this.cdr.markForCheck();
      },
    });
  }

  printPreview(): void {
    try {
      this.pdfFrame?.nativeElement.contentWindow?.focus();
      this.pdfFrame?.nativeElement.contentWindow?.print();
    } catch {
      this.openInNewTab();
    }
  }

  openInNewTab(): void {
    if (this.previewObjectUrl) window.open(this.previewObjectUrl, '_blank', 'noopener');
  }

  downloadPreview(): void {
    if (this.previewBlob) this.delivery.download(this.previewBlob, this.previewName);
  }

  closePreview(): void {
    if (this.previewObjectUrl) URL.revokeObjectURL(this.previewObjectUrl);
    this.previewObjectUrl = null;
    this.previewBlob = null;
    this.previewUrl = null;
    this.cdr.markForCheck();
  }

  statusLabel(p: { status: string }): string {
    return ({ ACTIVE: 'Active', SUPERSEDED: 'Superseded', WITHDRAWN: 'Withdrawn' } as Record<string, string>)[p.status] ?? p.status;
  }

  scopeOf(p: Publication): string { return p.sectionName ? `Section ${p.sectionName}` : 'Whole class'; }

  trackById(_: number, x: { id: number }): number { return x.id; }

  private clearDocuments(): void {
    this.docsSub?.unsubscribe();
    this.selected = null;
    this.documents = [];
    this.docsState = 'idle';
  }

  private fileSafe(s: string | null | undefined): string {
    return (s ?? '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'report_card';
  }
}
