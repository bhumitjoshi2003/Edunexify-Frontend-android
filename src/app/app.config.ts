import { ApplicationConfig, ErrorHandler, provideZoneChangeDetection, provideAppInitializer, inject } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { routes } from './app.routes';
import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { AuthInterceptor } from './auth/auth.interceptor';
import { WorkspaceInterceptor } from './core/workspace.interceptor';
import { GettingStartedInterceptor } from './onboarding/getting-started.interceptor';
import { GlobalErrorHandler } from './core/global-error-handler';
import { StartupService } from './core/startup.service';
import { STARTUP_BOOTSTRAP_GRACE_MS } from './core/startup.constants';

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
    { provide: HTTP_INTERCEPTORS, useClass: GettingStartedInterceptor, multi: true },
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    provideAppInitializer(() => {
      // Same startup sequence as the website (core/startup.service.ts): tenant branding + the
      // session check, each bounded. Bootstrap waits at most the grace period; after that the app
      // shell renders the startup screen for CHECKING and the real result replaces it.
      const initPromise = inject(StartupService).initialize();
      const grace = new Promise<void>(resolve => setTimeout(resolve, STARTUP_BOOTSTRAP_GRACE_MS));
      return Promise.race([initPromise, grace]);
    })
  ]
};
