import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Subject, forkJoin, takeUntil } from 'rxjs';
import { ReportCardDocument, ReportCardV2Service } from '../../../services/report-card-v2.service';
import { ReportCardPdfDeliveryService } from '../../../services/report-card-pdf-delivery.service';
import { AuthStateService } from '../../../auth/auth-state.service';
import { ToastService } from '../../../services/toast.service';
import { MatIconModule } from '@angular/material/icon';

/**
 * One published report card: the stored, official PDF (never regenerated). Opened from the
 * report card list or straight from a notification. The server checks that the caller is the
 * student, a parent linked to them, or an administrator of the school.
 */
@Component({
  selector: 'app-rc2-document-view',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['../rc2-shared.css'],
  styles: [`
    .dv-page-title { display:flex; align-items:center; gap:13px; margin-bottom:16px; padding:19px 22px; border-radius:18px; background:linear-gradient(115deg,#142b40,#145764); color:#fff; }
    .dv-page-icon { display:grid; place-items:center; width:44px; height:44px; border-radius:13px; background:rgba(255,255,255,.13); }
    .dv-page-title h1 { margin:0; font-size:1.2rem; font-weight:800; }
    .dv-page-title p { margin:3px 0 0; color:#c8e6e7; font-size:.75rem; }
    .dv-head { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; flex-wrap:wrap; }
    .dv-head .rc2-card-title { margin-bottom:7px; }
    .dv-actions { display:flex; gap:8px; flex-shrink:0; }
    .dv-icon-btn { display:inline-flex; align-items:center; justify-content:center; width:40px; height:40px; border:1px solid #dce5ec; border-radius:11px; background:#fff; color:#1a5964; cursor:pointer; }
    .dv-icon-btn:hover:not(:disabled) { background:#eaf8f6; border-color:#9dd4cc; }
    .dv-icon-btn:disabled { opacity:.45; cursor:wait; }
    .dv-preview { margin-top:20px; overflow:hidden; border:1px solid #dfe8ef; border-radius:15px; background:#eef2f5; }
    .dv-preview-top { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:9px 12px; border-bottom:1px solid #dae3ea; background:#f8fafc; }
    .dv-preview-top strong { font-size:.77rem; color:#435368; }
    .dv-preview-controls { display:flex; align-items:center; gap:5px; }
    .dv-preview-controls .dv-icon-btn { width:34px; height:34px; border:0; background:transparent; }
    .dv-frame { display:block; width:100%; height:min(75vh,1000px); border:0; background:#525659; }
    .dv-pages { display:flex; flex-direction:column; align-items:center; gap:14px; max-height:75vh; overflow:auto; padding:14px; }
    .dv-pages img { display:block; max-width:none; height:auto; box-shadow:0 3px 16px #18233525; background:#fff; }
    .dv-loading { display:flex; align-items:center; justify-content:center; min-height:200px; color:#64748b; font-size:.85rem; }
    .dv-error { padding:26px; text-align:center; color:#9f3b36; font-size:.85rem; }
    .dv-expanded { position:fixed; z-index:1100; inset:10px; margin:0; display:flex; flex-direction:column; box-shadow:0 20px 70px #0006; }
    .dv-expanded .dv-frame,.dv-expanded .dv-pages { flex:1; max-height:none; height:auto; }
    .dv-footer { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-top:17px; padding-top:15px; border-top:1px solid #e9edf2; }
    .dv-footer p { margin:0; font-size:.73rem; color:#64748b; }
    @media(max-width:600px) { .dv-page-title { padding:16px; border-radius:14px; } .dv-head { flex-direction:column; } .dv-actions { align-self:flex-end; } .dv-pages { padding:8px; } .dv-footer { flex-wrap:wrap; } }
  `],
  template: `
    <div class="rc2-page">
      <header class="dv-page-title">
        <div class="dv-page-icon"><mat-icon>description</mat-icon></div>
        <div><h1>Report Card</h1><p>View your official school report card</p></div>
      </header>
      <div class="rc2-card" *ngIf="state === 'loading'" aria-busy="true" aria-label="Loading report card">
        <div class="rc2-skeleton"><div class="rc2-sk-row" *ngFor="let i of [1,2,3]"><span class="sk-shimmer" style="width: 45%"></span><span class="sk-shimmer" style="width: 20%"></span></div></div>
      </div>

      <div class="rc2-card" *ngIf="state === 'error'">
        <div class="rc2-empty">
          <div class="rc2-empty-icon">🔒</div>
          <p class="rc2-empty-title">This report card isn't available</p>
          <p class="rc2-empty-sub">{{ error }}</p>
          <a class="rc2-btn rc2-btn-outline" [routerLink]="listLink" [queryParams]="listQuery">All report cards</a>
        </div>
      </div>

      <div class="rc2-card" *ngIf="state === 'loaded' && doc">
        <div class="dv-head">
          <div>
            <h1 class="rc2-card-title">{{ doc.title }}</h1>
            <p class="rc2-card-sub">
              {{ doc.studentName }} · Class {{ doc.className }}<ng-container *ngIf="doc.sectionName"> – {{ doc.sectionName }}</ng-container> · {{ doc.sessionLabel }}
            </p>
            <p class="rc2-card-sub">
              <span class="rc2-badge" [class.rc2-badge-success]="doc.status === 'ACTIVE'" [class.rc2-badge-neutral]="doc.status !== 'ACTIVE'">{{ doc.status === 'ACTIVE' ? 'Official copy' : (doc.status === 'WITHDRAWN' ? 'Withdrawn' : 'Superseded') }}</span>
              Issued {{ doc.issuedAt | date:'d MMM y' }} · Ref {{ doc.reference }}
            </p>
          </div>
          <div class="dv-actions">
            <button type="button" class="dv-icon-btn" (click)="share()" [disabled]="busy" title="Share report card" aria-label="Share report card"><mat-icon>share</mat-icon></button>
            <button type="button" class="dv-icon-btn" (click)="download()" [disabled]="busy" title="Download PDF" aria-label="Download report card"><mat-icon>download</mat-icon></button>
            <button type="button" class="dv-icon-btn" (click)="print()" [disabled]="busy" title="Print" aria-label="Print report card"><mat-icon>print</mat-icon></button>
          </div>
        </div>
        <section class="dv-preview" [class.dv-expanded]="expanded" aria-label="Report card preview">
          <div class="dv-preview-top">
            <strong>Report card preview</strong>
            <div class="dv-preview-controls">
              <ng-container *ngIf="native && previewState === 'ready'">
                <button type="button" class="dv-icon-btn" (click)="changeZoom(-0.25)" [disabled]="zoom <= 0.75" aria-label="Zoom out" title="Zoom out"><mat-icon>remove</mat-icon></button>
                <span style="font-size:.73rem;color:#526477">{{ zoom * 100 | number:'1.0-0' }}%</span>
                <button type="button" class="dv-icon-btn" (click)="changeZoom(0.25)" [disabled]="zoom >= 2.5" aria-label="Zoom in" title="Zoom in"><mat-icon>add</mat-icon></button>
              </ng-container>
              <button type="button" class="dv-icon-btn" (click)="expanded = !expanded" [attr.aria-label]="expanded ? 'Exit full screen' : 'Expand report card'" [title]="expanded ? 'Close full screen' : 'Expand preview'"><mat-icon>{{ expanded ? 'close_fullscreen' : 'open_in_full' }}</mat-icon></button>
            </div>
          </div>
          <div *ngIf="native && previewState === 'loading'" class="dv-loading" aria-live="polite">Preparing your report card preview…</div>
          <div *ngIf="native && previewState === 'error'" class="dv-error">Preview is unavailable on this device. <button type="button" class="rc2-btn rc2-btn-outline" (click)="openNative()">Open in viewer</button></div>
          <div class="dv-pages" *ngIf="native && previewState === 'ready'">
            <img *ngFor="let page of previewPages; let i = index" [src]="page" [alt]="'Report card PDF page ' + (i + 1)" [style.width.%]="zoom * 100">
          </div>
          <iframe #pdfFrame *ngIf="!native && pdfUrl" class="dv-frame" [src]="pdfUrl" title="Report card PDF"></iframe>
        </section>
        <div class="dv-footer">
          <p>Official school-issued PDF · Ref {{ doc.reference }}</p>
          <a class="rc2-btn rc2-btn-outline" [routerLink]="listLink" [queryParams]="listQuery" *ngIf="!isAdmin">All report cards</a>
          <button type="button" class="rc2-btn rc2-btn-outline" *ngIf="isAdmin" (click)="back()">Back</button>
        </div>
      </div>
    </div>
  `,
})
export class Rc2DocumentViewComponent implements OnInit, OnDestroy {
  @ViewChild('pdfFrame') private pdfFrame?: ElementRef<HTMLIFrameElement>;

  state: 'loading' | 'loaded' | 'error' = 'loading';
  doc: ReportCardDocument | null = null;
  pdfUrl: SafeResourceUrl | null = null;
  previewPages: string[] = [];
  previewState: 'loading' | 'ready' | 'error' = 'loading';
  zoom = 1;
  expanded = false;
  busy = false;
  error = 'It may have been replaced by a newer version or withdrawn by the school.';
  readonly listLink = '/dashboard/report-card-documents';
  listQuery: Record<string, string> = {};
  readonly isAdmin: boolean;
  private blob: Blob | null = null;
  private objectUrl: string | null = null;
  private requestVersion = 0;
  private destroy$ = new Subject<void>();

  constructor(
    auth: AuthStateService,
    private route: ActivatedRoute,
    private location: Location,
    private api: ReportCardV2Service,
    private delivery: ReportCardPdfDeliveryService,
    private toast: ToastService,
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef,
  ) {
    this.isAdmin = auth.getUserRole() === 'ADMIN';
  }

  get native(): boolean { return this.delivery.native; }

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe(p => {
      const studentId = this.route.snapshot.queryParamMap.get('studentId');
      this.listQuery = studentId ? { studentId } : {};
      this.load(Number(p.get('id')));
    });
  }

  ngOnDestroy(): void {
    this.requestVersion++;
    this.revoke();
    this.destroy$.next();
    this.destroy$.complete();
  }

  private load(id: number): void {
    const version = ++this.requestVersion;
    this.revoke();
    this.state = 'loading';
    this.previewState = 'loading';
    this.expanded = false;
    this.zoom = 1;
    this.cdr.markForCheck();
    if (!Number.isFinite(id) || id <= 0) { this.state = 'error'; this.cdr.markForCheck(); return; }
    forkJoin({ doc: this.api.getDocument(id), pdf: this.api.documentPdf(id) }).pipe(takeUntil(this.destroy$)).subscribe({
      next: ({ doc, pdf }) => {
        if (version !== this.requestVersion) return;
        this.doc = doc;
        this.blob = pdf;
        if (!this.native) {
          this.objectUrl = URL.createObjectURL(pdf);
          this.pdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.objectUrl);
        }
        this.state = 'loaded';
        this.cdr.markForCheck();
        if (this.native) {
          this.delivery.previewPages(pdf, this.fileName()).then(pages => {
            if (version !== this.requestVersion) return;
            this.previewPages = pages;
            this.previewState = pages.length ? 'ready' : 'error';
            this.cdr.markForCheck();
          }).catch(() => {
            if (version !== this.requestVersion) return;
            this.previewState = 'error';
            this.cdr.markForCheck();
          });
        }
      },
      error: async e => {
        try { const body = e?.error instanceof Blob ? JSON.parse(await e.error.text()) : e?.error; if (body?.message && e?.status !== 404) this.error = body.message; } catch { /* keep default */ }
        this.state = 'error';
        this.cdr.markForCheck();
      },
    });
  }

  private fileName(): string {
    if (!this.doc) return 'ReportCard.pdf';
    return `${this.doc.studentName}_${this.doc.title}_${this.doc.sessionLabel}_${this.doc.reference}`.replace(/[^A-Za-z0-9-]+/g, '_') + '.pdf';
  }

  changeZoom(delta: number): void { this.zoom = Math.max(0.75, Math.min(2.5, this.zoom + delta)); }

  async download(): Promise<void> {
    if (!this.blob || !this.doc) return;
    this.busy = true;
    try {
      await this.delivery.saveToDevice(this.blob, this.fileName());
      if (this.native) this.toast.success('Report card downloaded', 'Saved to Downloads/Edunexify.');
    } catch { this.toast.error('Download failed', 'Could not save the report card. Please try again.'); }
    finally { this.busy = false; this.cdr.markForCheck(); }
  }

  async share(): Promise<void> {
    if (!this.blob || !this.doc) return;
    this.busy = true;
    try { await this.delivery.share(this.blob, this.fileName()); }
    catch (e: any) {
      if (!/cancel|abort/i.test(String(e?.message ?? e))) this.toast.error('Could not share PDF', 'Please try again.');
    } finally { this.busy = false; this.cdr.markForCheck(); }
  }

  async openNative(): Promise<void> {
    if (!this.blob || !this.doc) return;
    try { await this.delivery.open(this.blob, this.fileName()); }
    catch { this.toast.error('Could not open PDF', 'Try downloading the report card.'); }
  }

  async print(): Promise<void> {
    if (this.native && this.blob) {
      try { await this.delivery.printNative(this.blob, this.fileName()); }
      catch { this.toast.error('Could not print PDF', 'Please try again.'); }
      return;
    }
    try {
      this.pdfFrame?.nativeElement.contentWindow?.focus();
      this.pdfFrame?.nativeElement.contentWindow?.print();
    } catch {
      if (this.objectUrl) window.open(this.objectUrl, '_blank', 'noopener');
    }
  }

  back(): void { this.location.back(); }

  private revoke(): void {
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = null;
    this.pdfUrl = null;
    this.blob = null;
    this.previewPages = [];
  }
}
