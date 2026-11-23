import { Injectable, Injector } from '@angular/core';
import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest, HttpResponse } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { GettingStartedService } from './getting-started.service';

/**
 * Tells the getting-started guides when a page's data loaded successfully. Only 2xx responses are
 * passed on — a failed, refused or redirected load never completes a step. The request and response
 * are untouched. Shared by the web and Android clients — keep the two copies identical.
 */
@Injectable()
export class GettingStartedInterceptor implements HttpInterceptor {
  private service: GettingStartedService | null = null;

  constructor(private readonly injector: Injector) {}

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    if (req.method !== 'GET' && req.method !== 'PUT' && req.method !== 'POST') return next.handle(req);
    return next.handle(req).pipe(tap(event => {
      if (!(event instanceof HttpResponse) || !event.ok) return;
      try {
        // Resolved on first use: the service depends on HttpClient, which depends on this interceptor.
        this.service ??= this.injector.get(GettingStartedService);
        this.service.observeResponse(req.method, req.url, event.body);
      } catch { /* optional UI: never affect the request */ }
    }));
  }
}
