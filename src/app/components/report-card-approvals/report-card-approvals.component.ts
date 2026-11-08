import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Inject,
  OnDestroy,
  OnInit,
  Optional,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
} from '@angular/material/dialog';
import { Subject, catchError, finalize, of, switchMap, takeUntil } from 'rxjs';
import { AuthStateService } from '../../auth/auth-state.service';
import { ReportCardPdfDeliveryService } from '../../services/report-card-pdf-delivery.service';
import { ToastService } from '../../services/toast.service';
import {
  ApprovalAction,
  ApprovalHistory,
  ApprovalItem,
  ReportCardApprovalService,
  ReviewSummary,
} from '../../services/report-card-approval.service';

@Component({
  standalone: true,
  imports: [MatDialogModule],
  template: `<div class="review-preview" role="region" aria-label="Report card review preview">
    <div class="review-preview__header">
      <div>
        <h2>Report card preview</h2>
        <p>Review copy · Not an issued report card</p>
      </div>
      <button class="review-preview__close" type="button" mat-dialog-close aria-label="Close report card preview" title="Close preview">
        <span aria-hidden="true">×</span>
      </button>
    </div>
    <iframe [src]="url" title="Frozen report card review"></iframe>
  </div>`,
  styles: [
    `
      .review-preview { display:flex; flex-direction:column; height:min(86dvh, 1000px); min-height:320px; background:#f8fafc; overflow:hidden; }
      .review-preview__header { display:flex; justify-content:space-between; align-items:center; gap:16px; padding:12px 16px; background:#fff; border-bottom:1px solid #e2e8f0; }
      .review-preview__header h2 { font-size:1.05rem; margin:0; color:#1e293b; font-weight:700; }
      .review-preview__header p { margin:3px 0 0; font-size:.8rem; color:#64748b; }
      .review-preview__close { width:40px; height:40px; flex:none; display:grid; place-items:center; border:1px solid #e2e8f0; border-radius:12px; background:#f8fafc; color:#334155; font:inherit; font-size:1.8rem; line-height:1; cursor:pointer; }
      .review-preview__close:hover { background:#e2e8f0; }
      .review-preview__close:focus-visible { outline:3px solid #0ea5e9; outline-offset:2px; }
      .review-preview iframe { flex:1; width:100%; min-height:0; border:0; }
      @media (max-width:600px) { .review-preview { height:90dvh; } .review-preview__header { padding:10px 12px; } }
    `,
  ],
})
export class ReviewPdfDialogComponent {
  url: SafeResourceUrl;
  constructor(@Inject(MAT_DIALOG_DATA) data: string, sanitizer: DomSanitizer) {
    this.url = sanitizer.bypassSecurityTrustResourceUrl(data);
  }
}

@Component({
  standalone: true,
  selector: 'app-report-card-approvals',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './report-card-approvals.component.html',
  styleUrls: ['./report-card-approvals.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportCardApprovalsComponent implements OnInit, OnDestroy {
  items: ApprovalItem[] = [];
  role: string;
  loading = false;
  reviewing = false;
  busy = false;
  error = '';
  selected: ApprovalItem | null = null;
  summary: ReviewSummary | null = null;
  history: ApprovalHistory[] = [];
  includeIncomplete = false;
  selectedStudent = '';
  reason = '';
  returning = false;
  private focusSetup: number | null = null;
  private focusSection: number | null = null;
  private focusedKey = '';
  private destroyed = false;
  private destroy$ = new Subject<void>();
  private reviewRequests$ = new Subject<{
    item: ApprovalItem;
    include: boolean;
  }>();
  private queueRequests$ = new Subject<void>();
  private actionIds = new Map<string, string>();
  private previewUrls = new Set<string>();
  private dialogRef: ReturnType<MatDialog['open']> | null = null;
  constructor(
    private api: ReportCardApprovalService,
    auth: AuthStateService,
    private cdr: ChangeDetectorRef,
    private delivery: ReportCardPdfDeliveryService,
    private toast: ToastService,
    private dialog: MatDialog,
    @Optional() private route: ActivatedRoute | null
  ) {
    this.role = auth.getUserRole();
  }
  ngOnInit(): void {
    this.route?.queryParamMap.pipe(takeUntil(this.destroy$)).subscribe(params => {
      const setup = Number(params.get('setupId'));
      const section = Number(params.get('sectionId'));
      this.focusSetup = Number.isSafeInteger(setup) && setup > 0 ? setup : null;
      this.focusSection = Number.isSafeInteger(section) && section > 0 ? section : null;
      this.focusedKey = '';
      if (this.items.length) this.focusNotification();
    });
    this.queueRequests$
      .pipe(
        switchMap(() =>
          this.api.queue().pipe(
            catchError(() => {
              this.error =
                'Could not load the approval queue. Retry when connected.';
              return of(null);
            })
          )
        ),
        takeUntil(this.destroy$)
      )
      .subscribe((items) => {
        if (items) { this.items = items;this.focusNotification(); }
        this.loading = false;
        this.cdr.markForCheck();
      });
    this.reviewRequests$
      .pipe(
        switchMap(({ item, include }) =>
          this.api.review(item, include).pipe(
            catchError((response) => {
              this.error =
                response?.error?.message ||
                'Could not prepare this review. Check the responsible teacher and retry.';
              return of(null);
            })
          )
        ),
        takeUntil(this.destroy$)
      )
      .subscribe((summary) => {
        this.summary = summary;
        this.reviewing = false;
        if (summary) this.includeIncomplete = summary.includeIncomplete;
        this.cdr.markForCheck();
      });
    this.load();
  }
  private focusNotification(): void {
    if (!this.focusSetup) return;
    const key = `${this.focusSetup}:${this.focusSection ?? 'all'}`;
    if (this.focusedKey === key) return;
    this.focusedKey = key;
    const item = this.items.find(entry => entry.setupId === this.focusSetup && entry.sectionId === this.focusSection);
    if (item) this.review(item);
    else this.error = 'The report-card review referenced by this notification is no longer available to your account.';
  }
  ngOnDestroy(): void {
    this.destroyed = true;
    this.dialogRef?.close();
    this.previewUrls.forEach((url) => URL.revokeObjectURL(url));
    this.previewUrls.clear();
    this.destroy$.next();
    this.destroy$.complete();
  }
  load(): void {
    if (this.busy) return;
    this.loading = true;
    this.error = '';
    this.queueRequests$.next();
  }
  key(item: ApprovalItem): string {
    return `${item.setupId}:${item.sectionId ?? 'all'}`;
  }
  track = (_: number, item: ApprovalItem) => this.key(item);
  label(status: string): string {
    return (
      (
        {
          PENDING_TEACHER: 'Awaiting teacher',
          TEACHER_APPROVED: 'Awaiting Principal',
          PRINCIPAL_APPROVED: 'Approved for Admin publication',
          RETURNED: 'Returned to teacher',
          STALE: 'Review needs validation',
        } as Record<string, string>
      )[status] || status
    );
  }
  review(item: ApprovalItem): void {
    if (this.busy) return;
    this.selected = item;
    this.summary = null;
    this.selectedStudent = '';
    this.history = [];
    this.reason = '';
    this.returning = false;
    this.error = '';
    this.reviewing = true;
    this.reviewRequests$.next({ item, include: this.includeIncomplete });
  }
  canApprove(): boolean {
    const s = this.summary;
    if (!s || this.busy || this.reviewing || !s.includedStudents) return false;
    if (this.role === 'TEACHER') return s.state.status !== 'PRINCIPAL_APPROVED';
    return (
      this.role === 'PRINCIPAL' &&
      s.state.status === 'TEACHER_APPROVED' &&
      s.state.reviewRevisionId === s.revisionId &&
      !s.state.stale
    );
  }
  async act(action: ApprovalAction): Promise<void> {
    const allowed =
      this.role === 'TEACHER'
        ? action === 'teacher-approve'
        : this.role === 'PRINCIPAL' && action !== 'teacher-approve';
    if (!allowed) return;
    const item = this.selected,
      summary = this.summary;
    if (
      !item ||
      !summary ||
      this.busy ||
      !this.canApprove() ||
      (action === 'return' && !this.reason.trim())
    )
      return;
    this.busy = true;
    const scope = `${summary.academicSession} · ${summary.setupName} · Class ${
      summary.className
    }${summary.sectionName ? ' / ' + summary.sectionName : ''}`;
    const ok = await this.toast.confirm({
      title:
        action === 'return'
          ? 'Return this revision for correction?'
          : 'Approve this exact review revision?',
      message: `${scope}\n${summary.includedStudents} included of ${
        summary.totalStudents
      } students; ${summary.excludedStudents} excluded; ${
        summary.incompleteCards
      } incomplete cards; ${summary.missingMarks} missing marks.\nPolicy: ${
        summary.includeIncomplete
          ? 'Include incomplete cards'
          : 'Exclude incomplete cards'
      }.\nReview revision: ${summary.revisionId}${
        action === 'return' ? '\nReason: ' + this.reason.trim() : ''
      }`,
      confirmText:
        action === 'return' ? 'Return to teacher' : 'Approve revision',
      icon: 'question',
    });
    if (!ok) {
      this.busy = false;
      this.cdr.markForCheck();
      return;
    }
    // Ignore confirmation results after leaving the page or changing the review.
    if (this.destroyed || this.selected !== item || this.summary !== summary) {
      this.busy = false;
      return;
    }
    const idKey = `${summary.revisionId}:${summary.state.status}:${
      summary.state.stateVersion
    }:${action}:${action === 'return' ? this.reason.trim() : ''}`;
    let id = this.actionIds.get(idKey);
    if (!id) {
      id = crypto.randomUUID();
      this.actionIds.set(idKey, id);
    }
    this.api
      .act(item, action, summary.revisionId, id, this.reason.trim())
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (state) => {
          this.busy = false;
          this.summary = { ...summary, state };
          this.returning = false;
          this.reason = '';
          this.toast.success(
            action === 'return' ? 'Returned for correction' : 'Review approved',
            action === 'return'
              ? 'The teacher must correct and review this scope again.'
              : 'The approval was recorded for this exact revision.'
          );
          this.load();
          this.cdr.markForCheck();
        },
        error: (response) => {
          this.busy = false;
          if (response.status === 409) {
            this.summary = null;
            this.error =
              'This review is no longer approvable. Reload and review the updated revision before trying again.';
          } else
            this.error =
              response?.error?.message ||
              'The action could not be confirmed. Retry safely when connected.';
          this.toast.error('Review not recorded', this.error);
          this.cdr.markForCheck();
        },
      });
  }
  loadHistory(): void {
    const item = this.selected;
    if (!item) return;
    this.api
      .history(item)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (history) => {
          if (this.selected === item) {
            this.history = history;
            this.cdr.markForCheck();
          }
        },
        error: () => this.toast.error('Could not load approval history'),
      });
  }
  preview(): void {
    const item = this.selected,
      summary = this.summary,
      student = this.selectedStudent;
    if (!item || !summary || !student || this.busy) return;
    this.busy = true;
    this.api
      .preview(item, summary.revisionId, student)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.busy = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: async (blob) => {
          try {
            if (this.delivery.native)
              await this.delivery.share(
                blob,
                `Review_${summary.revisionId}_${encodeURIComponent(
                  student
                )}.pdf`
              );
            else {
              const url = URL.createObjectURL(blob);
              this.previewUrls.add(url);
              this.dialogRef = this.dialog.open(ReviewPdfDialogComponent, {
                data: url,
                width: '1100px',
                maxWidth: '96vw',
                restoreFocus: true,
              });
              this.dialogRef
                .afterClosed()
                .pipe(takeUntil(this.destroy$))
                .subscribe(() => {
                  URL.revokeObjectURL(url);
                  this.previewUrls.delete(url);
                });
            }
          } catch {
            this.toast.error('Could not open the review PDF');
          }
        },
        error: () =>
          this.toast.error(
            'Could not load the review PDF',
            'Reload the review and retry.'
          ),
      });
  }
}
