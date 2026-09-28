import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { ReportCardDocument, ReportCardV2Service } from '../../../services/report-card-v2.service';
import { AcademicSessionService } from '../../../services/academic-session.service';
import { ToastService } from '../../../services/toast.service';

/**
 * A student's (or, with ?studentId, a parent's linked child's) published report cards: only the
 * active, official copies. The server decides what the caller may see.
 */
@Component({
  selector: 'app-rc2-my-report-cards',
  standalone: true,
  imports: [CommonModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['../rc2-shared.css'],
  styles: [`
    .mrc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }
    .mrc-item { display: flex; flex-direction: column; gap: 6px; padding: 16px; border: 1px solid var(--edu-border, #e2e8f0); border-radius: 14px;
      background: #fff; color: inherit; text-decoration: none; transition: border-color 0.15s, box-shadow 0.15s; }
    .mrc-item:hover, .mrc-item:focus-visible { border-color: var(--rc2-btn-border); box-shadow: 0 4px 14px rgba(30, 58, 95, 0.12); outline: none; }
    .mrc-title { margin: 0; font-size: var(--edu-text-md, 1rem); font-weight: 800; color: var(--edu-text, #1e293b); }
    .mrc-meta { margin: 0; font-size: var(--edu-text-sm, 0.82rem); color: var(--edu-text-sec, #64748b); }
    .mrc-open { margin-top: 6px; font-weight: 700; color: var(--rc2-btn); font-size: var(--edu-text-sm, 0.82rem); }
    .mrc-older { margin: 12px 0 0; font-size: var(--edu-text-sm, 0.82rem); color: var(--edu-text-sec, #64748b); }
    .mrc-older button { padding: 0; border: 0; background: none; color: var(--rc2-btn); font: inherit; font-weight: 700; text-decoration: underline; cursor: pointer; }
  `],
  template: `
    <div class="rc2-page">
      <div class="rc2-hero">
        <div class="rc2-blob rc2-blob-1"></div>
        <div class="rc2-blob rc2-blob-2"></div>
        <div class="rc2-hero-icon" aria-hidden="true">🎓</div>
        <div class="rc2-hero-text">
          <h1 class="rc2-hero-title">Report Cards</h1>
          <p class="rc2-hero-sub">Official report cards issued by the school. Each one carries a QR code anyone can scan to check it is genuine.</p>
        </div>
      </div>

      <div class="rc2-card" *ngIf="state === 'loading'" aria-busy="true" aria-label="Loading report cards">
        <div class="rc2-skeleton"><div class="rc2-sk-row" *ngFor="let i of [1,2,3]"><span class="sk-shimmer" style="width: 40%"></span><span class="sk-shimmer" style="width: 20%"></span></div></div>
      </div>

      <div class="rc2-card" *ngIf="state === 'error'">
        <div class="rc2-empty">
          <div class="rc2-empty-icon">⚠️</div>
          <p class="rc2-empty-title">Couldn't load report cards</p>
          <p class="rc2-empty-sub">{{ error }}</p>
          <button type="button" class="rc2-btn rc2-btn-outline" (click)="load()">Try again</button>
        </div>
      </div>

      <div class="rc2-card" *ngIf="state === 'loaded'">
        <div class="rc2-empty" *ngIf="documents.length === 0">
          <div class="rc2-empty-icon">📭</div>
          <p class="rc2-empty-title">No report cards yet</p>
          <p class="rc2-empty-sub">Report cards appear here once the school publishes them.</p>
        </div>
        <div class="mrc-grid" *ngIf="documents.length">
          <a class="mrc-item" *ngFor="let d of documents; trackBy: trackById" [routerLink]="['/dashboard/report-card-documents', d.id]"
             [queryParams]="studentId ? { studentId } : {}">
            <p class="mrc-title">{{ d.title }}</p>
            <p class="mrc-meta">{{ d.studentName }} · Class {{ d.className }}<ng-container *ngIf="d.sectionName"> – {{ d.sectionName }}</ng-container></p>
            <p class="mrc-meta">Session {{ d.sessionLabel }} · issued {{ d.issuedAt | date:'d MMM y' }}</p>
            <p class="mrc-meta">Ref {{ d.reference }}</p>
            <span class="mrc-open">Open report card →</span>
          </a>
        </div>
        <p class="mrc-older">Looking for a report card issued before these? <button type="button" (click)="openOlder()">Earlier report cards</button></p>
      </div>
    </div>
  `,
})
export class Rc2MyReportCardsComponent implements OnInit, OnDestroy {
  state: 'loading' | 'loaded' | 'error' = 'loading';
  documents: ReportCardDocument[] = [];
  studentId: string | null = null;
  error = 'Please try again.';
  private destroy$ = new Subject<void>();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private api: ReportCardV2Service,
    private sessions: AcademicSessionService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.route.queryParamMap.pipe(takeUntil(this.destroy$)).subscribe(q => {
      this.studentId = q.get('studentId');
      this.load();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(): void {
    this.state = 'loading';
    this.cdr.markForCheck();
    this.api.myDocuments(this.studentId).pipe(takeUntil(this.destroy$)).subscribe({
      next: docs => { this.documents = docs; this.state = 'loaded'; this.cdr.markForCheck(); },
      error: e => {
        this.error = e?.error?.message || 'Please try again.';
        this.state = 'error';
        this.cdr.markForCheck();
      },
    });
  }

  /** The earlier (pre-V2) report card page, which needs a session. */
  openOlder(): void {
    this.sessions.getCurrentSession().pipe(takeUntil(this.destroy$)).subscribe({
      next: session => this.router.navigate(['/dashboard/report-card'], {
        queryParams: { ...(this.studentId ? { studentId: this.studentId } : {}), session: session.label },
      }),
      error: () => this.toast.error('Could not open earlier report cards', 'No active academic session found.'),
    });
  }

  trackById(_: number, d: ReportCardDocument): number { return d.id; }
}
