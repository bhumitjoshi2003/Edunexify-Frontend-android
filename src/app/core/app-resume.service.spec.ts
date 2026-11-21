import { fakeAsync, flushMicrotasks, TestBed, tick } from '@angular/core/testing';
import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { AppResumeService, RESUME_REVALIDATE_AFTER_MS } from './app-resume.service';
import { AuthInterceptor } from '../auth/auth.interceptor';
import { AuthStateService, UserInfo } from '../auth/auth-state.service';
import { STARTUP_HTTP_TIMEOUT_MS } from './startup.constants';
import { environment } from '../../environments/environment';
import { consumeIntendedRoute } from '../auth/redirect-url.util';

/**
 * Returning to a long-idle tab, end to end through the real AuthStateService and AuthInterceptor
 * against a mocked backend: browser lifecycle events are dispatched on document/window exactly
 * as a (mobile) browser fires them. Shared by the web and Android clients — keep the two copies identical.
 */
describe('AppResumeService — returning to a long-idle tab', () => {
  const ME = `${environment.apiUrl}/auth/me`;
  const REFRESH = `${environment.apiUrl}/auth/refresh-token`;
  const user: UserInfo = {
    userId: 'T1', role: 'TEACHER', name: 'Ms Rao', className: null, schoolSlug: null,
    featureKeys: [], planTier: null, planVersion: null, subscriptionStatus: null,
    trialEndsAt: null, expiresAt: null, graceEndsAt: null, permissionKeys: [],
  };
  const originalPath = window.location.pathname + window.location.search;

  let http: HttpTestingController;
  let authState: AuthStateService;
  let resume: AppResumeService;
  let router: Router;
  let clock: number;
  let resumedCount: number;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    authState = TestBed.inject(AuthStateService);
    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
    spyOn(router, 'navigateByUrl').and.resolveTo(true);
    resume = TestBed.inject(AppResumeService);
    clock = 1_000_000;
    spyOn(resume as any, 'now').and.callFake(() => clock);
    resumedCount = 0;
    resume.resumed$.subscribe(() => resumedCount++);
    setVisibility('visible');
    resume.start();
    authState.setUser(user);   // signed in before the tab went to the background
    localStorage.removeItem('redirectUrl');
    window.history.pushState(null, '', '/dashboard/teacher-attendance');
  });

  afterEach(() => {
    http.verify();
    setVisibility('visible');
    localStorage.removeItem('redirectUrl');
    window.history.replaceState(null, '', originalPath);
  });

  function setVisibility(state: DocumentVisibilityState): void {
    Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  }

  function hideFor(ms: number): void {
    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    clock += ms;
    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
  }

  const unauthorized = { status: 401, statusText: 'Unauthorized' };

  it('hidden → visible after a long idle re-verifies the session once and reloads data', async () => {
    hideFor(RESUME_REVALIDATE_AFTER_MS + 1);

    http.expectOne(ME).flush(user);
    await resume.revalidate();

    expect(authState.isAuthenticated()).toBeTrue();
    expect(resumedCount).toBe(1);
  });

  it('a brief switch away makes no request at all', () => {
    hideFor(30_000);

    http.expectNone(ME);
    expect(resumedCount).toBe(0);
  });

  it('expired access token + valid refresh token: one silent refresh, the session continues', async () => {
    hideFor(RESUME_REVALIDATE_AFTER_MS);

    http.expectOne(ME).flush('expired', unauthorized);
    http.expectOne(REFRESH).flush(user);
    http.expectOne(ME).flush(user);
    await resume.revalidate();

    expect(authState.isAuthenticated()).toBeTrue();
    expect(resumedCount).toBe(1);
    expect(router.navigate).not.toHaveBeenCalled();
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('refresh rejected (session expired or revoked): signed out and sent to login, remembering the page', async () => {
    hideFor(RESUME_REVALIDATE_AFTER_MS);

    http.expectOne(ME).flush('expired', unauthorized);
    http.expectOne(REFRESH).flush('revoked', unauthorized);
    await resume.revalidate();

    expect(authState.isUnauthenticated()).toBeTrue();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/home');
    expect(consumeIntendedRoute()).toBe('/dashboard/teacher-attendance');
    expect(resumedCount).toBe(0);
  });

  it('a back/forward-cache restore (pageshow persisted) re-verifies; a normal pageshow does not', async () => {
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false }));
    http.expectNone(ME);

    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    http.expectOne(ME).flush(user);
    await resume.revalidate();

    expect(resumedCount).toBe(1);
  });

  it('resume, bfcache restore and reconnect firing together share one check and one refresh', async () => {
    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    clock += RESUME_REVALIDATE_AFTER_MS * 10;
    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    window.dispatchEvent(new Event('online'));

    http.expectOne(ME).flush('expired', unauthorized);
    http.expectOne(REFRESH).flush(user);
    http.expectOne(ME).flush(user);
    await resume.revalidate();

    expect(resumedCount).toBe(1);
  });

  it('a request that never answers after resume still settles — nothing is left loading forever', fakeAsync(() => {
    hideFor(RESUME_REVALIDATE_AFTER_MS);
    let settled = false;
    resume.revalidate().then(() => settled = true);

    const me = http.expectOne(ME);
    me.flush('expired', unauthorized);
    const refresh = http.expectOne(REFRESH);   // the refresh hangs (socket killed while frozen)
    tick(STARTUP_HTTP_TIMEOUT_MS);
    flushMicrotasks();

    expect(refresh.cancelled).toBeTrue();
    expect(settled).toBeTrue();
    expect(authState.isAuthenticated()).toBeTrue();   // not verified, but never logged out
    expect(resumedCount).toBe(0);
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  }));

  it('offline → online: the page is kept while offline, then the session recovers on reconnect', async () => {
    hideFor(RESUME_REVALIDATE_AFTER_MS);
    http.expectOne(ME).error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });
    await resume.revalidate();

    expect(authState.isAuthenticated()).toBeTrue();
    expect(resumedCount).toBe(0);
    expect(router.navigateByUrl).not.toHaveBeenCalled();

    window.dispatchEvent(new Event('online'));
    http.expectOne(ME).flush(user);
    await resume.revalidate();

    expect(resumedCount).toBe(1);
  });

  it('an already signed-out tab on a protected page goes to login without calling the server', async () => {
    authState.clearUser();
    hideFor(RESUME_REVALIDATE_AFTER_MS);
    await resume.revalidate();

    http.expectNone(ME);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/home');
  });

  it('stops listening when the app is torn down', () => {
    resume.ngOnDestroy();
    hideFor(RESUME_REVALIDATE_AFTER_MS);
    window.dispatchEvent(new Event('online'));

    http.expectNone(ME);
  });

  // ─── Native lifecycle (Android app-state events) shares the same decisions ───

  it('native background → foreground after a long idle re-verifies once, even when the WebView also fires visibility events', async () => {
    resume.backgrounded();
    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    clock += RESUME_REVALIDATE_AFTER_MS + 1;
    resume.foregrounded();
    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));

    http.expectOne(ME).flush(user);
    await resume.revalidate();
    expect(resumedCount).toBe(1);
  });

  it('a brief native background makes no request', () => {
    resume.backgrounded();
    clock += 10_000;
    resume.foregrounded();
    http.expectNone(ME);
  });

  it('an online event immediately after the visibility resume joins the same check', async () => {
    hideFor(RESUME_REVALIDATE_AFTER_MS);
    window.dispatchEvent(new Event('online'));
    http.expectOne(ME).flush(user);
    await resume.revalidate();
    expect(resumedCount).toBe(1);
  });

  it('native resume after the session was revoked: signed out and sent to login', async () => {
    resume.backgrounded();
    clock += RESUME_REVALIDATE_AFTER_MS;
    resume.foregrounded();
    http.expectOne(ME).flush('revoked', unauthorized);
    http.expectOne(REFRESH).flush('revoked', unauthorized);
    await resume.revalidate();
    expect(authState.isUnauthenticated()).toBeTrue();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/home');
  });

  it('native resume during a temporary outage keeps the session', async () => {
    resume.backgrounded();
    clock += RESUME_REVALIDATE_AFTER_MS;
    resume.foregrounded();
    http.expectOne(ME).flush('down', { status: 503, statusText: 'Unavailable' });
    await resume.revalidate();
    expect(authState.isAuthenticated()).toBeTrue();
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });
});
