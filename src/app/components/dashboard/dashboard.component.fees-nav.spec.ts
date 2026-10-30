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
 * Entitlement-aware navigation: a group whose items were all filtered out (role, feature or
 * parent-child permission) must not leave its heading behind. The FEES group is the case that
 * exposed it, but the rule is generic and checked for every heading of every role.
 */
describe('DashboardComponent — empty navigation groups', () => {
  let fixture: ComponentFixture<DashboardComponent>;
  let authState: jasmine.SpyObj<AuthStateService>;

  const FEE_FEATURES = ['FEE_MANAGEMENT', 'ONLINE_PAYMENTS', 'FEE_REMINDERS'];
  const child = { studentId: 'S1', className: '5', canViewFees: true, canViewAttendance: true, canViewTimetable: true,
    canViewResults: true, canManageLeave: true } as any;

  function build(role: string, enabled: string[], selectedChild: any = null): void {
    authState = jasmine.createSpyObj('AuthStateService', [
      'getUser', 'isLoggedIn', 'isUnauthenticated', 'loadCurrentUser', 'mustChangePassword',
      'getSubscriptionStatus', 'hasFeature', 'isSubscriptionWarning',
    ]);
    authState.getUser.and.returnValue({ role, userId: '' } as any);
    authState.isLoggedIn.and.returnValue(true);
    authState.isUnauthenticated.and.returnValue(false);
    authState.loadCurrentUser.and.returnValue(Promise.resolve());
    authState.getSubscriptionStatus.and.returnValue(null);
    authState.hasFeature.and.callFake((k: string) => enabled.includes(k));
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
        { provide: ParentChildContextService, useValue: { selectedChild$: of(selectedChild), reconcile: () => {} } },
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

  const nav = () => fixture.nativeElement.querySelector('nav.sidebar-nav') as HTMLElement;
  const headings = () => Array.from(nav().querySelectorAll('.nav-section-label')).map(e => e.textContent!.trim());
  const hasLink = (path: string) => !!nav().querySelector(`a[routerLink="${path}"], a[ng-reflect-router-link="${path}"]`);

  /** Every rendered heading is followed by a nav item before the next heading. */
  function expectNoEmptyGroup(): void {
    const children = Array.from(nav().querySelectorAll('.nav-section-label, .nav-item'));
    children.forEach((el, i) => {
      if (el.classList.contains('nav-section-label')) {
        const next = children[i + 1];
        expect(next?.classList.contains('nav-item')).withContext(`"${el.textContent!.trim()}" heading has no items`).toBeTrue();
      }
    });
  }

  for (const [role, child_] of [['ADMIN', null], ['STUDENT', null], ['PARENT', child], ['TEACHER', null], ['SUB_ADMIN', null]] as const) {
    it(`${role}: no FEES heading and no empty group when every fee feature is off`, () => {
      build(role, [], child_);
      expect(headings()).not.toContain('Fees');
      expectNoEmptyGroup();
    });
  }

  it('ADMIN: no empty group even with all features off, spacing included', () => {
    build('ADMIN', []);
    expectNoEmptyGroup();
    expect(nav().querySelectorAll('app-nav-group').length).toBeGreaterThan(0);
  });

  // The Android admin Fees group is driven by FEE_MANAGEMENT; FEE_REMINDERS sits in another group.
  for (const feature of ['FEE_MANAGEMENT']) {
    it(`ADMIN: the Fees heading appears with only ${feature} on`, () => {
      build('ADMIN', [feature]);
      expect(headings()).toContain('Fees');
      expectNoEmptyGroup();
    });
  }

  it('STUDENT: Fees heading returns with a fee feature on', () => {
    build('STUDENT', ['FEE_MANAGEMENT']);
    expect(headings()).toContain('Fees');
    expectNoEmptyGroup();
  });

  it('PARENT: fee links follow the plan, not only the child permission', () => {
    build('PARENT', [], child);
    expect(headings()).not.toContain('Fees');
    expect(nav().textContent).not.toContain('Payment History');
    expectNoEmptyGroup();
  });

  it('PARENT: fee links appear when the plan and the child permission allow them', () => {
    build('PARENT', ['FEE_MANAGEMENT', 'ONLINE_PAYMENTS'], child);
    expect(headings()).toContain('Fees');
    expect(nav().textContent).toContain('My Fees');
    expect(nav().textContent).toContain('Payment History');
    expectNoEmptyGroup();
  });

  it('PARENT: a child without fee permission hides the group even when the plan has fees', () => {
    build('PARENT', FEE_FEATURES, { ...child, canViewFees: false });
    expect(headings()).not.toContain('Fees');
    expectNoEmptyGroup();
  });

  it('keeps role filtering: a student never sees admin fee entries', () => {
    build('STUDENT', FEE_FEATURES);
    expect(nav().textContent).not.toContain('Fee Reminders');
    expect(hasLink('/dashboard/fee-assignment')).toBeFalse();
  });
});
