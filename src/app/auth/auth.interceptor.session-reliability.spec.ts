import { TestBed, fakeAsync, tick, flush } from '@angular/core/testing';
import { HttpClient, HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { AuthInterceptor } from './auth.interceptor';
import { AuthStateService } from './auth-state.service';
import { nativeSession, REFRESH_TIMEOUT_MS } from '../core/native-session';
import { environment } from '../../environments/environment';

/**
 * Android session reliability: the platform header that selects the mobile session lifetime,
 * cookie persistence after a login/refresh rotation, a bounded refresh, one refresh for many
 * concurrent 401s, and a failed refresh that never leaves requests queued.
 */
describe('AuthInterceptor — Android session reliability', () => {
  let http: HttpTestingController;
  let client: HttpClient;
  let router: Router;
  let authState: AuthStateService;
  let flushSpy: jasmine.Spy;
  const base = environment.apiUrl;
  const userInfo = { userId: 'u1', role: 'ADMIN', name: null, className: null, schoolSlug: null, featureKeys: null,
    planTier: null, planVersion: null, subscriptionStatus: null, trialEndsAt: null, expiresAt: null, graceEndsAt: null, permissionKeys: null };

  function setup(android: boolean) {
    spyOn(nativeSession, 'isAndroidShell').and.returnValue(android);
    flushSpy = spyOn(nativeSession, 'flushCookies').and.resolveTo();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting(),
        { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    client = TestBed.inject(HttpClient);
    router = TestBed.inject(Router);
    authState = TestBed.inject(AuthStateService);
    spyOn(router, 'navigate').and.resolveTo(true);
  }

  afterEach(() => http.verify());

  it('sends the platform header from the Android shell, on login and refresh too', () => {
    setup(true);
    client.post(`${base}/auth/login`, {}).subscribe();
    const req = http.expectOne(`${base}/auth/login`);
    expect(req.request.headers.get('X-Client-Platform')).toBe('android');
    req.flush(userInfo);
  });

  it('does not send the platform header from a browser', () => {
    setup(false);
    client.get(`${base}/students`).subscribe();
    const req = http.expectOne(`${base}/students`);
    expect(req.request.headers.has('X-Client-Platform')).toBeFalse();
    req.flush([]);
  });

  it('persists cookies right after a successful login (a new refresh cookie was issued)', () => {
    setup(true);
    client.post(`${base}/auth/login`, {}).subscribe();
    http.expectOne(`${base}/auth/login`).flush(userInfo);
    expect(flushSpy).toHaveBeenCalledTimes(1);
  });

  it('persists the ROTATED refresh cookie right after a successful refresh, so an app kill cannot lose it', () => {
    setup(true);
    client.get(`${base}/students`).subscribe();
    http.expectOne(`${base}/students`).flush('x', { status: 401, statusText: 'Unauthorized' });
    expect(flushSpy).not.toHaveBeenCalled();
    http.expectOne(`${base}/auth/refresh-token`).flush(userInfo);
    expect(flushSpy).toHaveBeenCalledTimes(1);          // the rotation response
    http.expectOne(`${base}/students`).flush([]);        // the retried request
  });

  it('does not touch the cookie store for ordinary calls or a failed refresh', () => {
    setup(true);
    client.get(`${base}/students`).subscribe({ error: () => {} });
    http.expectOne(`${base}/students`).flush([]);
    client.get(`${base}/teachers`).subscribe({ error: () => {} });
    http.expectOne(`${base}/teachers`).flush('x', { status: 401, statusText: 'Unauthorized' });
    http.expectOne(`${base}/auth/refresh-token`).flush('x', { status: 401, statusText: 'Unauthorized' });
    expect(flushSpy).not.toHaveBeenCalled();
  });

  it('several concurrent 401s share ONE refresh and are all retried after it', () => {
    setup(true);
    const results: string[] = [];
    for (const path of ['a', 'b', 'c']) client.get(`${base}/${path}`).subscribe(() => results.push(path));
    for (const path of ['a', 'b', 'c']) http.expectOne(`${base}/${path}`).flush('x', { status: 401, statusText: 'Unauthorized' });
    const refreshes = http.match(`${base}/auth/refresh-token`);
    expect(refreshes.length).toBe(1);
    refreshes[0].flush(userInfo);
    for (const path of ['a', 'b', 'c']) http.expectOne(`${base}/${path}`).flush([]);
    expect(results.sort()).toEqual(['a', 'b', 'c']);
  });

  it('a refresh that never answers times out: the request fails, the queued one is released, nobody is stuck', fakeAsync(() => {
    setup(true);
    const errors: any[] = [];
    client.get(`${base}/a`).subscribe({ error: e => errors.push(['a', e.status ?? e.name]) });
    client.get(`${base}/b`).subscribe({ error: e => errors.push(['b', e.status ?? e.name]) });
    http.expectOne(`${base}/a`).flush('x', { status: 401, statusText: 'Unauthorized' });
    http.expectOne(`${base}/b`).flush('x', { status: 401, statusText: 'Unauthorized' });
    http.expectOne(`${base}/auth/refresh-token`);        // pending forever
    expect(errors.length).toBe(0);
    tick(REFRESH_TIMEOUT_MS + 1);
    expect(errors.map(e => e[0]).sort()).toEqual(['a', 'b']); // both released
    expect(router.navigate).not.toHaveBeenCalled();           // a timeout is not proof the session ended

    // and the next 401 is not queued behind a dead refresh — a fresh one starts
    client.get(`${base}/c`).subscribe({ error: () => {} });
    http.expectOne(`${base}/c`).flush('x', { status: 401, statusText: 'Unauthorized' });
    http.expectOne(`${base}/auth/refresh-token`);
    tick(REFRESH_TIMEOUT_MS + 1);
    flush();
  }));

  it('an expired/rejected refresh clears the session, goes to login, and releases queued requests', () => {
    setup(true);
    spyOn(authState, 'clearUser').and.callThrough();
    window.history.pushState(null, '', '/dashboard/students');
    const errors: string[] = [];
    client.get(`${base}/a`).subscribe({ error: () => errors.push('a') });
    client.get(`${base}/b`).subscribe({ error: () => errors.push('b') });
    http.expectOne(`${base}/a`).flush('x', { status: 401, statusText: 'Unauthorized' });
    http.expectOne(`${base}/b`).flush('x', { status: 401, statusText: 'Unauthorized' });
    http.expectOne(`${base}/auth/refresh-token`).flush('Your session has reached its maximum lifetime. Please sign in again.',
      { status: 401, statusText: 'Unauthorized' });
    expect(errors.sort()).toEqual(['a', 'b']);
    expect(authState.clearUser).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/home']);
    window.history.pushState(null, '', '/');
  });

  it('a successful refresh after an earlier timeout works again (no stale in-flight state)', fakeAsync(() => {
    setup(true);
    client.get(`${base}/a`).subscribe({ error: () => {} });
    http.expectOne(`${base}/a`).flush('x', { status: 401, statusText: 'Unauthorized' });
    http.expectOne(`${base}/auth/refresh-token`);
    tick(REFRESH_TIMEOUT_MS + 1);

    let ok = false;
    client.get(`${base}/b`).subscribe(() => ok = true);
    http.expectOne(`${base}/b`).flush('x', { status: 401, statusText: 'Unauthorized' });
    http.expectOne(`${base}/auth/refresh-token`).flush(userInfo);
    http.expectOne(`${base}/b`).flush([]);
    expect(ok).toBeTrue();
    flush();
  }));
});
