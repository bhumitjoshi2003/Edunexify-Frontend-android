import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { RouterTestingModule } from '@angular/router/testing';
import { DashboardComponent } from './dashboard.component';
import { routes } from '../../app.routes';
import { roleGuard } from '../../auth/role.guard';
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

describe('Assessments — role access', () => {
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

  afterEach(() => fixture?.destroy());

  const link = (href: string) => fixture.nativeElement.querySelector(`a[routerLink="${href}"]`);

  it('TEACHER sees the Assessments management link, not the student page', () => {
    build('TEACHER');
    expect(link('/dashboard/manage-assessments')).toBeTruthy();
    expect(link('/dashboard/assessments')).toBeNull();
  });

  it('ADMIN sees the Assessments management link', () => {
    build('ADMIN');
    expect(link('/dashboard/manage-assessments')).toBeTruthy();
    expect(link('/dashboard/assessments')).toBeNull();
  });

  it('STUDENT sees the Assessment Calendar link, not the management page', () => {
    build('STUDENT');
    expect(link('/dashboard/assessments')).toBeTruthy();
    expect(link('/dashboard/manage-assessments')).toBeNull();
  });

  for (const role of ['SUB_ADMIN', 'PARENT', 'SUPER_ADMIN']) {
    it(`${role} sees neither assessments link (fail closed)`, () => {
      build(role);
      expect(link('/dashboard/manage-assessments')).withContext(role).toBeNull();
      expect(link('/dashboard/assessments')).withContext(role).toBeNull();
    });
  }

  it('routes are guarded: management is TEACHER/ADMIN/PRINCIPAL-only and the calendar STUDENT-only', () => {
    const dashboard = routes.find(r => r.path === 'dashboard')!;
    const manage = dashboard.children!.find(r => r.path === 'manage-assessments')!;
    const student = dashboard.children!.find(r => r.path === 'assessments')!;
    expect(manage.canActivate).toContain(roleGuard);
    expect(manage.data!['roles']).toEqual(['TEACHER', 'ADMIN', 'PRINCIPAL']);
    expect(student.canActivate).toContain(roleGuard);
    expect(student.data!['roles']).toEqual(['STUDENT']);
  });
});
