import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, Subject } from 'rxjs';
import { AuthStateService } from '../auth/auth-state.service';
import { saveIntendedRoute } from '../auth/redirect-url.util';

/** Hidden for less than this, the session and the page's data are assumed still current. */
export const RESUME_REVALIDATE_AFTER_MS = 2 * 60_000;

/** Routes that need a session — after a confirmed logout these send the user to login. */
const PROTECTED_PREFIXES = ['/dashboard', '/change-initial-password'];

/**
 * Brings a tab that was backgrounded for a while back to a known state, from the root of the
 * app so it works on every route:
 * - becomes visible after at least RESUME_REVALIDATE_AFTER_MS hidden, is restored from the
 *   back/forward cache (`pageshow` persisted), or the browser comes back online →
 *   re-verifies the session once (concurrent triggers share one check);
 * - native apps report their own lifecycle through {@link backgrounded}/{@link foregrounded}
 *   (Android: Capacitor app-state events). They share the hidden-time bookkeeping with the
 *   browser visibility events, so a WebView that fires both counts as one resume;
 * - still signed in (the interceptor silently refreshes an expired access token) → emits
 *   {@link resumed$} so the app shell reloads its own data. Open pages are deliberately not
 *   rebuilt: that would throw away anything typed into a form before the tab was hidden;
 * - the server confirms the session is gone → login page, remembering where the user was;
 * - network/server unavailable → the current page stays as it is (transient failures never
 *   log out) and the next resume or reconnect tries again.
 */
/* Shared by the web and Android clients — keep the two copies identical. */
@Injectable({ providedIn: 'root' })
export class AppResumeService implements OnDestroy {
  private readonly resumed = new Subject<void>();
  /** Fires after a resume re-check confirmed the session is still valid. */
  readonly resumed$: Observable<void> = this.resumed.asObservable();

  private hiddenAt: number | null = null;
  private inFlight: Promise<void> | null = null;
  private started = false;

  constructor(private authState: AuthStateService, private router: Router, private zone: NgZone) {}

  private readonly onVisibility = () => this.onVisibilityChange();
  private readonly onPageShow = (event: PageTransitionEvent) => {
    if (event.persisted) this.run(() => this.revalidate());
  };
  private readonly onOnline = () => this.run(() => this.revalidate());

  start(): void {
    if (this.started || typeof document === 'undefined' || typeof window === 'undefined') return;
    this.started = true;
    if (document.visibilityState === 'hidden') this.hiddenAt = this.now();
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pageshow', this.onPageShow);
    window.addEventListener('online', this.onOnline);
  }

  ngOnDestroy(): void {
    if (!this.started) return;
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pageshow', this.onPageShow);
    window.removeEventListener('online', this.onOnline);
    this.started = false;
  }

  /** Re-checks the session; concurrent calls share the one check in progress. Always settles. */
  revalidate(): Promise<void> {
    if (!this.inFlight) {
      this.inFlight = this.check().finally(() => { this.inFlight = null; });
    }
    return this.inFlight;
  }

  private onVisibilityChange(): void {
    if (document.visibilityState === 'hidden') this.backgrounded();
    else this.foregrounded();
  }

  /** The app/tab went to the background (browser visibility or a native app-state event). */
  backgrounded(): void {
    if (this.hiddenAt === null) this.hiddenAt = this.now();
  }

  /** The app/tab is back. Re-checks the session after a long enough absence; a second report of
   *  the same return (e.g. native event + visibility event) finds nothing pending and is ignored. */
  foregrounded(): void {
    if (this.hiddenAt === null) return;
    const hiddenFor = this.now() - this.hiddenAt;
    this.hiddenAt = null;
    if (hiddenFor >= RESUME_REVALIDATE_AFTER_MS) this.run(() => this.revalidate());
  }

  private async check(): Promise<void> {
    // CHECKING / OFFLINE / SERVICE_UNAVAILABLE belong to the startup flow, whose recovery
    // screen has its own Retry and reconnect handling; only an established session is re-checked.
    if (this.authState.isAuthenticated()) {
      const before = this.authState.verificationCount();
      await this.authState.loadCurrentUser();           // bounded; never rejects
      if (this.authState.isAuthenticated()) {
        // Only a real confirmation reloads data; after a transient failure (offline, server
        // down) the session and the page are simply kept until the next resume/reconnect.
        if (this.authState.verificationCount() > before) this.resumed.next();
        return;
      }
    }
    if (this.authState.isUnauthenticated() && this.onProtectedRoute()) {
      saveIntendedRoute(window.location.pathname + window.location.search);
      await this.router.navigateByUrl('/home').catch(() => false);
    }
  }

  private onProtectedRoute(): boolean {
    const path = window.location.pathname;
    return PROTECTED_PREFIXES.some(prefix => path === prefix || path.startsWith(prefix + '/'));
  }

  /** DOM listeners are registered once at startup; run their work inside Angular's zone. */
  private run(task: () => Promise<void>): void {
    this.zone.run(() => { task().catch(() => {}); });
  }

  /** Separate so tests can control time. */
  protected now(): number {
    return Date.now();
  }
}
