import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStateService } from './auth-state.service';

/**
 * An Academic Coordinator has one dashboard. A coordinating teacher who opens the ordinary Teacher
 * dashboard (an old bookmark, a notification link) lands on the Coordinator dashboard instead; every
 * other teacher is unaffected. Shared by the web and Android clients — keep the two copies identical.
 */
export const coordinatorHomeGuard: CanActivateFn = () => {
  const auth = inject(AuthStateService);
  const router = inject(Router);
  return auth.isCoordinator() ? router.createUrlTree(['/dashboard/coordinator-dashboard']) : true;
};
