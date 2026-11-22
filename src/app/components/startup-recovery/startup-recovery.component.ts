import { Component, Input, OnDestroy, OnInit, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { StartupService } from '../../core/startup.service';
import { AuthStateService } from '../../auth/auth-state.service';
import { consumeIntendedRoute } from '../../auth/redirect-url.util';
import { STARTUP_SLOW_NOTICE_MS } from '../../core/startup.constants';

export type StartupRecoveryVariant = 'unavailable' | 'offline' | 'loading';

/**
 * The full-screen experience shown by AppComponent instead of <router-outlet> whenever
 * AuthStateService's status is CHECKING, SERVICE_UNAVAILABLE, or OFFLINE — see that component's
 * template. One component with three variants (rather than three near-duplicate components)
 * since they share the same visual shell and only differ in icon/copy/behavior.
 *
 * Deliberately never mentions infrastructure specifics (no "Neon"/"database"/"502") — the
 * frontend only ever reasons about these three user-facing outcomes.
 */
@Component({
  selector: 'app-startup-recovery',
  standalone: true,
  templateUrl: './startup-recovery.component.html',
  styleUrl: './startup-recovery.component.scss',
})
export class StartupRecoveryComponent implements OnInit, OnDestroy {
  @Input() variant: StartupRecoveryVariant = 'unavailable';

  private startupService = inject(StartupService);
  private authState = inject(AuthStateService);
  private router = inject(Router);
  private platformId = inject(PLATFORM_ID);

  retrying = false;
  showSlowNotice = false;

  private slowNoticeTimer?: ReturnType<typeof setTimeout>;
  private onlineListener?: () => void;
  private autoRetriedOnReconnect = false;

  ngOnInit(): void {
    if (this.variant === 'loading') {
      this.slowNoticeTimer = setTimeout(() => { this.showSlowNotice = true; }, STARTUP_SLOW_NOTICE_MS);
    }
    if (this.variant === 'offline' && isPlatformBrowser(this.platformId)) {
      this.onlineListener = () => {
        // Connectivity coming back is a strong, well-justified reason for exactly one quiet
        // automatic retry (never a poll) — see the task's own guidance on bounded auto-retry.
        if (!this.autoRetriedOnReconnect && !this.retrying) {
          this.autoRetriedOnReconnect = true;
          this.retry();
        }
      };
      window.addEventListener('online', this.onlineListener);
    }
  }

  ngOnDestroy(): void {
    if (this.slowNoticeTimer) clearTimeout(this.slowNoticeTimer);
    if (this.onlineListener && isPlatformBrowser(this.platformId)) {
      window.removeEventListener('online', this.onlineListener);
    }
  }

  get heading(): string {
    switch (this.variant) {
      case 'offline': return 'You appear to be offline';
      case 'loading': return this.showSlowNotice ? 'This is taking a little longer than usual…' : 'Getting Edunexify ready…';
      default: return 'We’re having trouble connecting';
    }
  }

  get body(): string {
    switch (this.variant) {
      case 'offline': return 'Check your internet connection and try again.';
      case 'loading': return 'Just a moment while we get things set up.';
      default: return 'Edunexify is temporarily unable to connect. Please try again in a moment.';
    }
  }

  get showSessionNote(): boolean {
    // Technically accurate only for unavailable/offline (an existing session's tokens are
    // untouched by a transient failure — see AuthStateService.loadCurrentUser()); meaningless
    // during the initial loading variant, where nothing has failed yet.
    return this.variant !== 'loading';
  }

  async retry(): Promise<void> {
    if (this.retrying) return;
    this.retrying = true;
    try {
      await this.startupService.retry();
    } finally {
      this.retrying = false;
    }
    if (this.authState.isAuthenticated()) {
      this.router.navigateByUrl(consumeIntendedRoute());
    }
    // UNAUTHENTICATED: nothing to do — AppComponent's switch already falls through to
    // <router-outlet>, which is already sitting on /home (the guard's own redirect target).
    // Still SERVICE_UNAVAILABLE/OFFLINE: this component simply re-renders itself with the
    // Retry button available again.
  }
}
