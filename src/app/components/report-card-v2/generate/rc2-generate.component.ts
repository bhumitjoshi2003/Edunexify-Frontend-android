import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Subject, Subscription, takeUntil } from 'rxjs';
import { Rc2Context, Rc2ContextComponent } from '../rc2-context.component';
import { ReportCardV2Service, Summary, SummaryRow } from '../../../services/report-card-v2.service';
import { ReportCardPdfDeliveryService } from '../../../services/report-card-pdf-delivery.service';
import { ToastService } from '../../../services/toast.service';
import { RouterLink } from '@angular/router';
import { AuthStateService } from '../../../auth/auth-state.service';

/**
 * Report Card V2 — Generate & Preview (ADMIN; TEACHER read-only for their own class/section):
 * readiness, the class summary and each student's live PDF. Everything is calculated and
 * rendered by the backend from live data; official, frozen copies are issued from Published
 * Report Cards.
 */
@Component({
  selector: 'app-rc2-generate',
  standalone: true,
  imports: [CommonModule, RouterLink, Rc2ContextComponent],
  templateUrl: './rc2-generate.component.html',
  styleUrls: ['../rc2-shared.css', './rc2-generate.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Rc2GenerateComponent implements OnDestroy {
  @ViewChild('pdfFrame') private pdfFrame?: ElementRef<HTMLIFrameElement>;

  summary: Summary | null = null;
  state: 'idle' | 'loading' | 'loaded' | 'error' = 'idle';
  busyStudent: string | null = null;
  previewUrl: SafeResourceUrl | null = null;
  previewName = '';
  private previewObjectUrl: string | null = null;
  private previewBlob: Blob | null = null;
  private ctx: Rc2Context | null = null;
  private loadSub?: Subscription;
  private destroy$ = new Subject<void>();
  readonly isAdmin: boolean;

  constructor(
    auth: AuthStateService,
    private api: ReportCardV2Service,
    private delivery: ReportCardPdfDeliveryService,
    private toast: ToastService,
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef,
  ) {
    this.isAdmin = auth.getUserRole() === 'ADMIN';
  }

  ngOnDestroy(): void {
    this.closePreview();
    this.destroy$.next();
    this.destroy$.complete();
  }

  onContext(ctx: Rc2Context): void {
    this.ctx = ctx;
    this.load();
  }

  load(): void {
    this.loadSub?.unsubscribe();
    this.summary = null;
    if (!this.ctx?.setup) { this.state = 'idle'; this.cdr.markForCheck(); return; }
    this.state = 'loading';
    this.cdr.markForCheck();
    this.loadSub = this.api.getSummary(this.ctx.setup.id, this.ctx.sectionId).pipe(takeUntil(this.destroy$)).subscribe({
      next: s => { this.summary = s; this.state = 'loaded'; this.cdr.markForCheck(); },
      error: e => {
        this.state = 'error';
        this.toast.error('Could not load the class', e?.error?.message || 'Please try again.');
        this.cdr.markForCheck();
      },
    });
  }

  statusLabel(r: SummaryRow): string {
    return { PASS: 'Pass', FAIL: 'Fail', INCOMPLETE: 'Incomplete', NO_RESULT: 'No result' }[r.status];
  }

  /** Preview: the backend PDF in the page (web) or the system viewer/share sheet (app). */
  preview(r: SummaryRow): void { this.fetch(r, 'preview'); }

  download(r: SummaryRow): void { this.fetch(r, 'download'); }

  private fetch(r: SummaryRow, action: 'preview' | 'download'): void {
    if (!this.summary || this.busyStudent) return;
    this.busyStudent = r.studentId;
    this.cdr.markForCheck();
    const fileName = `${r.studentName.replace(/[^A-Za-z0-9]+/g, '_')}_${this.summary.setupName.replace(/[^A-Za-z0-9]+/g, '_')}_Preview.pdf`;
    this.api.previewPdf(this.summary.setupId, r.studentId).pipe(takeUntil(this.destroy$)).subscribe({
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
          this.busyStudent = null;
          this.cdr.markForCheck();
        }
      },
      error: async e => {
        this.busyStudent = null;
        let message = 'Could not generate the report card.';
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

  trackByStudent(_: number, r: SummaryRow): string { return r.studentId; }
}
