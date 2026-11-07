import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStateService } from './auth-state.service';
import { FeatureKey } from './feature-keys';

/**
 * Functional route guard that enforces feature-flag-based access control.
 *
 * Usage in routes:
 *   canActivate: [roleGuard, featureGuard],
 *   data: { roles: ['ADMIN'], featureKey: FEATURES.ANALYTICS }
 *
 * If data.featureKey is absent, any authenticated user is allowed through.
 * On failure, the user is redirected to /dashboard.
 *
 * Note: This is a UX-only guard. The backend is always the authoritative source.
 */
export const featureGuard: CanActivateFn = (route, _state) => {
  const authState = inject(AuthStateService);
  const router = inject(Router);

  const featureKey: FeatureKey | undefined = route.data['featureKey'];
  if (!featureKey) {
    console.warn(`[FeatureGuard] Route "${route.routeConfig?.path}" has no featureKey defined.`);
    return true; // Still allow but at least warn
  }

  if (authState.hasFeature(featureKey)) return true;

  const role = authState.getUserRole();
  const fallback = role === 'ADMIN' || role === 'SUB_ADMIN'
    ? '/dashboard/admin-dashboard'
    : role === 'TEACHER'
      ? '/dashboard/teacher-dashboard'
      : role === 'PRINCIPAL'
        ? '/dashboard/principal-dashboard'
      : role === 'STUDENT'
        ? '/dashboard/student-dashboard'
        : role === 'PARENT'
          ? '/home'
        : role === 'SUPER_ADMIN'
          ? '/dashboard/super-admin-dashboard'
          : '/home';
  return router.createUrlTree([fallback]);
};
