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
 * D22-24 (tab/app-resume / online-event session restoration) — Android mirror of the web fix.
 * Rendered/integration-style: real DOM events are dispatched on document/window exactly as the
 * WebView would fire them, proving the component's actual listeners do the right thing. The
 * deeper "does a transient failure clear auth" logic is proven in
 * auth-state.service.spec.ts / auth.interceptor.spec.ts; this only proves DashboardComponent
 * wires visibilitychange/online to loadCurrentUser() correctly, without leaking listeners.
 */
describe('DashboardComponent — tab-resume / online session restoration', () => {
  let fixture: ComponentFixture<DashboardComponent>;
  let authState: jasmine.SpyObj<AuthStateService>;

  beforeEach(async () => {
    authState = jasmine.createSpyObj('AuthStateService', ['isCoordinator', 
      'getUser', 'isLoggedIn', 'isUnauthenticated', 'loadCurrentUser', 'mustChangePassword',
      'getSubscriptionStatus', 'hasFeature', 'isSubscriptionWarning',
    ]);
    authState.getUser.and.returnValue(null);
    authState.isLoggedIn.and.returnValue(true);
    authState.isUnauthenticated.and.returnValue(false);
    authState.loadCurrentUser.and.returnValue(Promise.resolve());
    authState.getSubscriptionStatus.and.returnValue(null);
    authState.hasFeature.and.returnValue(false);
    authState.isSubscriptionWarning.and.returnValue(false);

    await TestBed.configureTestingModule({
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
  });

  afterEach(() => fixture.destroy());

  it('22. becoming visible again triggers a session-restoration attempt', () => {
    authState.loadCurrentUser.calls.reset();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(authState.loadCurrentUser).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the tab/app is hidden, not visible', () => {
    authState.loadCurrentUser.calls.reset();
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(authState.loadCurrentUser).not.toHaveBeenCalled();
  });

  it('23/24. an `online` event retries restoration for an unresolved (CHECKING) session', () => {
    authState.isLoggedIn.and.returnValue(false);
    authState.isUnauthenticated.and.returnValue(false); // CHECKING: neither confirmed state
    authState.loadCurrentUser.calls.reset();

    window.dispatchEvent(new Event('online'));

    expect(authState.loadCurrentUser).toHaveBeenCalledTimes(1);
  });

  it('an `online` event ALSO re-verifies an already-AUTHENTICATED session (its access token may have quietly expired offline)', () => {
    authState.isLoggedIn.and.returnValue(true);
    authState.isUnauthenticated.and.returnValue(false);
    authState.loadCurrentUser.calls.reset();

    window.dispatchEvent(new Event('online'));

    expect(authState.loadCurrentUser).toHaveBeenCalledTimes(1);
  });

  it('an `online` event is a no-op when the session is a CONFIRMED rejection (no silent credential-less retry)', () => {
    authState.isLoggedIn.and.returnValue(false);
    authState.isUnauthenticated.and.returnValue(true);
    authState.loadCurrentUser.calls.reset();

    window.dispatchEvent(new Event('online'));

    expect(authState.loadCurrentUser).not.toHaveBeenCalled();
  });

  it('removes both listeners on destroy — no leaks across dashboard visits', () => {
    fixture.destroy();
    authState.loadCurrentUser.calls.reset();

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('online'));

    expect(authState.loadCurrentUser).not.toHaveBeenCalled();
  });
});
