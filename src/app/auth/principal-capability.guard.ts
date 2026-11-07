import { inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of, timeout } from 'rxjs';
import { AuthStateService } from './auth-state.service';
import { ToastService } from '../services/toast.service';
import { environment } from '../../environments/environment';

/** Principal navigation uses the server-owned operation contract; other roles retain their guards. */
export const principalCapabilityGuard: CanActivateFn = route => {
  const auth = inject(AuthStateService);
  if (auth.getUserRole() !== 'PRINCIPAL') return true;
  const http = inject(HttpClient);
  const router = inject(Router);
  const toast = inject(ToastService);
  const fallback = router.createUrlTree(['/dashboard/principal-dashboard']);
  const operation: string | undefined = route.data['principalOperation'];
  if (!operation) return fallback;
  return http.get<string[]>(`${environment.apiUrl}/principal/capabilities`).pipe(
    timeout(15000),
    map(operations => operations.includes(operation) ? true : fallback),
    catchError(() => {
      toast.error('Unable to open this screen', 'Your access could not be checked. Please try again.');
      return of(fallback);
    }),
  );
};
