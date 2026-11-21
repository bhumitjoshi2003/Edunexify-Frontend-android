import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { StartupService } from './startup.service';
import { AuthStateService } from '../auth/auth-state.service';
import { TenantService } from '../services/tenant.service';
import { environment } from '../../environments/environment';

describe('StartupService', () => {
  let service: StartupService;
  let authState: AuthStateService;
  let http: HttpTestingController;
  const authUrl = `${environment.apiUrl}/auth/me`;

  const userInfo = {
    userId: 'T1', role: 'TEACHER', name: null, className: null, schoolSlug: null,
    featureKeys: null, planTier: null, planVersion: null, subscriptionStatus: null,
    trialEndsAt: null, expiresAt: null, graceEndsAt: null, permissionKeys: null,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    service = TestBed.inject(StartupService);
    authState = TestBed.inject(AuthStateService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('initialize() runs the session check and resolves once it settles', async () => {
    const p = service.initialize();
    http.expectOne(authUrl).flush(userInfo);
    await p;

    expect(authState.isAuthenticated()).toBeTrue();
  });

  it('initialize() never rejects, even on a hard session-check failure', async () => {
    const p = service.initialize();
    http.expectOne(authUrl).flush('unavailable', { status: 503, statusText: 'Service Unavailable' });
    await expectAsync(p).toBeResolved();
  });

  it('retry() resets a SERVICE_UNAVAILABLE verdict before re-running the check', async () => {
    let p = service.initialize();
    http.expectOne(authUrl).flush('unavailable', { status: 503, statusText: 'Service Unavailable' });
    await p;
    expect(authState.getStatus()).toBe('SERVICE_UNAVAILABLE');

    p = service.retry();
    http.expectOne(authUrl).flush(userInfo);
    await p;

    expect(authState.isAuthenticated()).toBeTrue();
  });

  it('retry() can also land on UNAUTHENTICATED if the backend is back but the session is genuinely gone', async () => {
    let p = service.initialize();
    http.expectOne(authUrl).flush('unavailable', { status: 503, statusText: 'Service Unavailable' });
    await p;

    p = service.retry();
    http.expectOne(authUrl).flush('nope', { status: 401, statusText: 'Unauthorized' });
    await p;

    expect(authState.isUnauthenticated()).toBeTrue();
  });
});
