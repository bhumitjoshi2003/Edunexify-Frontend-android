import { TestBed } from '@angular/core/testing';
import { HttpClient, HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { AuthInterceptor } from './auth.interceptor';
import { AuthStateService } from './auth-state.service';
import { environment } from '../../environments/environment';

/**
 * Phase: forgot-password /home hijack fix. A failed silent token-refresh must not force
 * navigation away from a route that's genuinely usable with zero session (home,
 * reset-password, verify-rc) — an anonymous visitor there is EXPECTED to get 401/401, and
 * that must not hijack them off the page they're legitimately trying to use. Protected
 * routes must keep the original behavior (redirect to /home) unchanged.
 */
describe('AuthInterceptor — refresh-failure navigation', () => {
  let http: HttpTestingController;
  let httpClient: HttpClient;
  let router: Router;
  const base = environment.apiUrl;

  const userInfo = {
    userId: 'u1', role: 'ADMIN', name: null, className: null, schoolSlug: null,
    featureKeys: null, planTier: null, planVersion: null, subscriptionStatus: null,
    trialEndsAt: null, expiresAt: null, graceEndsAt: null, permissionKeys: null,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    httpClient = TestBed.inject(HttpClient);
    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
  });

  const originalPath = window.location.pathname + window.location.search;

  afterEach(() => {
    http.verify();
    window.history.replaceState(null, '', originalPath);
  });

  function simulatePath(path: string): void {
    window.history.pushState(null, '', path);
  }

  function failMeThenRefresh(originalUrl: string): void {
    httpClient.get(originalUrl, { withCredentials: true }).subscribe({ error: () => {} });
    http.expectOne(originalUrl).flush('unauthorized', { status: 401, statusText: 'Unauthorized' });
    http.expectOne(`${base}/auth/refresh-token`).flush('unauthorized', { status: 401, statusText: 'Unauthorized' });
  }

  it('does not navigate away when an anonymous /me 401 + refresh 401 happens on reset-password', () => {
    simulatePath('/reset-password');
    failMeThenRefresh(`${base}/auth/me`);
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('does not navigate away when the same failure happens on verify-rc', () => {
    simulatePath('/verify-rc');
    failMeThenRefresh(`${base}/auth/me`);
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('does not navigate away from the public privacy-policy and account-deletion pages', () => {
    for (const path of ['/privacy-policy', '/account-deletion']) {
      simulatePath(path);
      failMeThenRefresh(`${base}/auth/me`);
    }
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('does not navigate away on home itself', () => {
    simulatePath('/home');
    failMeThenRefresh(`${base}/auth/me`);
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('still redirects to /home when refresh fails on a protected route', () => {
    simulatePath('/dashboard/fees');
    failMeThenRefresh(`${base}/some-protected-endpoint`);
    expect(router.navigate).toHaveBeenCalledWith(['/home']);
  });

  it('still redirects to /home when refresh fails on a nested protected route', () => {
    simulatePath('/dashboard/fees/S1');
    failMeThenRefresh(`${base}/some-protected-endpoint`);
    expect(router.navigate).toHaveBeenCalledWith(['/home']);
  });

  it('retries the original request after a successful refresh and never navigates, on any route', () => {
    simulatePath('/dashboard/fees');
    httpClient.get(`${base}/some-protected-endpoint`, { withCredentials: true }).subscribe();

    http.expectOne(`${base}/some-protected-endpoint`)
        .flush('unauthorized', { status: 401, statusText: 'Unauthorized' });
    http.expectOne(`${base}/auth/refresh-token`).flush(userInfo);
    http.expectOne(`${base}/some-protected-endpoint`).flush({ ok: true });

    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('does not treat a route merely starting with a public prefix as public (e.g. /reset-password-request)', () => {
    simulatePath('/reset-password-request');
    failMeThenRefresh(`${base}/some-protected-endpoint`);
    expect(router.navigate).toHaveBeenCalledWith(['/home']);
  });

  it('saves the intended route before an authoritative-failure redirect from a protected route', () => {
    localStorage.removeItem('redirectUrl');
    simulatePath('/dashboard/timetable');
    failMeThenRefresh(`${base}/some-protected-endpoint`);

    expect(router.navigate).toHaveBeenCalledWith(['/home']);
    expect(localStorage.getItem('redirectUrl')).toBe('/dashboard/timetable');
    localStorage.removeItem('redirectUrl');
  });
});

/**
 * Transient (network/transport) refresh failures: the audit's primary finding was that these
 * were being treated identically to an authoritative 401/403 rejection, silently logging out a
 * perfectly valid session (e.g. right after a laptop wakes from sleep, before Wi-Fi has
 * reconnected). A transient failure must never clear auth or navigate away.
 */
describe('AuthInterceptor — transient vs. authoritative refresh failure', () => {
  let http: HttpTestingController;
  let httpClient: HttpClient;
  let router: Router;
  let authState: AuthStateService;
  const base = environment.apiUrl;

  const userInfo = {
    userId: 'T1', role: 'TEACHER', name: null, className: null, schoolSlug: null,
    featureKeys: null, planTier: null, planVersion: null, subscriptionStatus: null,
    trialEndsAt: null, expiresAt: null, graceEndsAt: null, permissionKeys: null,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    httpClient = TestBed.inject(HttpClient);
    router = TestBed.inject(Router);
    authState = TestBed.inject(AuthStateService);
    authState.setUser(userInfo as any);
    spyOn(router, 'navigate').and.resolveTo(true);
    spyOn(authState, 'clearUser').and.callThrough();
  });

  const originalPath = window.location.pathname + window.location.search;
  afterEach(() => {
    http.verify();
    window.history.replaceState(null, '', originalPath);
  });

  function simulatePath(path: string): void {
    window.history.pushState(null, '', path);
  }

  it('12/14. a network failure (status 0) on refresh does NOT clear auth and does NOT navigate to /home', () => {
    simulatePath('/dashboard/timetable');
    let sawError = false;
    httpClient.get(`${base}/some-protected-endpoint`, { withCredentials: true }).subscribe({
      error: () => { sawError = true; },
    });

    http.expectOne(`${base}/some-protected-endpoint`).flush('unauthorized', { status: 401, statusText: 'Unauthorized' });
    http.expectOne(`${base}/auth/refresh-token`)
      .error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });

    expect(sawError).toBeTrue(); // the ORIGINAL request still fails this one time
    expect(authState.clearUser).not.toHaveBeenCalled();
    expect(authState.isLoggedIn()).toBeTrue(); // session preserved
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('a 503 from refresh does NOT clear auth and does NOT navigate to /home', () => {
    simulatePath('/dashboard/timetable');
    httpClient.get(`${base}/some-protected-endpoint`, { withCredentials: true }).subscribe({ error: () => {} });

    http.expectOne(`${base}/some-protected-endpoint`).flush('unauthorized', { status: 401, statusText: 'Unauthorized' });
    http.expectOne(`${base}/auth/refresh-token`).flush('unavailable', { status: 503, statusText: 'Service Unavailable' });

    expect(authState.clearUser).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('11. an authoritative 401 from refresh DOES clear auth exactly once', () => {
    simulatePath('/dashboard/timetable');
    httpClient.get(`${base}/some-protected-endpoint`, { withCredentials: true }).subscribe({ error: () => {} });

    http.expectOne(`${base}/some-protected-endpoint`).flush('unauthorized', { status: 401, statusText: 'Unauthorized' });
    http.expectOne(`${base}/auth/refresh-token`).flush('unauthorized', { status: 401, statusText: 'Unauthorized' });

    expect(authState.clearUser).toHaveBeenCalledTimes(1);
    expect(authState.isLoggedIn()).toBeFalse();
    expect(router.navigate).toHaveBeenCalledWith(['/home']);
  });

  it('9/10. concurrent same-tab 401s trigger exactly one refresh, and both requests are retried on success', () => {
    simulatePath('/dashboard/timetable');
    const results: boolean[] = [];
    httpClient.get(`${base}/endpoint-a`, { withCredentials: true }).subscribe({ next: () => results.push(true) });
    httpClient.get(`${base}/endpoint-b`, { withCredentials: true }).subscribe({ next: () => results.push(true) });

    http.expectOne(`${base}/endpoint-a`).flush('unauthorized', { status: 401, statusText: 'Unauthorized' });
    http.expectOne(`${base}/endpoint-b`).flush('unauthorized', { status: 401, statusText: 'Unauthorized' });

    // Exactly one refresh call regardless of how many requests failed first.
    http.expectOne(`${base}/auth/refresh-token`).flush(userInfo);

    http.expectOne(`${base}/endpoint-a`).flush({ ok: true });
    http.expectOne(`${base}/endpoint-b`).flush({ ok: true });

    expect(results).toEqual([true, true]);
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('15. queued requests are released with an error (not left hanging) when the coordinated refresh fails transiently', () => {
    simulatePath('/dashboard/timetable');
    let errorA = false, errorB = false;
    httpClient.get(`${base}/endpoint-a`, { withCredentials: true }).subscribe({ error: () => { errorA = true; } });
    httpClient.get(`${base}/endpoint-b`, { withCredentials: true }).subscribe({ error: () => { errorB = true; } });

    http.expectOne(`${base}/endpoint-a`).flush('unauthorized', { status: 401, statusText: 'Unauthorized' });
    http.expectOne(`${base}/endpoint-b`).flush('unauthorized', { status: 401, statusText: 'Unauthorized' });

    http.expectOne(`${base}/auth/refresh-token`)
      .error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });

    expect(errorA).toBeTrue();
    expect(errorB).toBeTrue();
    expect(authState.clearUser).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('15b. a later request after a transient refresh failure can still trigger a fresh refresh attempt (not stuck)', () => {
    simulatePath('/dashboard/timetable');
    httpClient.get(`${base}/endpoint-a`, { withCredentials: true }).subscribe({ error: () => {} });
    http.expectOne(`${base}/endpoint-a`).flush('unauthorized', { status: 401, statusText: 'Unauthorized' });
    http.expectOne(`${base}/auth/refresh-token`)
      .error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });

    // A subsequent request/retry (e.g. from a resume or `online` event) must be able to start
    // its OWN refresh attempt — isRefreshing must have been reset, not left stuck true.
    let succeeded = false;
    httpClient.get(`${base}/endpoint-a`, { withCredentials: true }).subscribe({ next: () => { succeeded = true; } });
    http.expectOne(`${base}/endpoint-a`).flush('unauthorized', { status: 401, statusText: 'Unauthorized' });
    http.expectOne(`${base}/auth/refresh-token`).flush(userInfo);
    http.expectOne(`${base}/endpoint-a`).flush({ ok: true });

    expect(succeeded).toBeTrue();
    expect(router.navigate).not.toHaveBeenCalled();
  });
});
