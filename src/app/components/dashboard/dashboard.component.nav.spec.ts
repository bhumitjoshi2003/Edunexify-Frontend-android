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

/**
 * Regression guard: the Teacher Substitution nav entry was originally added inside the
 * STUDENT sidebar block by mistake, so ADMIN/SUB_ADMIN never saw it (and STUDENT — who has
 * no route access at all — incorrectly did). This proves it renders only for the roles the
 * route (`/dashboard/teacher-substitutions`, roles: ['ADMIN','SUB_ADMIN']) actually allows.
 */
describe('DashboardComponent — Teacher Substitution nav entry', () => {
  let fixture: ComponentFixture<DashboardComponent>;
  let authState: jasmine.SpyObj<AuthStateService>;

  function build(role: string): void {
    authState = jasmine.createSpyObj('AuthStateService', ['isCoordinator', 
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
        { provide: ParentPortalService, useValue: {} },
        { provide: ParentChildContextService, useValue: {} },
        { provide: NotificationStateService, useValue: { unreadCount$: of(0), refreshUnread: () => {} } },
        { provide: NotificationNavigationService, useValue: {} },
        { provide: ToastService, useValue: {} },
        { provide: LoggerService, useValue: { error: () => {} } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
  }

  afterEach(() => fixture.destroy());

  it('shows a "Teacher Substitution" link to /dashboard/teacher-substitutions for ADMIN', () => {
    build('ADMIN');
    const link: HTMLAnchorElement | null = fixture.nativeElement.querySelector('a[routerLink="/dashboard/teacher-substitutions"]');
    expect(link).toBeTruthy();
    expect(link!.textContent).toContain('Teacher Substitution');
  });

  it('shows the same link for SUB_ADMIN', () => {
    build('SUB_ADMIN');
    const link: HTMLAnchorElement | null = fixture.nativeElement.querySelector('a[routerLink="/dashboard/teacher-substitutions"]');
    expect(link).toBeTruthy();
  });

  it('never shows the link for STUDENT (the route does not permit them)', () => {
    build('STUDENT');
    const link = fixture.nativeElement.querySelector('a[routerLink="/dashboard/teacher-substitutions"]');
    expect(link).toBeNull();
  });

  // Attendance V2: marking is TEACHER/ADMIN only (route + API), so the shared admin menu must
  // not offer SUB_ADMIN a "Mark Attendance" link that only bounces them back to the dashboard.
  it('shows the admin "Mark Attendance" link for ADMIN', () => {
    build('ADMIN');
    expect(fixture.nativeElement.querySelector('a[routerLink="/dashboard/teacher-attendance"]')).toBeTruthy();
  });

  it('never shows "Mark Attendance" for SUB_ADMIN (they cannot mark attendance)', () => {
    build('SUB_ADMIN');
    expect(fixture.nativeElement.querySelector('a[routerLink="/dashboard/teacher-attendance"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('a[routerLink="/dashboard/attendance-summary"]')).toBeTruthy();
  });

  it('never shows the link for TEACHER (the route does not permit them)', () => {
    build('TEACHER');
    const link = fixture.nativeElement.querySelector('a[routerLink="/dashboard/teacher-substitutions"]');
    expect(link).toBeNull();
  });
});
