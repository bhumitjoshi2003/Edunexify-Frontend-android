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
describe('DashboardComponent — Principal academic navigation', () => {
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
    authState.hasFeature.and.callFake((key: string) => key !== 'AI_COPILOT');
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

  const academic = ['class-management', 'subject-config', 'exam-config', 'assessment-groups', 'student-stream',
    'elective-assignment', 'timetable', 'manage-assessments'];

  it('shows every academic configuration entry, including Assessments, to the Principal', () => {
    build('PRINCIPAL');
    for (const path of academic) {
      expect(fixture.nativeElement.querySelector(`a[routerLink="/dashboard/${path}"]`)).withContext(path).toBeTruthy();
    }
  });

  it('keeps rollover, settings and billing entries away from the Principal', () => {
    build('PRINCIPAL');
    for (const path of ['school-settings', 'student-promotion', 'fee-structure', 'bus-fees', 'admin-list', 'audit-logs']) {
      expect(fixture.nativeElement.querySelector(`a[routerLink="/dashboard/${path}"]`)).withContext(path).toBeNull();
    }
  });

  it('keeps Admin navigation unchanged', () => {
    build('ADMIN');
    for (const path of [...academic.filter(p => p !== 'assessment-groups'), 'school-settings', 'student-promotion']) { // Admin reaches assessment groups from its exam tools
      expect(fixture.nativeElement.querySelector(`a[routerLink="/dashboard/${path}"]`)).withContext(path).toBeTruthy();
    }
  });
});
