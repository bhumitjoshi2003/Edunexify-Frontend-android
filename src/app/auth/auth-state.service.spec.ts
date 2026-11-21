import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AuthStateService, UserInfo } from './auth-state.service';
import { environment } from '../../environments/environment';
import { STARTUP_HTTP_TIMEOUT_MS } from '../core/startup.constants';

describe('AuthStateService — mustChangePassword', () => {
  let service: AuthStateService;

  const baseUser: UserInfo = {
    userId: 'S1',
    role: 'STUDENT',
    name: 'Test Student',
    className: '10',
    schoolSlug: 'demo',
    featureKeys: null,
    planTier: null,
    planVersion: null,
    subscriptionStatus: null,
    trialEndsAt: null,
    expiresAt: null,
    graceEndsAt: null,
    permissionKeys: null,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    service = TestBed.inject(AuthStateService);
  });

  it('returns false when no user is loaded', () => {
    expect(service.mustChangePassword()).toBeFalse();
  });

  it('returns false for a normal session (flag absent)', () => {
    service.setUser({ ...baseUser });
    expect(service.mustChangePassword()).toBeFalse();
  });

  it('returns false when the backend explicitly sends false', () => {
    service.setUser({ ...baseUser, mustChangePassword: false });
    expect(service.mustChangePassword()).toBeFalse();
  });

  it('returns true for a restricted first-login session', () => {
    service.setUser({ ...baseUser, mustChangePassword: true });
    expect(service.mustChangePassword()).toBeTrue();
  });

  it('returns false again after clearUser()', () => {
    service.setUser({ ...baseUser, mustChangePassword: true });
    service.clearUser();
    expect(service.mustChangePassword()).toBeFalse();
  });

  it('grants only explicitly entitled paid features', () => {
    service.setUser({ ...baseUser, featureKeys: ['FEE_MANAGEMENT', 'EXAM_MARKS'] });

    expect(service.hasFeature('FEE_MANAGEMENT')).toBeTrue();
    expect(service.hasFeature('AI_COPILOT')).toBeFalse();
  });

  it('denies paid features when no effective entitlement is available', () => {
    service.setUser({ ...baseUser, featureKeys: [] });
    expect(service.hasFeature('AI_COPILOT')).toBeFalse();

    service.setUser({ ...baseUser, featureKeys: null });
    expect(service.hasFeature('AI_COPILOT')).toBeFalse();
  });
});

/**
 * Bootstrap / tri-state auth status. loadCurrentUser()'s HTTP call is exercised directly via
 * HttpTestingController here (no AuthInterceptor registered) — this is deliberately testing
 * AuthStateService's OWN classification/state-transition logic in isolation; the "expired
 * access token → interceptor silently refreshes → retried /auth/me succeeds" round trip is
 * exercised end-to-end in auth.interceptor.spec.ts. From loadCurrentUser()'s point of view,
 * that whole dance is indistinguishable from any other successful /auth/me response.
 */
describe('AuthStateService — bootstrap tri-state (CHECKING / AUTHENTICATED / UNAUTHENTICATED)', () => {
  let service: AuthStateService;
  let http: HttpTestingController;
  const base = `${environment.apiUrl}/auth/me`;

  const userInfo: UserInfo = {
    userId: 'T1', role: 'TEACHER', name: 'Teacher One', className: null, schoolSlug: 'demo',
    featureKeys: null, planTier: null, planVersion: null, subscriptionStatus: null,
    trialEndsAt: null, expiresAt: null, graceEndsAt: null, permissionKeys: null,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    service = TestBed.inject(AuthStateService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('starts CHECKING before any check has run', () => {
    expect(service.getStatus()).toBe('CHECKING');
    expect(service.isChecking()).toBeTrue();
    expect(service.isLoggedIn()).toBeFalse();
  });

  it('1. a valid session (successful /auth/me) becomes AUTHENTICATED', async () => {
    const p = service.loadCurrentUser();
    http.expectOne(base).flush(userInfo);
    await p;

    expect(service.getStatus()).toBe('AUTHENTICATED');
    expect(service.isLoggedIn()).toBeTrue();
    expect(service.getUser()?.userId).toBe('T1');
  });

  it('2. a request that eventually succeeds (as it would after a silent interceptor refresh) becomes AUTHENTICATED', async () => {
    // From loadCurrentUser()'s perspective this is identical to case 1 — the interceptor's
    // retry-after-refresh is transparent to it. Confirms bootstrap doesn't add its own
    // extra distinction that could get in the way of that transparency.
    const p = service.loadCurrentUser();
    http.expectOne(base).flush(userInfo);
    await p;
    expect(service.getStatus()).toBe('AUTHENTICATED');
  });

  it('3. a definitive 401 becomes UNAUTHENTICATED', async () => {
    const p = service.loadCurrentUser();
    http.expectOne(base).flush('nope', { status: 401, statusText: 'Unauthorized' });
    await p;

    expect(service.getStatus()).toBe('UNAUTHENTICATED');
    expect(service.isLoggedIn()).toBeFalse();
  });

  it('4. a definitive 403 becomes UNAUTHENTICATED', async () => {
    const p = service.loadCurrentUser();
    http.expectOne(base).flush('nope', { status: 403, statusText: 'Forbidden' });
    await p;

    expect(service.getStatus()).toBe('UNAUTHENTICATED');
  });

  it('5. a network failure (status 0) does NOT force UNAUTHENTICATED — becomes SERVICE_UNAVAILABLE (online) instead of hanging in CHECKING', async () => {
    const p = service.loadCurrentUser();
    http.expectOne(base).error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });
    await p;

    expect(service.getStatus()).toBe('SERVICE_UNAVAILABLE');
    expect(service.isUnauthenticated()).toBeFalse();
    expect(service.isChecking()).toBeFalse();
  });

  it('5b. the same network failure becomes OFFLINE instead when navigator.onLine reports false', async () => {
    spyOnProperty(navigator, 'onLine').and.returnValue(false);

    const p = service.loadCurrentUser();
    http.expectOne(base).error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });
    await p;

    expect(service.getStatus()).toBe('OFFLINE');
    expect(service.isOffline()).toBeTrue();
  });

  it('6. a 503 during the check does NOT force UNAUTHENTICATED — becomes SERVICE_UNAVAILABLE instead of hanging in CHECKING', async () => {
    const p = service.loadCurrentUser();
    http.expectOne(base).flush('unavailable', { status: 503, statusText: 'Service Unavailable' });
    await p;

    expect(service.getStatus()).toBe('SERVICE_UNAVAILABLE');
    expect(service.isServiceUnavailable()).toBeTrue();
  });

  it('6b. a 502/504 during the check also becomes SERVICE_UNAVAILABLE', async () => {
    let p = service.loadCurrentUser();
    http.expectOne(base).flush('bad gateway', { status: 502, statusText: 'Bad Gateway' });
    await p;
    expect(service.getStatus()).toBe('SERVICE_UNAVAILABLE');

    // Fresh service state for the 504 half of this check.
    service = TestBed.inject(AuthStateService);
    p = service.loadCurrentUser();
    http.expectOne(base).flush('timeout', { status: 504, statusText: 'Gateway Timeout' });
    await p;
    expect(service.getStatus()).toBe('SERVICE_UNAVAILABLE');
  });

  it('a request that never resolves at all times out into SERVICE_UNAVAILABLE rather than hanging forever', fakeAsync(() => {
    let settled = false;
    service.loadCurrentUser().then(() => { settled = true; });
    http.expectOne(base); // request is made, but deliberately never flushed/errored

    tick(STARTUP_HTTP_TIMEOUT_MS - 1);
    expect(settled).toBeFalse(); // not yet — still within the bound

    tick(1);
    expect(settled).toBeTrue();
    expect(service.getStatus()).toBe('SERVICE_UNAVAILABLE');
  }));

  it('a transient failure never demotes an already-AUTHENTICATED session', async () => {
    let p = service.loadCurrentUser();
    http.expectOne(base).flush(userInfo);
    await p;
    expect(service.getStatus()).toBe('AUTHENTICATED');

    // A later re-check (e.g. tab-resume) hits a transient failure this time.
    p = service.loadCurrentUser();
    http.expectOne(base).error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });
    await p;

    expect(service.getStatus()).toBe('AUTHENTICATED');
    expect(service.getUser()?.userId).toBe('T1');
  });

  it('7. bootstrap (the returned promise) resolves even when the network is unavailable — never hangs', async () => {
    const p = service.loadCurrentUser();
    http.expectOne(base).error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });
    await expectAsync(p).toBeResolved();
  });

  it('status$ emits every transition, so a subscriber never needs to poll getStatus()', async () => {
    const seen: string[] = [];
    const sub = service.status$.subscribe(s => seen.push(s));

    const p = service.loadCurrentUser();
    http.expectOne(base).flush(userInfo);
    await p;

    expect(seen).toEqual(['CHECKING', 'AUTHENTICATED']);
    sub.unsubscribe();
  });
});

describe('AuthStateService — prepareForRetry()', () => {
  let service: AuthStateService;
  let http: HttpTestingController;
  const base = `${environment.apiUrl}/auth/me`;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    service = TestBed.inject(AuthStateService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('resets SERVICE_UNAVAILABLE back to CHECKING so a retry gets a fresh verdict', async () => {
    let p = service.loadCurrentUser();
    http.expectOne(base).flush('unavailable', { status: 503, statusText: 'Service Unavailable' });
    await p;
    expect(service.getStatus()).toBe('SERVICE_UNAVAILABLE');

    service.prepareForRetry();
    expect(service.getStatus()).toBe('CHECKING');

    p = service.loadCurrentUser();
    http.expectOne(base).flush('unavailable', { status: 503, statusText: 'Service Unavailable' });
    await p;
    expect(service.getStatus()).toBe('SERVICE_UNAVAILABLE'); // retry can fail again, cleanly
  });

  it('resets OFFLINE back to CHECKING the same way', async () => {
    spyOnProperty(navigator, 'onLine').and.returnValue(false);
    const p = service.loadCurrentUser();
    http.expectOne(base).error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });
    await p;
    expect(service.getStatus()).toBe('OFFLINE');

    service.prepareForRetry();
    expect(service.getStatus()).toBe('CHECKING');
  });

  it('is a no-op for AUTHENTICATED/UNAUTHENTICATED/CHECKING — retry is only ever meaningful from an outage state', () => {
    expect(service.getStatus()).toBe('CHECKING');
    service.prepareForRetry();
    expect(service.getStatus()).toBe('CHECKING');

    service.setUser({
      userId: 'T1', role: 'TEACHER', name: null, className: null, schoolSlug: null,
      featureKeys: null, planTier: null, planVersion: null, subscriptionStatus: null,
      trialEndsAt: null, expiresAt: null, graceEndsAt: null, permissionKeys: null,
    });
    service.prepareForRetry();
    expect(service.getStatus()).toBe('AUTHENTICATED'); // untouched
  });
});
