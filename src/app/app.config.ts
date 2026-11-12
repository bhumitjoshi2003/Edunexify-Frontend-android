import { ApplicationConfig, ErrorHandler, provideZoneChangeDetection, provideAppInitializer, inject } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { routes } from './app.routes';
import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { AuthInterceptor } from './auth/auth.interceptor';
import { WorkspaceInterceptor } from './core/workspace.interceptor';
import { AuthStateService } from './auth/auth-state.service';
import { GlobalErrorHandler } from './core/global-error-handler';
import { TenantService } from './services/tenant.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    // Reuse server-rendered DOM instead of destroying and rebuilding it.
    // withEventReplay() buffers user interactions during hydration so no
    // clicks or taps are dropped while Angular is taking over the page.
    // Safe to include even for the Capacitor/Android build — it's a no-op
    // when there is no server-rendered HTML present.
    provideClientHydration(withEventReplay()),
    provideAnimationsAsync(),
    provideHttpClient(withInterceptorsFromDi()),
    { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true },
    // A Coordinator in the Teacher workspace calls the API as an ordinary teacher.
    { provide: HTTP_INTERCEPTORS, useClass: WorkspaceInterceptor, multi: true },
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    provideAppInitializer(() => {
      const tenantService    = inject(TenantService);
      const authStateService = inject(AuthStateService);

      return Promise.all([
        tenantService.init(),
        authStateService.loadCurrentUser(),
      ]).then(() => {
        // Edge case: valid session cookie persists but localStorage was cleared.
        // Auto-recover the school from the JWT's schoolSlug so all subsequent
        // API requests include the correct X-School-Slug header.
        const user = authStateService.getUser();
        if (user?.schoolSlug && !tenantService.slug) {
          return tenantService.lookupSchool(user.schoolSlug).then(info => {
            if (info) tenantService.setSchool(user.schoolSlug!, info);
          });
        }
        return;
      });
    })
  ]
};
