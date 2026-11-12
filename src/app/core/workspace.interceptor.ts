import { Injectable, inject } from '@angular/core';
import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthStateService } from '../auth/auth-state.service';
import { WorkspaceService } from '../services/workspace.service';

/** Shared by the web and Android clients — keep the two copies identical. */
export const WORKSPACE_HEADER = 'X-Edunexify-Workspace';

/**
 * A teacher who is also a Coordinator has two workspaces. In the Teacher workspace every API call
 * says so, and the server then treats the request as an ordinary teacher's (no Coordinator scope:
 * own classes only). The header can only narrow access; the Coordinator workspace sends nothing.
 *
 * The page being opened decides first, so a link or notification to a Coordinator page loads with
 * Coordinator authority even before the shell switches workspace; shared pages follow the
 * selected workspace.
 */
@Injectable()
export class WorkspaceInterceptor implements HttpInterceptor {
  private readonly auth = inject(AuthStateService);
  private readonly router = inject(Router);

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    if (!req.url.startsWith(environment.apiUrl) || !this.inTeacherWorkspace()) return next.handle(req);
    return next.handle(req.clone({ setHeaders: { [WORKSPACE_HEADER]: 'TEACHER' } }));
  }

  private inTeacherWorkspace(): boolean {
    if (!this.auth.isCoordinator()) return false;
    const navigation = this.router.getCurrentNavigation();
    const url = navigation ? (navigation.finalUrl ?? navigation.extractedUrl).toString() : this.router.url;
    const page = WorkspaceService.workspaceOf(url);
    if (page) return page === 'TEACHER';
    return !WorkspaceService.leadershipView(this.auth);
  }
}
