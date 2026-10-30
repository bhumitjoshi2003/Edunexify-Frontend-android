import { TestBed } from '@angular/core/testing';
import { HttpClient, HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { AuthInterceptor } from './auth.interceptor';
import { AuthStateService } from './auth-state.service';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';

/**
 * The public "Book a Demo" submission needs no session: a 401/403 from it must not start the
 * refresh-token flow, clear auth state, log anyone out or navigate. Everything else — including the
 * admin operations on the same /demo-requests resource — keeps the normal handling.
 */
describe('AuthInterceptor — public operations', () => {
  let http: HttpTestingController;
  let client: HttpClient;
  let router: Router;
  let authState: AuthStateService;
  let authService: AuthService;
  const base = environment.apiUrl;
  const demoUrl = `${base}/demo-requests`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    client = TestBed.inject(HttpClient);
    router = TestBed.inject(Router);
    authState = TestBed.inject(AuthStateService);
    authService = TestBed.inject(AuthService);
    spyOn(router, 'navigate').and.resolveTo(true);
    spyOn(authState, 'clearUser').and.callThrough();
    spyOn(authService, 'logout').and.callThrough();
  });

  afterEach(() => http.verify());

  const post = () => client.post(demoUrl, { schoolName: 'S' }, { responseType: 'text' });

  it('sends the demo submission without credentials', () => {
    post().subscribe();
    const req = http.expectOne(demoUrl);
    expect(req.request.withCredentials).toBeFalse();
    req.flush('ok', { status: 201, statusText: 'Created' });
  });

  for (const status of [401, 403]) {
    it(`a ${status} on the demo submission does not trigger refresh, logout or navigation`, () => {
      let error: any;
      post().subscribe({ error: e => error = e });
      http.expectOne(demoUrl).flush(
        JSON.stringify({ message: status === 403 ? 'Forbidden' : 'Token Expired' }),
        { status, statusText: 'x' });
      http.expectNone(`${base}/auth/refresh-token`);
      expect(error.status).toBe(status);
      expect(authState.clearUser).not.toHaveBeenCalled();
      expect(authService.logout).not.toHaveBeenCalled();
      expect(router.navigate).not.toHaveBeenCalled();
    });
  }

  it('also ignores a query string / trailing slash on the same public path', () => {
    client.post(`${demoUrl}/?ref=home`, {}, { responseType: 'text' }).subscribe({ error: () => {} });
    http.expectOne(`${demoUrl}/?ref=home`).flush('x', { status: 401, statusText: 'Unauthorized' });
    http.expectNone(`${base}/auth/refresh-token`);
  });

  it('keeps refresh handling for the admin list on the same resource', () => {
    client.get(demoUrl).subscribe({ error: () => {} });
    http.expectOne(demoUrl).flush('x', { status: 401, statusText: 'Unauthorized' });
    http.expectOne(`${base}/auth/refresh-token`).flush('x', { status: 401, statusText: 'Unauthorized' });
  });

  it('keeps refresh handling for the admin status update', () => {
    client.patch(`${demoUrl}/7/status`, { status: 'CONTACTED' }).subscribe({ error: () => {} });
    http.expectOne(`${demoUrl}/7/status`).flush('x', { status: 401, statusText: 'Unauthorized' });
    http.expectOne(`${base}/auth/refresh-token`).flush('x', { status: 401, statusText: 'Unauthorized' });
  });

  it('keeps refresh handling for ordinary authenticated endpoints', () => {
    client.post(`${base}/students`, {}).subscribe({ error: () => {} });
    http.expectOne(`${base}/students`).flush('x', { status: 401, statusText: 'Unauthorized' });
    http.expectOne(`${base}/auth/refresh-token`).flush('x', { status: 401, statusText: 'Unauthorized' });
  });

  it('other API calls still send credentials', () => {
    client.get(`${base}/students`).subscribe();
    const req = http.expectOne(`${base}/students`);
    expect(req.request.withCredentials).toBeTrue();
    req.flush([]);
  });
});
