import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { RouterTestingModule } from '@angular/router/testing';
import { DashboardComponent } from './dashboard.component';
import { AuthService } from '../../auth/auth.service';
import { AuthStateService } from '../../auth/auth-state.service';
import { StudentService } from '../../services/student.service';
import { TeacherService } from '../../services/teacher.service';
import { AdminService } from '../../services/admin.service';
import { NotificationService } from '../../services/notification.service';
import { PushNotificationService } from '../../services/push-notification.service';
import { SchoolService } from '../../services/school.service';
import { TenantService } from '../../services/tenant.service';
import { ParentPortalService } from '../../services/parent-portal.service';
import { ParentChildContextService } from '../../services/parent-child-context.service';
import { NotificationStateService } from '../../services/notification-state.service';
import { NotificationNavigationService } from '../../services/notification-navigation.service';
import { ToastService } from '../../services/toast.service';
import { LoggerService } from '../../services/logger.service';
import { AdoptionMetadataService } from '../../services/adoption-metadata.service';

/**
 * Report a Problem / My Support Requests are for every normal role (Student/Teacher/Parent/
 * Admin/Sub-admin) — never routed to the reporter's own school admin. SUPER_ADMIN is the
 * recipient of those tickets, so it sees only the global "Support Tickets" queue, and never the
 * personal reporting links. School ADMIN/SUB_ADMIN never see the global queue.
 */
describe('DashboardComponent — Help & Support nav entries', () => {
  let fixture: ComponentFixture<DashboardComponent>;
  let authState: jasmine.SpyObj<AuthStateService>;

  function build(role: string): void {
    authState = jasmine.createSpyObj('AuthStateService', [
      'getUser', 'isLoggedIn', 'isUnauthenticated', 'loadCurrentUser', 'mustChangePassword',
      'getSubscriptionStatus', 'hasFeature', 'isSubscriptionWarning',
    ]);
    authState.getUser.and.returnValue({ role, userId: '' } as any);
    authState.isLoggedIn.and.returnValue(true);
    authState.isUnauthenticated.and.returnValue(false);
    authState.loadCurrentUser.and.returnValue(Promise.resolve());
    authState.getSubscriptionStatus.and.returnValue(null);
    authState.hasFeature.and.returnValue(false);
    authState.isSubscriptionWarning.and.returnValue(false);

    TestBed.configureTestingModule({
      imports: [DashboardComponent, RouterTestingModule],
      providers: [
        { provide: AuthStateService, useValue: authState },
        { provide: AuthService, useValue: {} },
        { provide: StudentService, useValue: {} },
        { provide: TeacherService, useValue: {} },
        { provide: AdminService, useValue: {} },
        { provide: NotificationService, useValue: { getUnreadNotificationCount: () => of(0) } },
        { provide: PushNotificationService, useValue: { init: () => Promise.resolve() } },
        { provide: SchoolService, useValue: {} },
        { provide: TenantService, useValue: { school: null } },
        { provide: ParentPortalService, useValue: { getMyProfile: () => of(null) } },
        { provide: ParentChildContextService, useValue: { selectedChild$: of(null), reconcile: () => {} } },
        { provide: NotificationStateService, useValue: { unreadCount$: of(0), refreshUnread: () => {} } },
        { provide: NotificationNavigationService, useValue: {} },
        { provide: ToastService, useValue: {} },
        { provide: LoggerService, useValue: { error: () => {} } },
        { provide: AdoptionMetadataService, useValue: { reportAndroidVersionOnce: () => {} } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
  }

  afterEach(() => fixture.destroy());

  for (const role of ['STUDENT', 'TEACHER', 'PARENT', 'ADMIN', 'SUB_ADMIN', 'PRINCIPAL']) {
    it(`shows "Report a Problem" and "My Support Requests" for ${role}`, () => {
      build(role);
      const report = fixture.nativeElement.querySelector('a[routerLink="/dashboard/report-problem"]');
      const mine = fixture.nativeElement.querySelector('a[routerLink="/dashboard/my-support-requests"]');
      expect(report).withContext(`report-problem link for ${role}`).toBeTruthy();
      expect(mine).withContext(`my-support-requests link for ${role}`).toBeTruthy();
    });
  }

  it('never shows "Report a Problem" or "My Support Requests" for SUPER_ADMIN', () => {
    build('SUPER_ADMIN');
    expect(fixture.nativeElement.querySelector('a[routerLink="/dashboard/report-problem"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('a[routerLink="/dashboard/my-support-requests"]')).toBeNull();
  });

  it('shows the global "Support Tickets" queue link only for SUPER_ADMIN', () => {
    build('SUPER_ADMIN');
    const link = fixture.nativeElement.querySelector('a[routerLink="/dashboard/support-queue"]');
    expect(link).toBeTruthy();
    expect(link!.textContent).toContain('Support Tickets');
  });

  for (const role of ['ADMIN', 'SUB_ADMIN', 'TEACHER', 'STUDENT', 'PARENT', 'PRINCIPAL']) {
    it(`never shows the global Support Tickets queue link for ${role}`, () => {
      build(role);
      const link = fixture.nativeElement.querySelector('a[routerLink="/dashboard/support-queue"]');
      expect(link).withContext(`support-queue link for ${role}`).toBeNull();
    });
  }
});
