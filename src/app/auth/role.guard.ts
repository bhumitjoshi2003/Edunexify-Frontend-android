import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStateService } from './auth-state.service';
import { saveIntendedRoute } from './redirect-url.util';
import { resolveCheckingState } from './auth-checking-resolution.util';

/**
 * Functional route guard that enforces role-based access control.
 *
 * Usage in routes:
 *   canActivate: [roleGuard],
 *   data: { roles: ['ADMIN', 'SUPER_ADMIN'] }
 *
 * If data.roles is absent or empty, any authenticated user is allowed through.
 * On failure, the user is redirected to /dashboard (the default landing page).
 *
 * CHECKING is handled the same way as authGuard: not a definitive logout, but also not a free
 * pass into protected content — see resolveCheckingState. Role/password checks only ever run
 * once a real AUTHENTICATED result is confirmed, so CHECKING can never bypass them.
 */
export const roleGuard: CanActivateFn = (route, state) => {
  const authState = inject(AuthStateService);
  const router = inject(Router);

  const decideForAuthenticatedUser = (): boolean => {
    if (authState.mustChangePassword()) {
      router.navigate(['/change-initial-password']);
      return false;
    }

    const allowedRoles: string[] = route.data['roles'] ?? [];

    if (!route.data?.['roles'] || route.data['roles'].length === 0) {
      console.warn(`[RoleGuard] Route "${route.routeConfig?.path}" has no role requirements — verify this is intentional.`);
    }

    if (allowedRoles.length === 0) {
      return true;
    }

    const userRole = authState.getUserRole();

    if (allowedRoles.includes(userRole)) {
      return true;
    }

    // COORDINATOR is not an account role: a teacher with an active appointment may open these routes.
    if (allowedRoles.includes('COORDINATOR') && authState.isCoordinator()) {
      return true;
    }

    router.navigate(['/dashboard']);
    return false;
  };

  if (authState.isLoggedIn()) {
    return decideForAuthenticatedUser();
  }

  if (authState.isChecking()) {
    saveIntendedRoute(state.url);
    return resolveCheckingState(authState).then(authenticated => {
      if (!authenticated) {
        router.navigate(['/home']);
        return false;
      }
      return decideForAuthenticatedUser();
    });
  }

  saveIntendedRoute(state.url);
  router.navigate(['/home']);
  return false;
};
