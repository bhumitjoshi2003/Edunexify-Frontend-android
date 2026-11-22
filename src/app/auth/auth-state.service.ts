import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, firstValueFrom, Observable, Subject } from 'rxjs';
import { timeout } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { classifyAuthFailure } from './auth-failure-classifier';
import { ObservabilityService } from '../core/observability.service';
import { STARTUP_HTTP_TIMEOUT_MS } from '../core/startup.constants';
import { FeatureKey, isCoreFeature } from './feature-keys';

/**
 * CHECKING: we do not yet know whether an existing session is valid — this is NOT logged out,
 * it is "no verdict yet" (the initial value, before the first loadCurrentUser() resolves).
 * AUTHENTICATED: a successful /auth/me (directly, or after a silent refresh) has established
 * the current user.
 * UNAUTHENTICATED: the server has definitively rejected the session (401/403) — safe to treat
 * as a real logout.
 * SERVICE_UNAVAILABLE: the very first session check could not be confirmed either way because
 * the backend timed out, errored (5xx), or was otherwise unreachable — NOT a logout. Only ever
 * entered from CHECKING; an already-AUTHENTICATED/UNAUTHENTICATED session is never demoted into
 * this state by a later transient failure (see loadCurrentUser()).
 * OFFLINE: the same as SERVICE_UNAVAILABLE, except the failure coincided with the browser
 * itself reporting no network connectivity (navigator.onLine === false) — a distinct, calmer
 * experience for "you're disconnected" vs. "we're having trouble".
 */
export type AuthStatus = 'CHECKING' | 'AUTHENTICATED' | 'UNAUTHENTICATED' | 'SERVICE_UNAVAILABLE' | 'OFFLINE';

export interface UserInfo {
  userId: string;
  role: string;
  name: string | null;
  className: string | null;
  schoolSlug: string | null;
  // Entitlement fields — null for SUPER_ADMIN or schools with no subscription
  featureKeys: string[] | null;
  planTier: string | null;
  planVersion: string | null;
  subscriptionStatus: string | null;
  trialEndsAt: string | null;
  expiresAt: string | null;
  graceEndsAt: string | null;
  permissionKeys: string[] | null;
  // True when the user must complete /change-initial-password before using any
  // other route — set on newly-created STUDENT/TEACHER accounts and on admin
  // password resets. Absent/false for every existing normal session.
  mustChangePassword?: boolean;
  /** A TEACHER account holding an active Academic Coordinator appointment (one account, one login). */
  coordinator?: boolean;
  /** The role shown after login: COORDINATOR for a coordinating teacher, otherwise `role`. */
  primaryRole?: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class AuthStateService {
  private readonly parentChildStorageKey = 'edunexify.parent.selected-child';
  private user: UserInfo | null = null;
  /** How many times the server has confirmed a session (/auth/me, login or a refresh). */
  private verifications = 0;
  private readonly status$$ = new BehaviorSubject<AuthStatus>('CHECKING');
  /** Reactive status stream — for anything that needs to re-render when a background
   * (re)check resolves, e.g. the root app shell's startup-recovery gate. Prefer the
   * synchronous getStatus()/isChecking()/etc. below for one-off, imperative reads (guards,
   * interceptor) exactly as before; nothing about those changed. */
  readonly status$: Observable<AuthStatus> = this.status$$.asObservable();
  private readonly verified$$ = new Subject<void>();
  /** Emits each time the server confirms the session and the user info (role, appointment) was refreshed. */
  readonly verified$: Observable<void> = this.verified$$.asObservable();
  private readonly apiUrl = `${environment.apiUrl}/auth`;

  constructor(private http: HttpClient, private observability: ObservabilityService) {}

  /**
   * Establishes (or re-verifies) the current session via /auth/me — which, through
   * AuthInterceptor, transparently attempts a silent refresh if the access token has expired.
   * This promise ALWAYS resolves (never rejects), so app bootstrap can never hang on it — the
   * bounded HTTP timeout below is exactly what turns "the backend never responds at all" (the
   * root cause of the original white-screen incident) into a definite, classifiable outcome
   * instead of a Promise that never settles.
   *
   * Only an AUTHORITATIVE failure (see classifyAuthFailure) ever clears an existing session —
   * a TRANSIENT failure (network down, timeout, temporary 5xx) leaves an already-resolved
   * user/status completely untouched. This is what lets a valid session survive laptop sleep, a
   * flaky Wi-Fi reconnect, or a brief outage: the worst a transient failure can do is fail to
   * CONFIRM the session this time, never disprove it. The ONE exception is the very first check
   * (status still CHECKING): a transient failure there has no prior verdict to preserve, so it
   * resolves into a user-visible SERVICE_UNAVAILABLE/OFFLINE state instead of hanging forever —
   * see the startup-recovery UI driven by status$.
   */
  async loadCurrentUser(): Promise<void> {
    try {
      const userInfo = await firstValueFrom(
        this.http.get<UserInfo>(`${this.apiUrl}/me`, { withCredentials: true })
          .pipe(timeout(STARTUP_HTTP_TIMEOUT_MS))
      );
      this.user = userInfo;
      this.verifications++;
      this.status$$.next('AUTHENTICATED');
      this.verified$$.next();
      if (userInfo.role !== 'PARENT') this.clearParentChildSelection();
    } catch (err) {
      if (classifyAuthFailure(err) === 'AUTHORITATIVE') {
        console.warn('[AuthStateService] Session rejected by server — treating as logged out:', err);
        this.user = null;
        this.status$$.next('UNAUTHENTICATED');
        this.clearParentChildSelection();
      } else if (this.status$$.value === 'CHECKING') {
        // No prior verdict exists to preserve — surface a visible, recoverable state instead of
        // leaving bootstrap (and any guard waiting on isChecking()) hanging indefinitely.
        const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
        this.status$$.next(offline ? 'OFFLINE' : 'SERVICE_UNAVAILABLE');
        console.warn('[AuthStateService] Could not verify session on startup (network/transient):', err);
        if (!offline) {
          this.observability.reportUnexpected(err, { operation: 'startup.auth-check' });
        }
      } else {
        // Already resolved (AUTHENTICATED/UNAUTHENTICATED/SERVICE_UNAVAILABLE/OFFLINE) — a later
        // background re-check hitting a transient failure must never disturb it.
        console.warn('[AuthStateService] Could not verify session (network/transient) — keeping existing state:', err);
      }
    }
  }

  /** Used only by the user-initiated Retry flow to give a fresh loadCurrentUser() call a real
   * verdict to produce — never called automatically/silently. */
  prepareForRetry(): void {
    const current = this.status$$.value;
    if (current === 'SERVICE_UNAVAILABLE' || current === 'OFFLINE') {
      this.status$$.next('CHECKING');
    }
  }

  setUser(userInfo: UserInfo): void {
    if (this.user?.userId !== userInfo.userId || userInfo.role !== 'PARENT') this.clearParentChildSelection();
    this.user = userInfo;
    this.verifications++;
    this.status$$.next('AUTHENTICATED');
    this.verified$$.next();
  }

  /** Lets a background re-check tell "confirmed just now" from "kept after a transient failure". */
  verificationCount(): number {
    return this.verifications;
  }

  getUser(): UserInfo | null {
    return this.user;
  }

  getStatus(): AuthStatus {
    return this.status$$.value;
  }

  isChecking(): boolean {
    return this.status$$.value === 'CHECKING';
  }

  isAuthenticated(): boolean {
    return this.status$$.value === 'AUTHENTICATED';
  }

  isUnauthenticated(): boolean {
    return this.status$$.value === 'UNAUTHENTICATED';
  }

  isServiceUnavailable(): boolean {
    return this.status$$.value === 'SERVICE_UNAVAILABLE';
  }

  isOffline(): boolean {
    return this.status$$.value === 'OFFLINE';
  }

  /** A definitive logout — the session is confirmed gone (server-rejected refresh, explicit
   *  logout, or a tenant/session mismatch). Never call this for a merely transient failure. */
  clearUser(): void {
    this.user = null;
    this.status$$.next('UNAUTHENTICATED');
    this.clearParentChildSelection();
  }

  private clearParentChildSelection(): void {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(this.parentChildStorageKey);
  }

  getUserRole(): string {
    return this.user?.role ?? '';
  }

  /**
   * UX-only: the signed-in teacher holds an active Coordinator appointment. `role` stays TEACHER so
   * every teaching screen is unchanged; the server re-checks the appointment and scope on each call.
   */
  isCoordinator(): boolean {
    return this.user?.role === 'TEACHER' && this.user?.coordinator === true;
  }

  /** The role to display: COORDINATOR for a coordinating teacher, otherwise the account role. */
  getPrimaryRole(): string {
    return this.isCoordinator() ? 'COORDINATOR' : this.getUserRole();
  }

  getUserId(): string {
    return this.user?.userId ?? '';
  }

  isLoggedIn(): boolean {
    return this.user !== null;
  }

  mustChangePassword(): boolean {
    return this.user?.mustChangePassword === true;
  }

  /**
   * UX-only feature check — backend is always authoritative.
   * Core features are part of every plan and always true; plan features are denied unless the
   * effective entitlement explicitly grants them.
   */
  hasFeature(featureKey: FeatureKey): boolean {
    if (isCoreFeature(featureKey)) return true;
    const keys = this.user?.featureKeys;
    return keys?.includes(featureKey) ?? false;
  }

  /** Keeps navigation/guards in sync immediately after an ADMIN changes a school override. */
  setFeatureEnabled(featureKey: string, enabled: boolean): void {
    if (!this.user) return;
    const keys = new Set(this.user.featureKeys ?? []);
    enabled ? keys.add(featureKey) : keys.delete(featureKey);
    this.user = { ...this.user, featureKeys: [...keys] };
  }

  /**
   * UX-only permission check — backend is always authoritative.
   * Returns false if no permission data is loaded (deny by default).
   */
  hasPermission(permissionKey: string): boolean {
    const keys = this.user?.permissionKeys;
    if (!keys || keys.length === 0) return false;
    return keys.includes(permissionKey);
  }

  getSubscriptionStatus(): string | null {
    return this.user?.subscriptionStatus ?? null;
  }

  /**
   * True if the subscription is GRACE, EXPIRED, or TRIAL ending within 7 days.
   * Used to show expiry warning banners in the dashboard nav.
   */
  isSubscriptionWarning(): boolean {
    const s = this.getSubscriptionStatus();
    if (s === 'GRACE' || s === 'EXPIRED') return true;
    if (s === 'TRIAL' && this.user?.trialEndsAt) {
      const msUntilExpiry = new Date(this.user.trialEndsAt).getTime() - Date.now();
      return msUntilExpiry <= 7 * 24 * 60 * 60 * 1000; // 7 days
    }
    return false;
  }
}
