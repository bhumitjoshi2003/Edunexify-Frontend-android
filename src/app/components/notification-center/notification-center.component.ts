import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { PageHeaderComponent } from '../ui/page-header/page-header.component';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription, catchError, firstValueFrom, map, of, switchMap, takeUntil } from 'rxjs';
import { UserNotification } from '../../interfaces/user-notification';
import { NotificationService } from '../../services/notification.service';
import { NotificationStateService } from '../../services/notification-state.service';
import { NotificationNavigationService } from '../../services/notification-navigation.service';
import { ToastService } from '../../services/toast.service';
import { TruncationCheckDirective } from '../../directives/truncation-check.directive';
import { NoticeDetailDialogComponent } from '../notice-detail-dialog/notice-detail-dialog.component';

type InboxFilter = 'ALL' | 'UNREAD';
interface InboxRequest { page: number; reset: boolean; isRead?: boolean; category?: string; }

@Component({ selector: 'app-notification-center', standalone: true,
  imports: [CommonModule, MatIconModule, FormsModule, TruncationCheckDirective, PageHeaderComponent], templateUrl: './notification-center.component.html',
  styleUrl: './notification-center.component.css', changeDetection: ChangeDetectionStrategy.OnPush })
export class NotificationCenterComponent implements OnInit, OnDestroy {
  notifications: UserNotification[] = [];
  filter: InboxFilter = 'ALL';
  category = 'ALL';
  readonly categories = ['ACCOUNT_SECURITY', 'ATTENDANCE', 'LEAVE', 'FEES_PAYMENTS',
    'ACADEMICS_RESULTS', 'NOTICE_ANNOUNCEMENT', 'EVENT_CALENDAR', 'SYSTEM_ADMIN'];
  page = 0; readonly pageSize = 20; totalPages = 0; totalElements = 0;
  loading = false; loadingMore = false; error = false; unreadCount = 0;
  private readonly destroy$ = new Subject<void>();
  private readonly loadRequest$ = new Subject<InboxRequest>();
  private inboxRequest?: Subscription;

  /** Inbox IDs whose message is actually clamp-truncated, determined by real
   *  overflow measurement (TruncationCheckDirective), not a character-count
   *  guess. Drives whether "Read more" renders at all. */
  readonly truncatedIds = new Set<number>();

  constructor(private api: NotificationService, private state: NotificationStateService,
    private navigation: NotificationNavigationService, private toast: ToastService,
    private cdr: ChangeDetectorRef, private dialog: MatDialog) {}

  ngOnInit(): void {
    this.state.unreadCount$.pipe(takeUntil(this.destroy$)).subscribe(count => { this.unreadCount = count; this.cdr.markForCheck(); });
    this.inboxRequest = this.loadRequest$.pipe(
      switchMap(request => this.api.getUserNotifications(
        request.page, this.pageSize, request.isRead, request.category
      ).pipe(
        map(response => ({ request, response, failed: false as const })),
        catchError(() => of({ request, response: null, failed: true as const }))
      )),
      takeUntil(this.destroy$)
    ).subscribe(result => {
      if (result.failed) {
        this.loading = false; this.loadingMore = false; this.error = true;
      } else {
        this.notifications = result.request.reset
          ? result.response.content
          : [...this.notifications, ...result.response.content];
        this.totalPages = result.response.totalPages;
        this.totalElements = result.response.totalElements;
        this.loading = false; this.loadingMore = false; this.error = false;
      }
      this.cdr.markForCheck();
    });
    this.state.refreshUnread(); this.load(true);
  }
  ngOnDestroy(): void { this.inboxRequest?.unsubscribe(); this.destroy$.next(); this.destroy$.complete(); }

  load(reset = false): void {
    if (reset) { this.page = 0; this.notifications = []; this.loading = true; } else this.loadingMore = true;
    this.error = false;
    this.loadRequest$.next({
      page: this.page,
      reset,
      isRead: this.filter === 'UNREAD' ? false : undefined,
      category: this.category === 'ALL' ? undefined : this.category
    });
  }
  loadMore(): void { if (!this.loadingMore && this.page + 1 < this.totalPages) { this.page++; this.load(); } }
  setFilter(value: InboxFilter): void { if (this.filter !== value) { this.filter = value; this.load(true); } }
  setCategory(value: string): void { if (this.category !== value) { this.category = value; this.load(true); } }
  get visibleNotifications(): UserNotification[] {
    return this.notifications;
  }
  async open(item: UserNotification): Promise<void> {
    const wasUnread = !item.isRead;
    if (wasUnread) {
      item.isRead = true; this.state.notificationRead(true); this.cdr.markForCheck();
      try {
        await firstValueFrom(this.api.markNotificationAsRead(this.inboxId(item)));
      } catch {
        item.isRead = false; this.state.refreshUnread();
        this.toast.error('Could not mark notification as read'); this.cdr.markForCheck();
        return;
      }
    }
    await this.navigation.navigate(item);
  }
  markAllRead(): void {
    if (!this.unreadCount) return;
    const previous = this.notifications;
    const unread = previous.filter(n => !n.isRead); unread.forEach(n => n.isRead = true);
    if (this.filter === 'UNREAD') { this.notifications = []; this.totalElements = 0; this.totalPages = 0; }
    this.state.allRead(); this.cdr.markForCheck();
    this.api.markAllNotificationsAsRead().pipe(takeUntil(this.destroy$)).subscribe({
      next: () => this.toast.success('Notifications marked as read'),
      error: () => { unread.forEach(n => n.isRead = false); this.notifications = previous; this.state.refreshUnread(); this.toast.error('Could not mark all notifications as read'); this.cdr.markForCheck(); }
    });
  }
  icon(item: UserNotification): string { return ({ FEES_PAYMENTS: 'payments', LEAVE: 'event_available', ATTENDANCE: 'fact_check', ACADEMICS_RESULTS: 'school', NOTICE_ANNOUNCEMENT: 'campaign', EVENT_CALENDAR: 'event', ACCOUNT_SECURITY: 'security', SYSTEM_ADMIN: 'settings' } as Record<string,string>)[item.category ?? ''] ?? 'notifications'; }
  categoryLabel(item: UserNotification): string {
    return ({ FEES_PAYMENTS: 'Fees & payments', LEAVE: 'Leave', ATTENDANCE: 'Attendance', ACADEMICS_RESULTS: 'Results', NOTICE_ANNOUNCEMENT: 'Notice', EVENT_CALENDAR: 'Event', ACCOUNT_SECURITY: 'Security', SYSTEM_ADMIN: 'System' } as Record<string, string>)[item.category ?? ''] ?? 'General';
  }
  trackByInboxId = (_: number, item: UserNotification): number => this.inboxId(item);
  inboxId(item: UserNotification): number { return item.inboxId ?? item.id; }
  onTruncated(id: number, isTruncated: boolean): void {
    const changed = isTruncated ? !this.truncatedIds.has(id) : this.truncatedIds.has(id);
    if (isTruncated) this.truncatedIds.add(id); else this.truncatedIds.delete(id);
    if (changed) this.cdr.markForCheck();
  }
  openDetail(item: UserNotification): void {
    this.dialog.open(NoticeDetailDialogComponent, {
      panelClass: 'edu-dialog',
      maxWidth: '92vw',
      width: '480px',
      autoFocus: false,
      data: { title: item.title, message: item.message, meta: this.categoryLabel(item) }
    });
  }
  relative(value: string): string {
    const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
    if (seconds < 60) return 'Just now'; if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`; if (seconds < 172800) return 'Yesterday';
    if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`; return new Date(value).toLocaleDateString();
  }
}
