import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { ReportCardDocument, ReportCardV2Service } from '../../../services/report-card-v2.service';
import { ToastService } from '../../../services/toast.service';
import { ChildAccess } from '../../../interfaces/parent-portal';
import { ParentChildContextComponent } from '../../parent-child-context/parent-child-context.component';

/**
 * A student's (or, with ?studentId, a parent's linked child's) published report cards: only the
 * active, official copies. The server decides what the caller may see.
 */
@Component({
  selector: 'app-rc2-my-report-cards',
  standalone: true,
  imports: [CommonModule, RouterLink, ParentChildContextComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['../rc2-shared.css'],
  styles: [`
    app-parent-child-context { display: block; margin-bottom: -14px; }
    .mrc-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
    .mrc-head-title { margin: 0; font-size: var(--edu-text-md, 1rem); font-weight: 800; color: var(--edu-text, #1e293b); }
    .mrc-head-sub { margin: 2px 0 0; font-size: var(--edu-text-sm, 0.82rem); color: var(--edu-text-sec, #64748b); }
    .mrc-count { padding: 4px 12px; border-radius: 999px; background: #eef2f7; color: #1e3a5f; font-size: 0.75rem; font-weight: 800; }
    .mrc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr)); gap: 16px; }

    /* One official document: a paper thumbnail with a seal, then its details and the action. */
    .mrc-item {
      position: relative; display: flex; flex-direction: column; overflow: hidden;
      border: 1px solid #e2e8f0; border-radius: 16px; background: #fff; color: inherit; text-decoration: none;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
      transition: border-color 0.18s, box-shadow 0.18s, transform 0.18s;
    }
    .mrc-item:hover, .mrc-item:focus-visible {
      border-color: #9fb3cc; box-shadow: 0 12px 28px rgba(30, 58, 95, 0.14); transform: translateY(-2px); outline: none;
    }
    .mrc-item:focus-visible { box-shadow: 0 0 0 3px rgba(30, 58, 95, 0.25), 0 12px 28px rgba(30, 58, 95, 0.14); }
    .mrc-cover {
      position: relative; display: flex; align-items: center; gap: 14px; padding: 18px 18px 16px;
      background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 70%, #2d5a8a 100%); color: #fff;
    }
    .mrc-cover::after {
      content: ""; position: absolute; width: 120px; height: 120px; right: -36px; top: -48px;
      border-radius: 50%; background: rgba(255, 255, 255, 0.08); pointer-events: none;
    }
    .mrc-paper {
      position: relative; flex-shrink: 0; width: 46px; height: 58px; border-radius: 5px; background: #fdfbf6;
      box-shadow: 0 6px 14px rgba(0, 0, 0, 0.28); padding: 8px 7px; display: grid; gap: 4px; align-content: start;
    }
    .mrc-paper i { display: block; height: 3px; border-radius: 2px; background: #cbd5e1; }
    .mrc-paper i:first-child { width: 70%; background: #1e3a5f; }
    .mrc-paper i:nth-child(3) { width: 80%; }
    .mrc-seal {
      position: absolute; right: -7px; bottom: -7px; width: 20px; height: 20px; border-radius: 50%;
      background: #c29b4b; border: 2px solid #fdfbf6; display: grid; place-items: center; color: #fff;
    }
    .mrc-cover-text { position: relative; z-index: 1; min-width: 0; }
    .mrc-badges { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; }
    .mrc-badge {
      display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 999px;
      background: rgba(255, 255, 255, 0.16); font-size: 0.66rem; font-weight: 800; letter-spacing: 0.4px; text-transform: uppercase;
    }
    .mrc-badge-verified { background: rgba(134, 239, 172, 0.2); color: #bbf7d0; }
    .mrc-title { margin: 0; font-size: 0.98rem; font-weight: 800; line-height: 1.3; color: #fff; overflow-wrap: anywhere; }

    .mrc-body { display: grid; gap: 10px; padding: 16px 18px 6px; }
    .mrc-row { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .mrc-row-icon {
      flex-shrink: 0; width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center;
      background: #f1f5f9; color: #1e3a5f;
    }
    .mrc-row-text { min-width: 0; display: flex; flex-direction: column; }
    .mrc-label { font-size: 0.66rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; color: #94a3b8; }
    .mrc-value { font-size: 0.84rem; font-weight: 600; color: #1e293b; overflow-wrap: anywhere; }
    .mrc-ref {
      display: inline-block; margin-top: 1px; padding: 2px 8px; border-radius: 6px; background: #f8fafc; border: 1px solid #e2e8f0;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.78rem; color: #334155; letter-spacing: 0.3px;
    }
    .mrc-foot { margin-top: auto; padding: 12px 18px 16px; }
    .mrc-open {
      display: flex; align-items: center; justify-content: center; gap: 6px; padding: 10px 14px; border-radius: 10px;
      background: var(--rc2-btn, #1e3a5f); color: #fff; font-weight: 700; font-size: var(--edu-text-sm, 0.82rem);
      transition: background 0.15s;
    }
    .mrc-item:hover .mrc-open, .mrc-item:focus-visible .mrc-open { background: var(--rc2-btn-hover, #264b78); }

    @media (max-width: 480px) {
      .mrc-cover { padding: 16px 14px 14px; }
      .mrc-body { padding: 14px 14px 4px; }
      .mrc-foot { padding: 10px 14px 14px; }
    }
  `],
  template: `
    <div class="rc2-page">
      <app-parent-child-context *ngIf="studentId" [studentId]="studentId" requiredPermission="canViewResults"
        (childSelected)="onChildSelected($event)"></app-parent-child-context>
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
        <ng-container *ngIf="documents.length">
          <div class="mrc-head">
            <div>
              <p class="mrc-head-title">Issued report cards</p>
              <p class="mrc-head-sub">Open a card to view, download or print the official copy.</p>
            </div>
            <span class="mrc-count">{{ documents.length }} {{ documents.length === 1 ? 'card' : 'cards' }}</span>
          </div>
          <div class="mrc-grid">
            <a class="mrc-item" *ngFor="let d of documents; trackBy: trackById" [routerLink]="['/dashboard/report-card-documents', d.id]"
               [queryParams]="studentId ? { studentId } : {}">
              <div class="mrc-cover">
                <span class="mrc-paper" aria-hidden="true"><i></i><i></i><i></i><i></i>
                  <span class="mrc-seal"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>
                </span>
                <div class="mrc-cover-text">
                  <div class="mrc-badges">
                    <span class="mrc-badge">Official copy</span>
                    <span class="mrc-badge mrc-badge-verified">QR verifiable</span>
                  </div>
                  <p class="mrc-title">{{ d.title }}</p>
                </div>
              </div>
              <div class="mrc-body">
                <div class="mrc-row">
                  <span class="mrc-row-icon" aria-hidden="true"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></span>
                  <span class="mrc-row-text"><span class="mrc-label">Student</span>
                    <span class="mrc-value">{{ d.studentName }} · {{ d.className?.startsWith('Class') ? d.className : 'Class ' + d.className }}<ng-container *ngIf="d.sectionName"> – {{ d.sectionName }}</ng-container></span></span>
                </div>
                <div class="mrc-row">
                  <span class="mrc-row-icon" aria-hidden="true"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></span>
                  <span class="mrc-row-text"><span class="mrc-label">Session</span>
                    <span class="mrc-value">Session {{ d.sessionLabel }} · issued {{ d.issuedAt | date:'d MMM y' }}</span></span>
                </div>
                <div class="mrc-row">
                  <span class="mrc-row-icon" aria-hidden="true"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h3v-3"/></svg></span>
                  <span class="mrc-row-text"><span class="mrc-label">Reference</span>
                    <span class="mrc-ref">Ref {{ d.reference }}</span></span>
                </div>
              </div>
              <div class="mrc-foot"><span class="mrc-open">Open report card →</span></div>
            </a>
          </div>
        </ng-container>
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
      next: docs => {
        // The API includes issued cards from every academic session; order newest first.
        this.documents = [...docs].sort((a, b) =>
          new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime() || b.id - a.id);
        this.state = 'loaded';
        this.cdr.markForCheck();
      },
      error: e => {
        this.error = e?.error?.message || 'Please try again.';
        this.state = 'error';
        this.cdr.markForCheck();
      },
    });
  }

  /** A parent switching child: the list reloads for that child through the studentId query param. */
  onChildSelected(child: ChildAccess): void {
    if (!child.canViewResults) {
      this.toast.error('Results access unavailable', 'Please contact the school administrator.');
      return;
    }
    this.router.navigate([], { relativeTo: this.route, queryParams: { studentId: child.studentId }, replaceUrl: true });
  }

  trackById(_: number, d: ReportCardDocument): number { return d.id; }
}
