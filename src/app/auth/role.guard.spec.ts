import { TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { roleGuard } from './role.guard';
import { AuthStateService } from './auth-state.service';
import { environment } from '../../environments/environment';

describe('roleGuard', () => {
  let authState: jasmine.SpyObj<AuthStateService>;
  let router: Router;

  beforeEach(() => {
    authState = jasmine.createSpyObj('AuthStateService', ['isLoggedIn', 'isChecking', 'mustChangePassword', 'getUserRole', 'isCoordinator']);
    authState.isChecking.and.returnValue(false);
    TestBed.configureTestingModule({
      imports: [RouterTestingModule],
      providers: [{ provide: AuthStateService, useValue: authState }],
    });
    router = TestBed.inject(Router);
    spyOn(router, 'navigate');
  });

  function run(roles: string[] = ['ADMIN']) {
    const route = { data: { roles }, routeConfig: { path: 'fees' } } as any;
    return TestBed.runInInjectionContext(() => roleGuard(route, { url: '/dashboard/fees' } as any));
  }

  it('redirects a confirmed-logged-out user to /home', () => {
    authState.isLoggedIn.and.returnValue(false);

    expect(run()).toBeFalse();
    expect(router.navigate).toHaveBeenCalledWith(['/home']);
  });

  it('redirects a restricted (mustChangePassword) user to /change-initial-password before checking role', () => {
    authState.isLoggedIn.and.returnValue(true);
    authState.mustChangePassword.and.returnValue(true);

    expect(run(['ADMIN'])).toBeFalse();
    expect(router.navigate).toHaveBeenCalledWith(['/change-initial-password']);
    expect(authState.getUserRole).not.toHaveBeenCalled();
  });

  it('allows a normal user whose role matches', () => {
    authState.isLoggedIn.and.returnValue(true);
    authState.mustChangePassword.and.returnValue(false);
    authState.getUserRole.and.returnValue('ADMIN');

    expect(run(['ADMIN'])).toBeTrue();
  });

  it('opens COORDINATOR routes only to a teacher holding an active Coordinator appointment', () => {
    authState.isLoggedIn.and.returnValue(true);
    authState.mustChangePassword.and.returnValue(false);
    authState.getUserRole.and.returnValue('TEACHER');

    authState.isCoordinator.and.returnValue(true);
    expect(run(['COORDINATOR'])).toBeTrue();
    expect(run(['ADMIN', 'PRINCIPAL'])).toBeFalse();

    authState.isCoordinator.and.returnValue(false);
    expect(run(['COORDINATOR'])).toBeFalse();
    expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
  });

  it('redirects to /dashboard when the role does not match', () => {
    authState.isLoggedIn.and.returnValue(true);
    authState.mustChangePassword.and.returnValue(false);
    authState.getUserRole.and.returnValue('STUDENT');

    expect(run(['ADMIN'])).toBeFalse();
    expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
  });
});

/**
 * "Do NOT allow CHECKING to bypass role authorization" — an unresolved identity must never be
 * treated as authorized, and even once resolved, the normal role check still applies in full.
 * Uses the real AuthStateService so the guard's resolveCheckingState() call exercises actual
 * HTTP-backed state transitions, not a hand-wired spy stand-in for them.
 */
describe('roleGuard — CHECKING never bypasses role authorization', () => {
  let authState: AuthStateService;
  let http: HttpTestingController;
  let router: Router;

  function run(roles: string[] = ['ADMIN'], url = '/dashboard/fees') {
    const route = { data: { roles }, routeConfig: { path: 'fees' } } as any;
    return TestBed.runInInjectionContext(() => roleGuard(route, { url } as any));
  }

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

  it('a CHECKING user who resolves to AUTHENTICATED but the wrong role is still denied, never let through on identity alone', fakeAsync(() => {
    let result: boolean | undefined;
    (run(['ADMIN']) as Promise<boolean>).then(r => (result = r));

    flushMicrotasks();
    http.expectOne(`${environment.apiUrl}/auth/me`).flush({
      userId: 'S1', role: 'STUDENT', name: null, className: null, schoolSlug: null,
      featureKeys: null, planTier: null, planVersion: null, subscriptionStatus: null,
      trialEndsAt: null, expiresAt: null, graceEndsAt: null, permissionKeys: null,
    } as any);
    flushMicrotasks();

    expect(result).toBeFalse();
    expect(router.navigate).toHaveBeenCalledWith(['/dashboard']); // role mismatch, not /home
  }));

  it('a CHECKING user who resolves to AUTHENTICATED with a matching role is allowed', fakeAsync(() => {
    let result: boolean | undefined;
    (run(['ADMIN']) as Promise<boolean>).then(r => (result = r));

    flushMicrotasks();
    http.expectOne(`${environment.apiUrl}/auth/me`).flush({
      userId: 'A1', role: 'ADMIN', name: null, className: null, schoolSlug: null,
      featureKeys: null, planTier: null, planVersion: null, subscriptionStatus: null,
      trialEndsAt: null, expiresAt: null, graceEndsAt: null, permissionKeys: null,
    } as any);
    flushMicrotasks();

    expect(result).toBeTrue();
    expect(router.navigate).not.toHaveBeenCalled();
  }));

  it('a CHECKING user who resolves to an authoritative 401 is redirected to /home, never granted a role-based decision', fakeAsync(() => {
    let result: boolean | undefined;
    (run(['ADMIN']) as Promise<boolean>).then(r => (result = r));

    flushMicrotasks();
    http.expectOne(`${environment.apiUrl}/auth/me`).flush('nope', { status: 401, statusText: 'Unauthorized' });
    flushMicrotasks();

    expect(result).toBeFalse();
    expect(router.navigate).toHaveBeenCalledWith(['/home']);
  }));
});
