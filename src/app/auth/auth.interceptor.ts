import { Injectable } from '@angular/core';
import {
  HttpInterceptor,
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpErrorResponse,
  HttpResponse,
} from '@angular/common/http';

import { Injector } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { AuthStateService } from './auth-state.service';
import { TenantService } from '../services/tenant.service';
import { ToastService } from '../services/toast.service';
import { environment } from '../../environments/environment';
import { classifyAuthFailure } from './auth-failure-classifier';
import { saveIntendedRoute } from './redirect-url.util';
import { ObservabilityService } from '../core/observability.service';
import { newRequestId, REQUEST_ID_HEADER, validRequestId } from '../core/request-id';
import { ANDROID_PLATFORM, CLIENT_PLATFORM_HEADER, nativeSession, REFRESH_TIMEOUT_MS } from '../core/native-session';

import { BehaviorSubject, Observable, throwError } from 'rxjs';
import { catchError, filter, switchMap, take, tap, timeout } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class AuthInterceptor implements HttpInterceptor {

  /** Guard-free top-level routes in app.routes.ts (home, reset-password, verify-rc) — the
   *  only routes usable with zero session. An anonymous visitor's failed silent-refresh here
   *  is expected (there is no session to refresh) and must never hijack navigation away from
   *  the page they're legitimately allowed to be on. Update this list if app.routes.ts's
   *  guard-free routes change. */
  private static readonly PUBLIC_ROUTES = ['/home', '/reset-password', '/verify-rc'];

  private isPublicRoute(): boolean {
    if (typeof window === 'undefined') return false;
    const path = window.location.pathname;
    return AuthInterceptor.PUBLIC_ROUTES.some(publicPath => path === publicPath || path.startsWith(publicPath + '/'));
  }

  /**
   * Public API operations a visitor with no session performs. They never need an access token, so a
   * 401/403 from them must not start the refresh-token flow, sign anyone out or navigate away —
   * the caller just gets the error and shows it. Matched by method AND exact path, so the
   * authenticated operations on the same resources (e.g. the admin demo-request list) keep the
   * normal auth handling.
   */
  private static readonly PUBLIC_API_OPERATIONS: ReadonlyArray<{ method: string; path: string }> = [
    { method: 'POST', path: '/demo-requests' },
  ];

  private isPublicOperation(request: HttpRequest<any>): boolean {
    const url = request.url.split('?')[0].replace(/\/+$/, '');
    return AuthInterceptor.PUBLIC_API_OPERATIONS.some(op =>
      request.method === op.method && url === `${environment.apiUrl}${op.path}`);
  }

  private isRefreshing = false;
  /**
   * While isRefreshing=true, queued requests wait on this Subject.
   * Emits true once refresh completes, false if it fails.
   */
  private refreshDone$ = new BehaviorSubject<boolean>(false);

  constructor(
    private router: Router,
    private authService: AuthService,
    private authStateService: AuthStateService,
    private tenantService: TenantService,
    private injector: Injector
  ) { }

  intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {

    const isAuthUrl =
      request.url.includes('/auth/login') ||
      request.url.includes('/auth/logout') ||
      request.url.includes('/auth/refresh-token') ||
      request.url.includes('/auth/request-password-reset') ||
      request.url.includes('/auth/reset-password') ||
      request.url.includes('/auth/change-initial-password');

    // Only attach credentials to our own API — not to third-party URLs (e.g. Razorpay CDN)
    const isOwnApi = request.url.startsWith(environment.apiUrl);
    const requestId = validRequestId(request.headers.get(REQUEST_ID_HEADER)) ?? newRequestId();

    // Attach credentials + X-School-Slug header so the backend TenantValidationFilter
    // can validate that the stored school slug matches the JWT's schoolId.
    // The Android app talks to the absolute API URL so the Host header never carries
    // a subdomain — the backend reads X-School-Slug instead.
    const isPublicOperation = isOwnApi && this.isPublicOperation(request);
    let clonedReq: HttpRequest<any>;
    if (isOwnApi) {
      const slug = this.tenantService.slug;
      clonedReq = request.clone({
        withCredentials: !isPublicOperation,
        setHeaders: {
          ...(slug ? { 'X-School-Slug': slug } : {}),
          // Lets the backend give the Android app its longer session lifetime (lifetime only).
          ...(nativeSession.isAndroidShell() ? { [CLIENT_PLATFORM_HEADER]: ANDROID_PLATFORM } : {}),
          [REQUEST_ID_HEADER]: requestId,
        },
      });
    } else {
      clonedReq = request;
    }

    return next.handle(clonedReq).pipe(
      // A login or refresh just issued new session cookies: persist them to disk right away so an
      // app kill cannot leave the WebView holding a refresh token the server has already retired.
      tap(event => {
        if (event instanceof HttpResponse && (clonedReq.url.includes('/auth/login') || clonedReq.url.includes('/auth/refresh-token'))) {
          void nativeSession.flushCookies();
        }
      }),
      catchError((error: HttpErrorResponse) => {
        if (isOwnApi) this.injector.get(ObservabilityService).reportHttpFailure(error, request.method, requestId);
        // Public operation: no session to refresh or end — surface the error to the caller only.
        if (isPublicOperation) return throwError(() => error);
        // 401 = missing/expired/invalid token → attempt refresh (once)
        // 403 = valid token but wrong role, OR resource limit exceeded
        if (error.status === 401 && !isAuthUrl) {
          return this.handleTokenExpiry(clonedReq, next);
        }
        if (error.status === 402) {
          const toast = this.injector.get(ToastService);
          const body = error.error;
          const msg = typeof body === 'string' ? body : body?.message;
          const role = this.authStateService.getUserRole();
          if (role === 'ADMIN' || role === 'SUB_ADMIN') {
            toast.error('Subscription Expired', msg || 'Your subscription has expired. Please renew to continue.');
            this.router.navigate(['/dashboard/school-settings'], { queryParams: { tab: 'subscription' } });
          } else {
            toast.error('Read-Only Mode', 'Your school\'s subscription has expired. You can view data but cannot make changes. Please contact your school administrator.');
          }
          return throwError(() => error);
        }
        if (error.status === 403) {
          const body = error.error;
          const toast = this.injector.get(ToastService);
          const msg = typeof body === 'string' ? body : body?.message;
          if (msg === 'Unknown school' || msg === 'Forbidden') {
            // Tenant validation failed — stale cookie from a different school session.
            // Call logout to clear the HttpOnly cookies via Set-Cookie: Max-Age=0 response,
            // then redirect to login so the user can start a fresh session.
            this.authStateService.clearUser();
            this.authService.logout().subscribe({
              complete: () => this.router.navigate(['/home']),
              error: () => this.router.navigate(['/home']),
            });
            toast.error('Session Expired', 'Your session is no longer valid. Please log in again.');
          } else if (body?.passwordChangeRequired === true) {
            // Restricted first-login session hit a non-allowlisted endpoint (e.g. stale
            // app state, or a direct API call). The backend is the real gate here —
            // this just gets the UI back in sync with it.
            this.router.navigate(['/change-initial-password']);
          } else if (body?.code === 'RESOURCE_LIMIT_EXCEEDED') {
            toast.error('Limit Reached', body.message || 'You have reached your plan limit for this resource.');
          } else if (body?.code === 'FEATURE_NOT_AVAILABLE') {
            toast.warning('Feature Not Available', body.message || 'This feature is not available on your current plan. Upgrade to access it.');
          }
        }
        return throwError(() => error);
      })
    );
  }

  private handleTokenExpiry(
    request: HttpRequest<any>,
    next: HttpHandler
  ): Observable<HttpEvent<any>> {

    if (!this.isRefreshing) {
      // First failing request kicks off the refresh
      this.isRefreshing = true;
      this.refreshDone$.next(false);

      let settled = false;

      return this.authService.refreshToken().pipe(
        // Bounded: a refresh that started just before the network dropped or the app was frozen can
        // stay pending forever. Timing out fails it as TRANSIENT (no logout) and — via the catchError
        // below — releases every request queued behind it instead of leaving them waiting.
        timeout(REFRESH_TIMEOUT_MS),
        tap((userInfo) => {
          this.authStateService.setUser(userInfo);
        }),
        switchMap(() => {
          settled = true;
          this.isRefreshing = false;
          this.refreshDone$.next(true);
          return next.handle(request);
        }),
        catchError((refreshError) => {
          // Already settled: the refresh succeeded and this is the RETRIED request's own error —
          // that request's failure, never a logout.
          if (settled) return throwError(() => refreshError);
          settled = true;
          // Either way there is nothing left to retry queued requests with — release them
          // with an error (never let them hang) via error(), which bypasses
          // filter(done => done === true) and propagates immediately to each waiter.
          this.isRefreshing = false;
          this.refreshDone$.error(refreshError);
          this.refreshDone$ = new BehaviorSubject<boolean>(false);

          if (classifyAuthFailure(refreshError) === 'AUTHORITATIVE') {
            // The server actually looked at the refresh token and rejected it (401/403) —
            // this session is really over.
            this.authStateService.clearUser();
            // Only hijack navigation away from a protected route — an anonymous visitor
            // legitimately on a public route (e.g. reset-password) has no session to lose.
            if (!this.isPublicRoute()) {
              saveIntendedRoute(typeof window !== 'undefined' ? window.location.pathname + window.location.search : null);
              this.router.navigate(['/home']);
            }
          }
          // TRANSIENT (network down, timeout, 502/503/504, etc.): the server was never
          // meaningfully consulted. Do NOT clear auth and do NOT navigate — a transport
          // failure is not proof the credentials are invalid. The caller's own request fails
          // this one time; a later request, tab-resume, or `online` event can retry.
          return throwError(() => refreshError);
        })
      );
    } else {
      // Other requests that fail while refresh is in progress wait here.
      // Only emit when refresh truly succeeded (done === true) to avoid
      // the race condition where isRefreshing becomes false on failure
      // before the subject emits, causing premature retry with done=false.
      return this.refreshDone$.pipe(
        filter(done => done === true),
        take(1),
        switchMap(() => next.handle(request))
      );
    }
  }
}
