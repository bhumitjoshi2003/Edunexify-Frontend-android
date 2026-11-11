import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, Injector } from '@angular/core';
import { WorkspaceService } from '../../services/workspace.service';
import { CoordinatorService } from '../../services/coordinator.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { Subject, takeUntil, of, switchMap } from 'rxjs';
import { NotificationService } from '../../services/notification.service';
import { AuthStateService } from '../../auth/auth-state.service';
import { Notification } from '../../interfaces/notification';
import { UserNotification } from '../../interfaces/user-notification';
import { LoggerService } from '../../services/logger.service';
import { ToastService } from '../../services/toast.service';
import { SchoolService } from '../../services/school.service';
import { NotificationStateService } from '../../services/notification-state.service';
import { TruncationCheckDirective } from '../../directives/truncation-check.directive';
import { NoticeDetailDialogComponent } from '../notice-detail-dialog/notice-detail-dialog.component';
import { EditNoticeDialogComponent } from '../edit-notice-dialog/edit-notice-dialog.component';

@Component({
  selector: 'app-notice',
  standalone: true,
  imports: [CommonModule, FormsModule, TruncationCheckDirective],
  templateUrl: './notice.component.html',
  styleUrl: './notice.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NoticeComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  role = '';
  private userId = '';

  // Admin: current page of posted notices — server-side paginated, never
  // accumulated. Only one page of notices is ever held in the browser.
  allNotices: Notification[] = [];
  readonly noticesPageSize = 10;
  noticesPage = 0;
  noticesTotalPages = 0;
  noticesTotalElements = 0;
  loadingNotices = false;

  // Student / Teacher: personal notifications
  userNotifications: UserNotification[] = [];
  userTotalElements = 0;
  userPage = 0;
  userLast = true;
  loadingMoreUser = false;

  // Compose form (admin)
  form = {
    title: '',
    subject: '',
    body: '',
    targetAudience: '',
    deliveryMode: 'BOTH',
  };

  submitting = false;
  loading = false;

  classList: string[] = [];
  /** Resolved only for a Coordinator, so other roles never need the service. */
  private get coordinators(): CoordinatorService { return this.injector.get(CoordinatorService); }

  /** IDs of notices/notifications whose message is actually clamp-truncated,
   *  determined by real overflow measurement (TruncationCheckDirective), not
   *  a character-count guess. Drives whether "Read more" renders at all. */
  truncatedIds = new Set<number>();

  constructor(
    private notificationService: NotificationService,
    private authStateService: AuthStateService,
    private cdr: ChangeDetectorRef,
    private logger: LoggerService,
    private toast: ToastService,
    private schoolService: SchoolService,
    private notificationState: NotificationStateService,
    private dialog: MatDialog,
    private injector: Injector
  ) { }

  ngOnInit(): void {
    const user = this.authStateService.getUser();
    this.role = user?.role ?? '';
    this.userId = user?.userId ?? '';
    if (!this.hasBulkCommunications) {
      this.form.deliveryMode = 'IN_APP';
    }
    this.schoolService.getClasses().pipe(
      // A Coordinator writes to classes they coordinate in full; school-wide audiences stay with Principal/Admin.
      switchMap(names => this.coordinatorView ? this.coordinators.restrictClassNames(names) : of(names)),
      takeUntil(this.destroy$)
    ).subscribe(classes => {
      this.classList = classes;
      this.cdr.markForCheck();
    });
    this.loadData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Publishing view: the Admin, and the Principal for school notices. */
  get isAdmin(): boolean {
    return this.role === 'ADMIN' || this.role === 'SUPER_ADMIN' || this.role === 'PRINCIPAL' || this.coordinatorView;
  }

  /** A Coordinator reads school notices and sends them to their own classes only (the server enforces it). */
  get coordinatorView(): boolean {
    return this.role === 'TEACHER' && WorkspaceService.leadershipView(this.authStateService);
  }

  /** The Principal withdraws only notices they published; the server enforces the same rule. */
  canDeleteNotice(notice: { createdBy?: string }): boolean {
    if (this.coordinatorView) return false;
    return this.role !== 'PRINCIPAL' || (!!notice.createdBy && notice.createdBy === this.userId);
  }

  get requiresSubject(): boolean {
    return this.form.deliveryMode === 'EMAIL' || this.form.deliveryMode === 'BOTH';
  }

  get hasBulkCommunications(): boolean {
    return this.authStateService.hasFeature('BULK_COMMUNICATIONS');
  }

  get unreadCount(): number {
    return this.userNotifications.filter(n => !n.isRead).length;
  }

  // ── Data loading ─────────────────────────────────────────────────────

  loadData(): void {
    if (this.isAdmin) {
      this.loadNotices(0);
      return;
    }
    this.loading = true;
    this.cdr.markForCheck();
    this.userPage = 0;
    this.notificationService.getUserNotifications(0)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.userNotifications = res.content;
          this.userTotalElements = res.totalElements;
          this.userLast = res.last;
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: (e) => { this.logger.error('Error loading notifications:', e); this.loading = false; this.cdr.markForCheck(); },
      });
  }

  /** Loads exactly one page of the admin's posted-notices list — server-side
   *  pageable, never accumulated. Replaces allNotices rather than appending. */
  loadNotices(page: number): void {
    if (this.loadingNotices) return;
    this.loadingNotices = true;
    this.cdr.markForCheck();
    this.notificationService.getAllNotifications(page, this.noticesPageSize)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.allNotices = res.content;
          this.noticesPage = res.pageable.pageNumber;
          this.noticesTotalPages = res.totalPages;
          this.noticesTotalElements = res.totalElements;
          this.loadingNotices = false;
          this.cdr.markForCheck();
        },
        error: (e) => {
          this.logger.error('Error loading notices:', e);
          this.loadingNotices = false;
          this.toast.error('Error', 'Failed to load notices.');
          this.cdr.markForCheck();
        },
      });
  }

  goToPreviousNoticesPage(): void {
    if (this.noticesPage > 0) this.loadNotices(this.noticesPage - 1);
  }

  goToNextNoticesPage(): void {
    if (this.noticesPage + 1 < this.noticesTotalPages) this.loadNotices(this.noticesPage + 1);
  }

  loadMoreUserNotifications(): void {
    if (this.userLast || this.loadingMoreUser) return;
    this.loadingMoreUser = true;
    this.cdr.markForCheck();
    this.notificationService.getUserNotifications(this.userPage + 1)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.userNotifications = [...this.userNotifications, ...res.content];
          this.userPage = res.pageable.pageNumber;
          this.userLast = res.last;
          this.loadingMoreUser = false;
          this.cdr.markForCheck();
        },
        error: (e) => { this.logger.error('Error loading more notifications:', e); this.loadingMoreUser = false; this.cdr.markForCheck(); },
      });
  }

  // ── Admin: post notice ───────────────────────────────────────────────

  postNotice(): void {
    const title = this.form.title?.trim() ?? '';
    const body = this.form.body?.trim() ?? '';

    if (!title || title.length > 200) {
      this.toast.warning('Validation', 'Notice title must be between 1 and 200 characters.');
      return;
    }
    if (!body || body.length > 5000) {
      this.toast.warning('Validation', 'Notice message must be between 1 and 5,000 characters.');
      return;
    }
    const htmlPattern = /<[^>]*>/g;
    if (htmlPattern.test(title) || htmlPattern.test(body)) {
      this.toast.warning('Invalid Format', 'HTML tags are not allowed in notices. Please use plain text.');
      return;
    }

    if (!this.form.targetAudience) {
      this.toast.warning('Incomplete', 'Please fill in all required fields.');
      return;
    }
    if (this.requiresSubject && !this.form.subject.trim()) {
      this.toast.warning('Incomplete', 'Subject is required for email delivery.');
      return;
    }

    this.toast.confirm({
      title: 'Post this notice?',
      confirmText: 'Yes, post it',
      cancelText: 'Cancel',
    }).then((confirmed) => {
      if (!confirmed) return;
      this.submitting = true;
      this.cdr.markForCheck();

      const payload = {
        title: this.form.title.trim(),
        subject: this.form.subject.trim(),
        body: this.form.body.trim(),
        targetClass: this.form.targetAudience,
        deliveryMode: this.form.deliveryMode,
      };

      this.notificationService.sendNotice(payload)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.submitting = false;
            this.form = { title: '', subject: '', body: '', targetAudience: '', deliveryMode: 'BOTH' };
            this.toast.success('Notice Posted!', 'The notice has been sent successfully.');
            // Newly created notices sort first (createdAt desc) — return to page 0 so it's visible.
            this.loadNotices(0);
          },
          error: (e) => {
            this.submitting = false;
            this.logger.error('Error posting notice:', e);
            this.toast.error('Error', 'Failed to post the notice. Please try again.');
            this.cdr.markForCheck();
          },
        });
    });
  }

  // ── Admin: edit notice ───────────────────────────────────────────────

  /** Opens the Edit Notice dialog rather than an inline editor — the card list
   *  is a narrow, scrollable area and can't reliably fit a form plus its
   *  Save/Cancel actions without clipping them. The dialog owns the save call
   *  itself, so a failed save keeps the dialog open with the error visible. */
  openEditDialog(notice: Notification): void {
    const ref = this.dialog.open(EditNoticeDialogComponent, {
      panelClass: 'edu-dialog',
      maxWidth: '560px',
      width: '92vw',
      autoFocus: false,
      data: {
        id: notice.id!,
        title: notice.title,
        message: notice.message,
        type: notice.type,
        audience: notice.audience ?? '',
      },
    });
    ref.afterClosed().pipe(takeUntil(this.destroy$)).subscribe((saved) => {
      if (!saved) return;
      this.toast.success('Updated');
      // Refetch the page the admin is already on — editing doesn't change
      // sort order or item count, so there's no reason to reset to page 0.
      this.loadNotices(this.noticesPage);
    });
  }

  // ── Admin: delete notice ─────────────────────────────────────────────

  deleteNotice(id: number): void {
    this.toast.confirm({
      title: 'Delete this notice?',
      message: 'This action cannot be undone.',
      confirmText: 'Yes, delete',
      cancelText: 'Cancel',
      danger: true,
    }).then((confirmed) => {
      if (!confirmed) return;
      this.notificationService.deleteNotification(id)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.toast.success('Deleted');
            // Deleting the last item on a page (other than the first) leaves it
            // empty — step back one page rather than showing a stranded blank page.
            const wasOnlyItemOnPage = this.allNotices.length === 1 && this.noticesPage > 0;
            this.loadNotices(wasOnlyItemOnPage ? this.noticesPage - 1 : this.noticesPage);
          },
          error: (e) => {
            this.logger.error('Error deleting notice:', e);
            this.toast.error('Error', 'Failed to delete the notice.');
          },
        });
    });
  }

  // ── Student/Teacher: mark all read ──────────────────────────────────

  markAllRead(): void {
    this.notificationService.markAllNotificationsAsRead()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.userNotifications = this.userNotifications.map(n => ({ ...n, isRead: true }));
          this.notificationState.allRead();
          this.cdr.markForCheck();
        },
        error: (e) => {
          this.logger.error('Error marking notifications as read:', e);
          this.toast.error('Error', 'Failed to mark notifications as read.');
        },
      });
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  formatAudience(audience: string = ''): string {
    if (audience === 'ALL') return 'All Students';
    if (audience === 'TEACHERS') return 'All Teachers';
    if (audience.startsWith('CLASS_WITH_TEACHER:'))
      return `Class ${audience.replace('CLASS_WITH_TEACHER:', '')} + Class Teacher`;
    if (audience.startsWith('CLASS:'))
      return `Class ${audience.replace('CLASS:', '')} — Students`;
    return audience;
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  trackById(_: number, item: { id?: number }): number { return item.id ?? 0; }

  onTruncated(id: number | undefined, isTruncated: boolean): void {
    if (id == null) return;
    const changed = isTruncated ? !this.truncatedIds.has(id) : this.truncatedIds.has(id);
    if (isTruncated) this.truncatedIds.add(id); else this.truncatedIds.delete(id);
    if (changed) this.cdr.markForCheck();
  }

  openDetail(title: string, message: string, meta?: string): void {
    this.dialog.open(NoticeDetailDialogComponent, {
      panelClass: 'edu-dialog',
      maxWidth: '92vw',
      width: '480px',
      autoFocus: false,
      data: { title, message, meta }
    });
  }

  getNoticeAccent(index: number): string {
    const palette = ['#6366f1', '#0891b2', '#059669', '#d97706', '#dc2626', '#7c3aed', '#db2777', '#0284c7'];
    return palette[index % palette.length];
  }

  getNoticeIcon(title: string): string {
    const t = (title ?? '').toLowerCase();
    if (t.includes('fee') || t.includes('payment') || t.includes('due')) return '💰';
    if (t.includes('exam') || t.includes('test') || t.includes('result') || t.includes('mark')) return '📝';
    if (t.includes('holiday') || t.includes('vacation') || t.includes('break') || t.includes('closed')) return '🎉';
    if (t.includes('leave')) return '🏖️';
    if (t.includes('meeting') || t.includes('parent')) return '👥';
    if (t.includes('sport') || t.includes('game') || t.includes('match')) return '🏆';
    if (t.includes('event') || t.includes('fest') || t.includes('cultural') || t.includes('function')) return '🎭';
    if (t.includes('schedule') || t.includes('timetable') || t.includes('class')) return '📅';
    if (t.includes('health') || t.includes('medical') || t.includes('clinic')) return '🏥';
    if (t.includes('trip') || t.includes('tour') || t.includes('excursion')) return '🚌';
    return '📌';
  }
}
