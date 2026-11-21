import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { RouterTestingModule } from '@angular/router/testing';
import { DashboardComponent } from './dashboard.component';
import { AuthService } from '../../auth/auth.service';
import { AuthStateService } from '../../auth/auth-state.service';
import { StudentService } from '../../services/student.service';
import { TeacherService } from '../../services/teacher.service';
import { AdminService } from '../../services/admin.service';
import { NotificationStateService } from '../../services/notification-state.service';
import { SchoolService } from '../../services/school.service';
import { TenantService } from '../../services/tenant.service';
import { ParentPortalService } from '../../services/parent-portal.service';
import { ParentChildContextService } from '../../services/parent-child-context.service';
import { LoggerService } from '../../services/logger.service';
import { AppResumeService } from '../../core/app-resume.service';
import { NotificationService } from '../../services/notification.service';
import { PushNotificationService } from '../../services/push-notification.service';
import { NotificationNavigationService } from '../../services/notification-navigation.service';
import { ToastService } from '../../services/toast.service';
import { AdoptionMetadataService } from '../../services/adoption-metadata.service';

/**
 * Tab resume / reconnect: the session itself is re-checked by AppResumeService for every route
 * (see core/app-resume.service.spec.ts). The dashboard shell only reacts to its confirmed
 * resume by reloading its own data, and no longer keeps listeners of its own. Android: the
 * native app-state events feed the same AppResumeService (see app.component.ts).
 */
describe('DashboardComponent — after the app resumes', () => {
  let fixture: ComponentFixture<DashboardComponent>;
  let authState: jasmine.SpyObj<AuthStateService>;
  let resumed: Subject<void>;
  let notifications: { unreadState$: unknown; unreadCount$: unknown; refreshUnread: jasmine.Spy };

  beforeEach(async () => {
    authState = jasmine.createSpyObj('AuthStateService', ['isCoordinator', 
      'getUser', 'isLoggedIn', 'isUnauthenticated', 'loadCurrentUser', 'mustChangePassword',
      'getSubscriptionStatus', 'hasFeature', 'isSubscriptionWarning',
    ]);
    authState.getUser.and.returnValue({ userId: 'T1', role: 'TEACHER' } as any);
    authState.isLoggedIn.and.returnValue(true);
    authState.isUnauthenticated.and.returnValue(false);
    authState.loadCurrentUser.and.returnValue(Promise.resolve());
    authState.getSubscriptionStatus.and.returnValue(null);
    authState.hasFeature.and.returnValue(false);
    authState.isSubscriptionWarning.and.returnValue(false);
    resumed = new Subject<void>();
    notifications = { unreadState$: of({ status: 'success', count: 0 }), unreadCount$: of(0), refreshUnread: jasmine.createSpy('refreshUnread') };

    await TestBed.configureTestingModule({
      imports: [DashboardComponent, RouterTestingModule],
      providers: [
        { provide: AuthStateService, useValue: authState },
        { provide: AppResumeService, useValue: { resumed$: resumed.asObservable() } },
        { provide: AuthService, useValue: {} },
        { provide: StudentService, useValue: {} },
        { provide: TeacherService, useValue: { getTeacher: () => of({ name: 'Ms Rao', classTeacher: null }) } },
        { provide: AdminService, useValue: {} },
        { provide: NotificationStateService, useValue: notifications },
        { provide: SchoolService, useValue: {} },
        { provide: TenantService, useValue: { school: null } },
        { provide: ParentPortalService, useValue: {} },
        { provide: ParentChildContextService, useValue: {} },
        { provide: LoggerService, useValue: { error: () => {} } },
        { provide: NotificationService, useValue: { getUnreadNotificationCount: () => of(0) } },
        { provide: PushNotificationService, useValue: { init: () => Promise.resolve() } },
        { provide: NotificationNavigationService, useValue: {} },
        { provide: ToastService, useValue: {} },
        { provide: AdoptionMetadataService, useValue: { reportAndroidVersionOnce: () => {} } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
  });

  afterEach(() => fixture.destroy());

  it('reloads the shell\'s own data (user details, unread badge) after a confirmed resume', () => {
    notifications.refreshUnread.calls.reset();
    const details = spyOn(fixture.componentInstance, 'getDetails').and.callThrough();

    resumed.next();

    expect(details).toHaveBeenCalledTimes(1);
    expect(notifications.refreshUnread).toHaveBeenCalledTimes(1);
  });

  it('keeps no tab/online listeners of its own — AppResumeService owns the session re-check', () => {
    authState.loadCurrentUser.calls.reset();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('online'));

    expect(authState.loadCurrentUser).not.toHaveBeenCalled();
  });

  it('stops reacting once destroyed', () => {
    fixture.destroy();
    notifications.refreshUnread.calls.reset();

    resumed.next();

    expect(notifications.refreshUnread).not.toHaveBeenCalled();
  });
});
