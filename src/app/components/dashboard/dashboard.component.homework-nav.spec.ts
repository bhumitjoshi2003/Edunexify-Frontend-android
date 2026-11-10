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

describe('Homework & Classwork — role access', () => {
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

  it('TEACHER sees the Homework & Classwork posting page link, not the student page', () => {
    build('TEACHER');
    expect(link('/dashboard/homework-classwork')).toBeTruthy();
    expect(link('/dashboard/homework')).toBeNull();
  });

  it('STUDENT sees the Homework & Classwork reading page link, not the teacher page', () => {
    build('STUDENT');
    expect(link('/dashboard/homework')).toBeTruthy();
    expect(link('/dashboard/homework-classwork')).toBeNull();
  });

  for (const role of ['ADMIN', 'SUB_ADMIN', 'PARENT', 'SUPER_ADMIN']) {
    it(`${role} sees neither homework link`, () => {
      build(role);
      expect(link('/dashboard/homework-classwork')).withContext(role).toBeNull();
      expect(link('/dashboard/homework')).withContext(role).toBeNull();
    });
  }

  it('routes are guarded: posting is TEACHER-only and reading is STUDENT-only', () => {
    const dashboard = routes.find(r => r.path === 'dashboard')!;
    const teacher = dashboard.children!.find(r => r.path === 'homework-classwork')!;
    const student = dashboard.children!.find(r => r.path === 'homework')!;
    expect(teacher.canActivate).toContain(roleGuard);
    expect(teacher.data!['roles']).toEqual(['TEACHER']);
    expect(student.canActivate).toContain(roleGuard);
    expect(student.data!['roles']).toEqual(['STUDENT']);
  });
});
