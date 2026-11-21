import { Injectable, inject } from '@angular/core';
import { AuthStateService } from '../auth/auth-state.service';
import { TenantService } from '../services/tenant.service';

/**
 * The one place both startup-critical checks (tenant branding + session) are kicked off
 * together — used by APP_INITIALIZER for the initial boot, and by the startup-recovery UI's
 * Retry button to rerun exactly the same sequence. Neither underlying call can reject (both
 * catch everything internally and resolve into a state instead — see AuthStateService and
 * TenantService), so this never needs its own try/catch.
 */
@Injectable({ providedIn: 'root' })
export class StartupService {
  private tenantService = inject(TenantService);
  private authStateService = inject(AuthStateService);

  initialize(): Promise<void> {
    return Promise.all([
      this.tenantService.init(),
      this.authStateService.loadCurrentUser(),
    ]).then(async () => {
      const user = this.authStateService.getUser();
      if (user?.schoolSlug && !this.tenantService.slug) {
        await this.tenantService.loadSchoolBySlug(user.schoolSlug);
      }
    });
  }

  /** Re-runs startup initialization after a SERVICE_UNAVAILABLE/OFFLINE recovery attempt.
   * prepareForRetry() resets AuthStateService's status to CHECKING first so loadCurrentUser()
   * has a genuine fresh verdict to produce rather than treating this as "already resolved". */
  retry(): Promise<void> {
    this.authStateService.prepareForRetry();
    return this.initialize();
  }
}
