import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Location } from '@angular/common';
import { SpyLocation, provideLocationMocks } from '@angular/common/testing';
import { HttpClient, HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthInterceptor } from './auth.interceptor';
import { environment } from '../../environments/environment';

@Component({ standalone: true, template: '' })
class BlankPage {}

/**
 * History after automatic redirects, with the real AuthInterceptor and Router and a recorded
 * history (SpyLocation): a signed-out cold start must leave a single /home entry, so after sign-in
 * the dashboard is the first entry and Back there leaves the app (Android) instead of bouncing.
 * Shared by the web and Android clients — keep the two copies identical.
 */
describe('Auth redirects — history entries', () => {
  const base = environment.apiUrl;
  let router: Router;
  let location: SpyLocation;
  let http: HttpTestingController;
  let httpClient: HttpClient;
  const originalPath = window.location.pathname + window.location.search;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', redirectTo: '/home', pathMatch: 'full' },
          { path: 'home', component: BlankPage },
          { path: 'dashboard', component: BlankPage },
          { path: 'dashboard/student-dashboard', component: BlankPage },
          { path: 'dashboard/fees', component: BlankPage },
        ]),
        provideLocationMocks(),
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true },
      ],
    });
    router = TestBed.inject(Router);
    location = TestBed.inject(Location) as SpyLocation;
    http = TestBed.inject(HttpTestingController);
    httpClient = TestBed.inject(HttpClient);
    localStorage.removeItem('redirectUrl');
  });

  afterEach(() => {
    http.verify();
    window.history.replaceState(null, '', originalPath);
    localStorage.removeItem('redirectUrl');
  });

  /** The interceptor reads the page from window.location. */
  const onPage = (path: string) => window.history.replaceState(null, '', path);
  const pushes = () => location.urlChanges.filter(change => !change.startsWith('replace: '));

  /** /auth/me (or any request) 401, then refresh 401: the session is really over. */
  function sessionRejected(url = `${base}/auth/me`): void {
    httpClient.get(url, { withCredentials: true }).subscribe({ error: () => {} });
    http.expectOne(url).flush('unauthorized', { status: 401, statusText: 'Unauthorized' });
    http.expectOne(`${base}/auth/refresh-token`).flush('unauthorized', { status: 401, statusText: 'Unauthorized' });
  }

  it('signed-out cold start: the session-expired redirect during the start-up navigation leaves only /home', async () => {
    onPage('/');
    const startup = router.initialNavigation();
    sessionRejected();                       // arrives while the start-up navigation from '/' is under way
    await startup;
    await TestBed.inject(Router).navigated;
    await new Promise(r => setTimeout(r, 0));
    expect(location.path()).toBe('/home');
    expect(pushes()).toEqual([]);            // '/' was replaced, not kept under /home
    location.back();
    expect(location.path()).toBe('/home');   // nothing to go back to
  });

  it('sign-in, then Back on the dashboard: the dashboard is the first entry', async () => {
    onPage('/');
    router.initialNavigation();
    sessionRejected();
    await new Promise(r => setTimeout(r, 0));
    // What HomeComponent (post-login) and DashboardComponent (role home) do: automatic redirects.
    await router.navigateByUrl('/dashboard', { replaceUrl: true });
    await router.navigate(['/dashboard/student-dashboard'], { replaceUrl: true });
    expect(location.path()).toBe('/dashboard/student-dashboard');
    expect(pushes()).toEqual([]);
    location.back();
    expect(location.path()).toBe('/dashboard/student-dashboard');   // Back has nowhere to go: Android leaves the app
  });

  it('normal session expiry mid-session: the expired page is replaced (and saved), the earlier page stays', async () => {
    await router.navigateByUrl('/dashboard/student-dashboard', { replaceUrl: true });
    await router.navigateByUrl('/dashboard/fees');                    // the user opened a page: a real entry
    onPage('/dashboard/fees');
    sessionRejected(`${base}/student-fees/S1/2026-2027`);
    await new Promise(r => setTimeout(r, 0));
    expect(location.path()).toBe('/home');
    expect(JSON.parse(localStorage.getItem('redirectUrl')!).url).toBe('/dashboard/fees');
    location.back();
    expect(location.path()).toBe('/dashboard/student-dashboard');     // the user's own history is kept
  });

  it('a public page (sign-in) is never redirected away from on a failed check', async () => {
    await router.navigateByUrl('/home');
    onPage('/home');
    const before = location.urlChanges.length;
    sessionRejected();
    await new Promise(r => setTimeout(r, 0));
    expect(location.urlChanges.length).toBe(before);
    expect(location.path()).toBe('/home');
  });
});
