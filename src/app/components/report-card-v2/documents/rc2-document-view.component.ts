import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Subject, forkJoin, takeUntil } from 'rxjs';
import { ReportCardDocument, ReportCardV2Service } from '../../../services/report-card-v2.service';
import { ReportCardPdfDeliveryService } from '../../../services/report-card-pdf-delivery.service';
import { AuthStateService } from '../../../auth/auth-state.service';
import { ToastService } from '../../../services/toast.service';

/**
 * One published report card: the stored, official PDF (never regenerated). Opened from the
 * report card list or straight from a notification. The server checks that the caller is the
 * student, a parent linked to them, or an administrator of the school.
 */
@Component({
  selector: 'app-rc2-document-view',
  standalone: true,
  imports: [CommonModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['../rc2-shared.css'],
  styles: [`
    .dv-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .dv-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .dv-frame { width: 100%; height: min(80vh, 1100px); margin-top: 16px; border: 1px solid var(--edu-border, #e2e8f0); border-radius: 12px; background: #525659; }
    .dv-native { margin-top: 16px; }
  `],
  template: `
    <div class="rc2-page">
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
            <button type="button" class="rc2-btn rc2-btn-primary" (click)="save()">{{ native ? 'Open / Share' : 'Download' }}</button>
            <button type="button" class="rc2-btn rc2-btn-outline" *ngIf="!native" (click)="print()">Print</button>
            <a class="rc2-btn rc2-btn-outline" [routerLink]="listLink" [queryParams]="listQuery" *ngIf="!isAdmin">All report cards</a>
            <button type="button" class="rc2-btn rc2-btn-outline" *ngIf="isAdmin" (click)="back()">Back</button>
          </div>
        </div>
        <iframe #pdfFrame *ngIf="!native && pdfUrl" class="dv-frame" [src]="pdfUrl" title="Report card PDF"></iframe>
        <p class="rc2-hint dv-native" *ngIf="native">Tap "Open / Share" to view the report card in your PDF app or save it.</p>
      </div>
    </div>
  `,
})
export class Rc2DocumentViewComponent implements OnInit, OnDestroy {
  @ViewChild('pdfFrame') private pdfFrame?: ElementRef<HTMLIFrameElement>;

  state: 'loading' | 'loaded' | 'error' = 'loading';
  doc: ReportCardDocument | null = null;
  pdfUrl: SafeResourceUrl | null = null;
  error = 'It may have been replaced by a newer version or withdrawn by the school.';
  readonly listLink = '/dashboard/report-card-documents';
  listQuery: Record<string, string> = {};
  readonly isAdmin: boolean;
  private blob: Blob | null = null;
  private objectUrl: string | null = null;
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
    this.revoke();
    this.destroy$.next();
    this.destroy$.complete();
  }

  private load(id: number): void {
    this.revoke();
    this.state = 'loading';
    this.cdr.markForCheck();
    if (!Number.isFinite(id) || id <= 0) { this.state = 'error'; this.cdr.markForCheck(); return; }
    forkJoin({ doc: this.api.getDocument(id), pdf: this.api.documentPdf(id) }).pipe(takeUntil(this.destroy$)).subscribe({
      next: ({ doc, pdf }) => {
        this.doc = doc;
        this.blob = pdf;
        if (!this.native) {
          this.objectUrl = URL.createObjectURL(pdf);
          this.pdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.objectUrl);
        }
        this.state = 'loaded';
        this.cdr.markForCheck();
      },
      error: async e => {
        try { const body = e?.error instanceof Blob ? JSON.parse(await e.error.text()) : e?.error; if (body?.message && e?.status !== 404) this.error = body.message; } catch { /* keep default */ }
        this.state = 'error';
        this.cdr.markForCheck();
      },
    });
  }

  async save(): Promise<void> {
    if (!this.blob || !this.doc) return;
    const name = `${this.doc.studentName}_${this.doc.title}_${this.doc.sessionLabel}_${this.doc.reference}`.replace(/[^A-Za-z0-9-]+/g, '_') + '.pdf';
    try {
      if (this.native) await this.delivery.share(this.blob, name); else this.delivery.download(this.blob, name);
    } catch (e: any) {
      if (e?.message !== 'Share canceled') this.toast.error('Could not open the PDF', 'Please try again.');
    }
  }

  print(): void {
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
  }
}
