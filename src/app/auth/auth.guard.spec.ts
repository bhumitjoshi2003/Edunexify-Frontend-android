import { TestBed, fakeAsync, tick, flushMicrotasks } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { authGuard } from './auth.guard';
import { AuthStateService } from './auth-state.service';
import { environment } from '../../environments/environment';

describe('authGuard', () => {
  let authState: jasmine.SpyObj<AuthStateService>;
  let router: Router;

  beforeEach(() => {
    authState = jasmine.createSpyObj('AuthStateService', ['isLoggedIn', 'isChecking', 'mustChangePassword']);
    authState.isChecking.and.returnValue(false);
    TestBed.configureTestingModule({
      imports: [RouterTestingModule],
      providers: [{ provide: AuthStateService, useValue: authState }],
    });
    router = TestBed.inject(Router);
    spyOn(router, 'navigate');
  });

  function run(url = '/dashboard') {
    return TestBed.runInInjectionContext(() =>
      authGuard({} as any, { url } as any)
    );
  }

  it('redirects a confirmed-logged-out user to /home', () => {
    authState.isLoggedIn.and.returnValue(false);

    const result = run();

    expect(result).toBeFalse();
    expect(router.navigate).toHaveBeenCalledWith(['/home']);
  });

  it('redirects a restricted (mustChangePassword) user to /change-initial-password instead of the dashboard', () => {
    authState.isLoggedIn.and.returnValue(true);
    authState.mustChangePassword.and.returnValue(true);

    const result = run();

    expect(result).toBeFalse();
    expect(router.navigate).toHaveBeenCalledWith(['/change-initial-password']);
  });

  it('allows a normal logged-in user through', () => {
    authState.isLoggedIn.and.returnValue(true);
    authState.mustChangePassword.and.returnValue(false);

    const result = run();

    expect(result).toBeTrue();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('saves the intended route before redirecting a confirmed-logged-out visitor', () => {
    localStorage.removeItem('redirectUrl');
    authState.isLoggedIn.and.returnValue(false);

    run('/dashboard/timetable');

    expect(JSON.parse(localStorage.getItem('redirectUrl')!).url).toBe('/dashboard/timetable');
    localStorage.removeItem('redirectUrl');
  });
});

/**
 * 16. CHECKING must not be interpreted as logged out. Using the REAL AuthStateService (not a
 * spy) proves the actual tri-state integration: a transient failure leaves isLoggedIn() true
 * for an already-authenticated session, so the guard keeps allowing access through it exactly
 * as if nothing happened — no special-casing needed in the guard itself.
 */
describe('authGuard — tri-state integration with the real AuthStateService', () => {
  let authState: AuthStateService;
  let http: HttpTestingController;
  let router: Router;

  const userInfo: any = {
    userId: 'T1', role: 'TEACHER', name: null, className: null, schoolSlug: null,
    featureKeys: null, planTier: null, planVersion: null, subscriptionStatus: null,
    trialEndsAt: null, expiresAt: null, graceEndsAt: null, permissionKeys: null,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule, RouterTestingModule] });
    authState = TestBed.inject(AuthStateService);
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    spyOn(router, 'navigate');
    localStorage.removeItem('redirectUrl');
  });

  afterEach(() => {
    http.verify();
    localStorage.removeItem('redirectUrl');
  });

  it('still allows access after a transient (network) failure kept the session AUTHENTICATED', async () => {
    let p = authState.loadCurrentUser();
    http.expectOne(`${environment.apiUrl}/auth/me`).flush(userInfo);
    await p;

    // Tab-resume style re-check hits a transient failure.
    p = authState.loadCurrentUser();
    http.expectOne(`${environment.apiUrl}/auth/me`)
      .error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });
    await p;

    const result = TestBed.runInInjectionContext(() => authGuard({} as any, { url: '/dashboard' } as any));

    expect(result).toBeTrue();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  /**
   * The exact scenario from this review round: fresh bootstrap, user=null, status=CHECKING,
   * the guard's own bounded resolution attempt ALSO hits a network failure (status 0). Required
   * outcomes: not treated as a definitive logout (status must NOT become UNAUTHENTICATED), the
   * intended deep route is preserved, and — since identity was never confirmed — this particular
   * navigation is denied rather than exposing protected content to an unknown caller.
   *
   * Since AuthStateService's white-screen fix (see auth-state.service.ts), a transient failure
   * on the very first check now resolves loadCurrentUser() itself into a definite, user-visible
   * SERVICE_UNAVAILABLE/OFFLINE state immediately — CHECKING is no longer left hanging for the
   * guard's full 6s bound to expire. resolveCheckingState()'s Promise.race settles via that
   * branch as soon as it happens, so the guard's own decision lands well before its 6s ceiling
   * too (that ceiling now only matters if loadCurrentUser() itself were somehow slower than the
   * guard's own bound, which shouldn't happen since it's driven by the same STARTUP_HTTP_TIMEOUT
   * path). Chrome (this test's real browser) reports navigator.onLine === true, so this lands on
   * SERVICE_UNAVAILABLE, not OFFLINE.
   */
  it('fresh boot + persistent network failure: denies THIS navigation without destructively logging out, and preserves the intended route', fakeAsync(() => {
    expect(authState.getStatus()).toBe('CHECKING'); // brand new service, nothing loaded yet

    let result: boolean | undefined;
    const guardResult = TestBed.runInInjectionContext(() =>
      authGuard({} as any, { url: '/dashboard/timetable' } as any)
    ) as Promise<boolean>;
    guardResult.then(r => (result = r));

    // The guard's own resolveCheckingState() call fires loadCurrentUser() — respond with a
    // network-level failure, exactly like a laptop whose Wi-Fi hasn't reconnected yet.
    flushMicrotasks();
    http.expectOne(`${environment.apiUrl}/auth/me`)
      .error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });
    flushMicrotasks();

    // loadCurrentUser() itself already produced a definite verdict — no need to wait out the
    // guard's full 6s bound; nothing destructive has happened.
    expect(authState.getStatus()).toBe('SERVICE_UNAVAILABLE');
    expect(result).toBeFalse();
    expect(router.navigate).toHaveBeenCalledWith(['/home']);
    expect(JSON.parse(localStorage.getItem('redirectUrl')!).url).toBe('/dashboard/timetable');

    // Draining the guard's own timer (now moot, since the race already settled the other way)
    // must not change anything further.
    tick(6000);
    flushMicrotasks();
    expect(authState.getStatus()).toBe('SERVICE_UNAVAILABLE'); // still NOT UNAUTHENTICATED
  }));

  /** Recovery: once connectivity returns and a later check succeeds, the previously-denied
   *  attempt's intended route is still there to be picked up (by HomeComponent's own bounce,
   *  or a retried navigation) with no credentials re-entered. */
  it('recovers after the network returns, with no credentials required, and the saved route is still usable', async () => {
    localStorage.setItem('redirectUrl', JSON.stringify({ url: '/dashboard/timetable', school: null }));

    const p = authState.loadCurrentUser();
    http.expectOne(`${environment.apiUrl}/auth/me`).flush(userInfo);
    await p;

    expect(authState.isAuthenticated()).toBeTrue();

    const result = TestBed.runInInjectionContext(() => authGuard({} as any, { url: '/dashboard/timetable' } as any));
    expect(result).toBeTrue(); // now a plain synchronous allow — no re-check needed
    expect(JSON.parse(localStorage.getItem('redirectUrl')!).url).toBe('/dashboard/timetable'); // guard doesn't touch it on allow
    localStorage.removeItem('redirectUrl');
  });

  /** CHECKING → authoritative 401/403 → UNAUTHENTICATED → correct redirect. Unlike the
   *  persistent-network-failure case above, this resolves quickly (well within the bound) with
   *  a real rejection, so the session IS marked UNAUTHENTICATED — that's the one case where
   *  CHECKING correctly turns into a definitive logout. */
  it('CHECKING that resolves to an authoritative 401 becomes UNAUTHENTICATED and redirects', fakeAsync(() => {
    let result: boolean | undefined;
    const guardResult = TestBed.runInInjectionContext(() =>
      authGuard({} as any, { url: '/dashboard/fees' } as any)
    ) as Promise<boolean>;
    guardResult.then(r => (result = r));

    flushMicrotasks();
    http.expectOne(`${environment.apiUrl}/auth/me`).flush('nope', { status: 401, statusText: 'Unauthorized' });
    flushMicrotasks();

    expect(result).toBeFalse();
    expect(authState.getStatus()).toBe('UNAUTHENTICATED');
    expect(router.navigate).toHaveBeenCalledWith(['/home']);
    localStorage.removeItem('redirectUrl');
  }));

  it('CHECKING that resolves to an authoritative 403 becomes UNAUTHENTICATED and redirects', fakeAsync(() => {
    let result: boolean | undefined;
    const guardResult = TestBed.runInInjectionContext(() =>
      authGuard({} as any, { url: '/dashboard/fees' } as any)
    ) as Promise<boolean>;
    guardResult.then(r => (result = r));

    flushMicrotasks();
    http.expectOne(`${environment.apiUrl}/auth/me`).flush('nope', { status: 403, statusText: 'Forbidden' });
    flushMicrotasks();

    expect(result).toBeFalse();
    expect(authState.getStatus()).toBe('UNAUTHENTICATED');
    expect(router.navigate).toHaveBeenCalledWith(['/home']);
    localStorage.removeItem('redirectUrl');
  }));
});
