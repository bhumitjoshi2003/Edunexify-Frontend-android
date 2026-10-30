import { ChangeDetectionStrategy, Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { LoggerService } from '../../services/logger.service';
import { AdoptionMetadataService } from '../../services/adoption-metadata.service';
import { RouterLink, RouterLinkActive, RouterOutlet, Router } from '@angular/router';
import { MatMenuModule } from '@angular/material/menu';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatBadgeModule } from '@angular/material/badge';
import { AuthService } from '../../auth/auth.service';
import { AuthStateService } from '../../auth/auth-state.service';
import { CommonModule } from '@angular/common';
import { StudentService } from '../../services/student.service';
import { TeacherService } from '../../services/teacher.service';
import { AdminService } from '../../services/admin.service';
import { NotificationService } from '../../services/notification.service';
import { PushNotificationService } from '../../services/push-notification.service';
import { SchoolService } from '../../services/school.service';
import { TenantService } from '../../services/tenant.service';
import { Subject, takeUntil, interval, Subscription, firstValueFrom } from 'rxjs';
import { NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { Capacitor } from '@capacitor/core';
import { AppUpdate, AppUpdateAvailability } from '@capawesome/capacitor-app-update';
import { AiCopilotComponent } from '../ai-copilot/ai-copilot.component';
import { NavGroupComponent, NavItemDirective } from '../nav-group/nav-group.component';
import { ParentPortalService } from '../../services/parent-portal.service';
import { ParentChildContextService } from '../../services/parent-child-context.service';
import { ChildAccess } from '../../interfaces/parent-portal';
import { UserNotification } from '../../interfaces/user-notification';
import { NotificationStateService } from '../../services/notification-state.service';
import { NotificationNavigationService } from '../../services/notification-navigation.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    MatMenuModule,
    MatIconModule,
    MatDividerModule,
    CommonModule,
    MatBadgeModule,
    AiCopilotComponent,
    NavGroupComponent,
    NavItemDirective,
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardComponent implements OnInit, OnDestroy {

  Role: string = '';
  Id: string = '';
  Name: string = '';
  Class: string = '';
  ClassTeacher: string = '';
  unreadNotificationCount: number = 0;
  recentNotifications: UserNotification[] = [];
  recentNotificationsLoading = false;
  showMoreMenu: boolean = false;
  showUpdateBanner = false;
  latestAppVersion = '';
  sidebarCollapsed = false;
  mobileSidebarOpen = false;
  selectedChild: ChildAccess | null = null;
  private ngUnsubscribe = new Subject<void>();
  private pollingIntervalSubscription: Subscription | undefined;

  constructor(
    private router: Router,
    private authService: AuthService,
    private authStateService: AuthStateService,
    private studentService: StudentService,
    private teacherService: TeacherService,
    private adminService: AdminService,
    private notificationService: NotificationService,
    private pushNotificationService: PushNotificationService,
    private schoolService: SchoolService,
    public tenantService: TenantService,
    private parentPortalService: ParentPortalService,
    private childContext: ParentChildContextService,
    private notificationState: NotificationStateService,
    private notificationNavigation: NotificationNavigationService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef,
    private logger: LoggerService,
    private adoptionMetadata: AdoptionMetadataService
  ) { }

  ngOnInit() {
    this.adoptionMetadata.reportAndroidVersionOnce();
    void this.pushNotificationService.init();
    this.getDetails();
    this.handleInitialNavigation();
    this.notificationState.unreadCount$.pipe(takeUntil(this.ngUnsubscribe)).subscribe(count => {
      this.unreadNotificationCount = count; this.cdr.markForCheck();
    });
    this.fetchUnreadCount();
    this.initParentChildContext();
    // Re-fetch on every navigation (catches mark-all-read from notice board)
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      takeUntil(this.ngUnsubscribe)
    ).subscribe(() => this.fetchUnreadCount());
    // Also poll every 60 seconds as a background fallback
    this.pollingIntervalSubscription = interval(60000)
      .pipe(takeUntil(this.ngUnsubscribe))
      .subscribe(() => this.fetchUnreadCount());
    this.checkForAppUpdate();
    this.onVisibilityChange = this.onVisibilityChange.bind(this);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.onOnline = this.onOnline.bind(this);
    window.addEventListener('online', this.onOnline);
  }

  ngOnDestroy(): void {
    this.ngUnsubscribe.next();
    this.ngUnsubscribe.complete();
    if (this.pollingIntervalSubscription) {
      this.pollingIntervalSubscription.unsubscribe();
    }
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.removeEventListener('online', this.onOnline);
  }

  /** Re-verifies the session when the app/tab becomes visible again — the main defense against
   *  a teacher leaving Edunexify backgrounded for hours: the access token has very likely
   *  expired by then, so this silently exercises the refresh flow. loadCurrentUser() never
   *  treats a transient/network failure as a logout (see AuthStateService), so if Wi-Fi hasn't
   *  reconnected yet this is a harmless no-op that leaves the current session exactly as it
   *  was — no forced logout, no navigation away from whatever page is open. */
  private onVisibilityChange(): void {
    if (document.visibilityState === 'visible') {
      this.fetchUnreadCount();
      this.authStateService.loadCurrentUser()
        .then(() => this.cdr.markForCheck())
        .catch(() => {});
    }
  }

  /** A single, event-driven retry when the browser/WebView reports connectivity is back — never
   *  polling, since it only ever fires in response to the platform's own `online` event.
   *  Covers two cases the visibility handler alone wouldn't: (1) the app was already visible
   *  throughout a brief outage, so onVisibilityChange never re-fired; (2) an already-
   *  AUTHENTICATED session whose access token quietly expired while offline — without this,
   *  that session would only get refreshed on whatever the user's next action happens to be
   *  (the interceptor handles that transparently regardless, so this is a latency/robustness
   *  improvement, not a correctness requirement). Only skipped when the session is a CONFIRMED
   *  rejection (isUnauthenticated()) — retrying there would silently attempt to resurrect a
   *  session the server already definitively rejected, without new credentials. */
  private onOnline(): void {
    if (!this.authStateService.isUnauthenticated()) {
      this.authStateService.loadCurrentUser()
        .then(() => this.cdr.markForCheck())
        .catch(() => {});
    }
  }

  /** Keeps the PARENT sidebar's permission-gated items in sync with whichever child is
   *  currently selected — reactively, so switching children (from any page) updates the
   *  sidebar without a reload. Eagerly reconciles on shell load so a deep link straight into
   *  a feature page still has a correctly gated sidebar, not just after visiting My Children. */
  private initParentChildContext(): void {
    if (this.Role !== 'PARENT') return;
    this.childContext.selectedChild$.pipe(takeUntil(this.ngUnsubscribe)).subscribe(child => {
      this.selectedChild = child;
      this.cdr.markForCheck();
    });
    this.parentPortalService.getMyProfile().pipe(takeUntil(this.ngUnsubscribe)).subscribe({
      next: profile => this.childContext.reconcile(profile),
      error: () => { /* sidebar simply shows no child-specific items until a page reconciles it */ },
    });
  }

  /** Gates a PARENT sidebar item on the currently selected child's permission flag. */
  childCan(permission: keyof ChildAccess): boolean {
    return !!this.selectedChild && !!this.selectedChild[permission];
  }

  getDetails() {
    const user = this.authStateService.getUser();
    if (user) {
      this.Role = user.role;
      this.Id = user.userId;
      this.fetchUserDetails();
    }
  }

  fetchUserDetails() {
    if (this.Role === 'STUDENT' && this.Id) {
      this.studentService.getStudent(this.Id).pipe(takeUntil(this.ngUnsubscribe)).subscribe({
        next: (student) => {
          this.Name = student.name;
          this.Class = student.className;
          this.cdr.markForCheck();
        },
        error: (error) => {
          this.logger.error('Error fetching student details:', error);
        }
      });
    } else if (this.Role === 'TEACHER' && this.Id) {
      this.teacherService.getTeacher(this.Id).pipe(takeUntil(this.ngUnsubscribe)).subscribe({
        next: (teacher) => {
          this.Name = teacher.name;
          this.ClassTeacher = teacher.classTeacher ?? '';
          this.cdr.markForCheck();
        },
        error: (error) => {
          this.logger.error('Error fetching teacher details:', error);
        }
      });
    } else if (this.Role === 'ADMIN' && this.Id) {
      this.adminService.getAdminById(this.Id).pipe(takeUntil(this.ngUnsubscribe)).subscribe({
        next: (admin) => {
          this.Name = admin.name;
          this.cdr.markForCheck();
        },
        error: (error) => {
          this.logger.error('Error fetching admin details:', error);
        }
      });
    } else if (this.Role === 'SUPER_ADMIN') {
      this.Name = 'Super Admin';
      this.cdr.markForCheck();
    }
  }

  handleInitialNavigation(): void {
    // Expired ADMIN must renew — override whatever page they were on.
    if (this.Role === 'ADMIN' && this.subscriptionStatus === 'EXPIRED') {
      this.router.navigate(['/dashboard/school-settings'], { queryParams: { tab: 'subscription' } });
      return;
    }

    // Only redirect to the role-specific home page when the user lands on the bare
    // /dashboard route (no child path). On a page refresh, the router already has
    // the full URL in router.url, so we must leave it alone to stay on the same page.
    const url = this.router.url.split('?')[0]; // strip query params for comparison
    const isBareDashboard = url === '/dashboard' || url === '/dashboard/';
    if (!isBareDashboard) return;

    if (this.Role === 'STUDENT') {
      this.router.navigate(['/dashboard/student-dashboard']);
    } else if (this.Role === 'TEACHER') {
      this.router.navigate(['/dashboard/teacher-dashboard']);
    } else if (this.Role === 'ADMIN' || this.Role === 'SUB_ADMIN') {
      this.router.navigate(['/dashboard/admin-dashboard']);
    } else if (this.Role === 'PARENT') {
      this.router.navigate(['/dashboard/parent-dashboard']);
    } else if (this.Role === 'SUPER_ADMIN') {
      this.router.navigate(['/dashboard/super-admin-dashboard']);
    }
  }

  isStudent(): boolean {
    return this.Role === 'STUDENT';
  }

  isTeacher(): boolean {
    return this.Role === 'TEACHER';
  }

  isAdmin(): boolean {
    return this.Role === 'ADMIN' || this.Role === 'SUB_ADMIN';
  }

  isSuperAdmin(): boolean {
    return this.Role === 'SUPER_ADMIN';
  }

  isParent(): boolean {
    return this.Role === 'PARENT';
  }

  get subscriptionStatus(): string | null {
    return this.authStateService.getSubscriptionStatus();
  }

  /**
   * Returns true if the school's active plan includes the given feature key.
   * Paid features are denied unless the backend-provided entitlement explicitly
   * grants them. This matches AuthStateService and featureGuard.
   */
  hasFeature(key: string): boolean {
    return this.authStateService.hasFeature(key);
  }

  showSubscriptionWarning(): boolean {
    return this.authStateService.isSubscriptionWarning() && this.isAdmin();
  }

  private async checkForAppUpdate(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    try {
      const info = await AppUpdate.getAppUpdateInfo();
      if (info.updateAvailability === AppUpdateAvailability.UPDATE_AVAILABLE) {
        this.latestAppVersion = info.availableVersionName ?? '';
        this.showUpdateBanner = true;
        this.cdr.markForCheck();
      }
    } catch { /* plugin not available or check failed */ }
  }

  openPlayStore(): void {
    AppUpdate.openAppStore().catch(() => {
      window.open('https://play.google.com/store/apps/details?id=in.edunexify.app', '_system');
    });
  }

  dismissUpdateBanner(): void {
    this.showUpdateBanner = false;
    this.cdr.markForCheck();
  }

  async logout(): Promise<void> {
    await this.pushNotificationService.clearToken().catch(() => {}); // Don't block logout on push failure
    this.schoolService.invalidateClasses();
    // The app never fully reloads between sessions on the same device, so this singleton
    // would otherwise keep the previous user's unread count in memory across a logout.
    this.notificationState.clear();
    this.authService.logout().subscribe({
      next: () => this.router.navigate(['/home']),
      error: () => this.router.navigate(['/home'])
    });
  }

  fetchUnreadCount(): void {
    if (this.Role === 'SUPER_ADMIN') return;
    this.notificationState.refreshUnread();
  }

  loadRecentNotifications(): void {
    this.recentNotificationsLoading = true;
    this.notificationService.getUserNotifications(0, 5).pipe(takeUntil(this.ngUnsubscribe)).subscribe({
      next: page => { this.recentNotifications = page.content; this.recentNotificationsLoading = false; this.cdr.markForCheck(); },
      error: () => { this.recentNotificationsLoading = false; this.cdr.markForCheck(); }
    });
  }

  async openRecentNotification(item: UserNotification): Promise<void> {
    if (!item.isRead) {
      item.isRead = true; this.notificationState.notificationRead(true);
      try {
        await firstValueFrom(this.notificationService.markNotificationAsRead(item.inboxId ?? item.id));
      } catch {
        item.isRead = false; this.notificationState.refreshUnread();
        this.toast.error('Could not mark notification as read'); this.cdr.markForCheck();
        return;
      }
    }
    await this.notificationNavigation.navigate(item);
  }

  markAllRecentRead(event: Event): void {
    event.stopPropagation();
    if (!this.unreadNotificationCount) return;
    this.recentNotifications.forEach(item => item.isRead = true); this.notificationState.allRead();
    this.notificationService.markAllNotificationsAsRead().pipe(takeUntil(this.ngUnsubscribe)).subscribe({ error: () => this.notificationState.refreshUnread() });
  }

  notificationIcon(item: UserNotification): string {
    return ({ FEES_PAYMENTS: 'payments', LEAVE: 'event_available', ATTENDANCE: 'fact_check', ACADEMICS_RESULTS: 'school', NOTICE_ANNOUNCEMENT: 'campaign', EVENT_CALENDAR: 'event', ACCOUNT_SECURITY: 'security', SYSTEM_ADMIN: 'settings' } as Record<string,string>)[item.category ?? ''] ?? 'notifications';
  }

  notificationCategory(item: UserNotification): string {
    return ({ FEES_PAYMENTS: 'Fees & payments', LEAVE: 'Leave', ATTENDANCE: 'Attendance', ACADEMICS_RESULTS: 'Results', NOTICE_ANNOUNCEMENT: 'Notice', EVENT_CALENDAR: 'Event', ACCOUNT_SECURITY: 'Security', SYSTEM_ADMIN: 'System' } as Record<string, string>)[item.category ?? ''] ?? 'General';
  }

  notificationTime(value: string): string {
    const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
    if (minutes < 1) return 'Just now'; if (minutes < 60) return `${minutes} min ago`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)} hr ago`;
    return minutes < 2880 ? 'Yesterday' : `${Math.floor(minutes / 1440)} days ago`;
  }

  navigateToStudentSearch(): void {
    this.router.navigate(['/dashboard/student-search']);
  }

  getRoleLabel(): string {
    const labels: Record<string, string> = {
      'STUDENT': 'Student',
      'TEACHER': 'Teacher',
      'ADMIN': 'Admin',
      'SUB_ADMIN': 'Sub Admin',
      'SUPER_ADMIN': 'Super Admin',
      'PARENT': 'Parent',
    };
    return labels[this.Role] ?? this.Role;
  }

  getProfileInitials(): string {
    const source = (this.Name || this.Role || 'U').trim();
    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return source.charAt(0).toUpperCase();
  }

  getRoleChipClass(): string {
    const classes: Record<string, string> = {
      'STUDENT': 'chip-student',
      'TEACHER': 'chip-teacher',
      'ADMIN': 'chip-admin',
      'SUB_ADMIN': 'chip-subadmin',
      'SUPER_ADMIN': 'chip-superadmin',
      'PARENT': 'chip-parent',
    };
    return classes[this.Role] ?? 'chip-student';
  }

  private get isMobile(): boolean {
    return typeof window !== 'undefined' && window.innerWidth <= 900;
  }

  toggleSidebar(): void {
    if (this.isMobile) {
      this.mobileSidebarOpen = !this.mobileSidebarOpen;
    } else {
      this.sidebarCollapsed = !this.sidebarCollapsed;
    }
    this.cdr.markForCheck();
  }

  closeMobileSidebar(): void {
    this.mobileSidebarOpen = false;
    this.cdr.markForCheck();
  }

  closeSidebarOnMobile(): void {
    if (this.isMobile) {
      this.mobileSidebarOpen = false;
      this.cdr.markForCheck();
    }
  }

  get menuIcon(): string {
    return this.mobileSidebarOpen ? 'close' : 'menu';
  }

  toggleMoreMenu(): void {
    this.showMoreMenu = !this.showMoreMenu;
  }

  closeMoreMenu(): void {
    this.showMoreMenu = false;
  }

  navigateToMyProfile(): void {
    if (this.isStudent() && this.Id) {
      this.router.navigate(['/dashboard/student-details', this.Id]);
    }
    if (this.isTeacher() && this.Id) {
      this.router.navigate(['/dashboard/teacher-details', this.Id]);
    }
    if (this.isAdmin() && this.Id) {
      this.router.navigate(['/dashboard/admin-details', this.Id]);
    }
  }
}
