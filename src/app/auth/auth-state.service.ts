import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, Observable, Subject } from 'rxjs';
import { environment } from '../../environments/environment';
import { classifyAuthFailure } from './auth-failure-classifier';

/**
 * CHECKING: we do not yet know whether an existing session is valid — this is NOT logged out,
 * it is "no verdict yet" (the initial value, before the first loadCurrentUser() resolves, and
 * the value a transient/network failure on that very first check leaves behind).
 * AUTHENTICATED: a successful /auth/me (directly, or after a silent refresh) has established
 * the current user.
 * UNAUTHENTICATED: the server has definitively rejected the session (401/403) — safe to treat
 * as a real logout.
 */
export type AuthStatus = 'CHECKING' | 'AUTHENTICATED' | 'UNAUTHENTICATED';

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
  private user: UserInfo | null = null;
  private status: AuthStatus = 'CHECKING';
  private readonly verified$$ = new Subject<void>();
  /** Emits each time the server confirms the session and the user info (role, appointment) was refreshed. */
  readonly verified$: Observable<void> = this.verified$$.asObservable();
  private readonly apiUrl = `${environment.apiUrl}/auth`;

  constructor(private http: HttpClient) {}

  /**
   * Establishes (or re-verifies) the current session via /auth/me — which, through
   * AuthInterceptor, transparently attempts a silent refresh if the access token has expired.
   * This promise ALWAYS resolves (never rejects), so app bootstrap can never hang on it, even
   * with no network at all.
   *
   * Only an AUTHORITATIVE failure (see classifyAuthFailure) ever clears an existing session —
   * a TRANSIENT failure (network down, timeout, temporary 5xx) leaves whatever user/status this
   * service already had completely untouched. This is what lets a valid session survive the app
   * being backgrounded, a flaky Wi-Fi reconnect, or a brief outage: the worst a transient
   * failure can do is fail to CONFIRM the session this time, never disprove it.
   */
  async loadCurrentUser(): Promise<void> {
    try {
      const userInfo = await firstValueFrom(
        this.http.get<UserInfo>(`${this.apiUrl}/me`, { withCredentials: true })
      );
      this.user = userInfo;
      this.status = 'AUTHENTICATED';
      this.verified$$.next();
    } catch (err) {
      if (classifyAuthFailure(err) === 'AUTHORITATIVE') {
        console.warn('[AuthStateService] Session rejected by server — treating as logged out:', err);
        this.user = null;
        this.status = 'UNAUTHENTICATED';
      } else {
        // Transient — we still don't know either way. Deliberately do NOT touch this.user or
        // this.status: if we were already AUTHENTICATED, we stay AUTHENTICATED; if this is the
        // very first check (still CHECKING) it simply remains CHECKING for a later retry.
        console.warn('[AuthStateService] Could not verify session (network/transient) — keeping existing state:', err);
      }
    }
  }

  setUser(userInfo: UserInfo): void {
    this.user = userInfo;
    this.status = 'AUTHENTICATED';
    this.verified$$.next();
  }

  getUser(): UserInfo | null {
    return this.user;
  }

  getStatus(): AuthStatus {
    return this.status;
  }

  isChecking(): boolean {
    return this.status === 'CHECKING';
  }

  isAuthenticated(): boolean {
    return this.status === 'AUTHENTICATED';
  }

  isUnauthenticated(): boolean {
    return this.status === 'UNAUTHENTICATED';
  }

  /** A definitive logout — the session is confirmed gone (server-rejected refresh, explicit
   *  logout, or a tenant/session mismatch). Never call this for a merely transient failure. */
  clearUser(): void {
    this.user = null;
    this.status = 'UNAUTHENTICATED';
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
   * Paid features are denied unless the effective entitlement explicitly grants them.
   * Core features are included in the effective feature list by the backend.
   */
  hasFeature(featureKey: string): boolean {
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
