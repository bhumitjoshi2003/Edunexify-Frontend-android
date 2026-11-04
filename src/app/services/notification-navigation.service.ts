import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { UserNotification } from '../interfaces/user-notification';
import { AuthStateService } from '../auth/auth-state.service';
import { ParentPortalService } from './parent-portal.service';
import { ParentChildContextService } from './parent-child-context.service';
import { ToastService } from './toast.service';

export interface NotificationAction { actionRoute?: string | null; sourceEntityType?: string | null; sourceEntityId?: string | null; actionMetadata?: string | null; }

@Injectable({ providedIn: 'root' })
export class NotificationNavigationService {
  private readonly allowedPrefix = '/dashboard/';
  private readonly historicalRouteAliases: Readonly<Record<string, string>> = {
    '/dashboard/my-leave': '/dashboard/apply-teacher-leave',
  };
  constructor(private router: Router, private auth: AuthStateService,
    private parentPortal: ParentPortalService, private childContext: ParentChildContextService,
    private toast: ToastService) {}

  async navigate(action: NotificationAction): Promise<boolean> {
    const requestedRoute = action.actionRoute?.trim();
    const route = requestedRoute ? this.compatibleRoute(requestedRoute) : requestedRoute;
    if (!route) return false;
    if (!route.startsWith(this.allowedPrefix) || route.includes('://') || route.includes('..')) {
      this.toast.warning('Unable to open notification', 'This notification link is not valid.');
      return false;
    }
    let studentId = this.studentId(action);
    if (this.auth.getUserRole() === 'PARENT' && studentId) {
      try {
        const profile = await firstValueFrom(this.parentPortal.getMyProfile());
        const child = profile.children.find(item => item.studentId === studentId);
        if (!child) throw new Error('Relationship unavailable');
        this.childContext.select(child);
      } catch {
        this.toast.warning('Access no longer available', 'You no longer have access to the child referenced by this notification.');
        return false;
      }
    }
    try {
      const url = new URL(route, window.location.origin);
      if (this.auth.getUserRole() === 'PARENT' && studentId) {
        if (url.pathname === '/dashboard/fees') url.pathname = `/dashboard/fees/${encodeURIComponent(studentId)}`;
        if (url.pathname === '/dashboard/payment-history') url.pathname = `/dashboard/payment-history/${encodeURIComponent(studentId)}`;
      }
      const query: Record<string, string> = {};
      url.searchParams.forEach((value, key) => query[key] = value);
      if (studentId && !query['studentId']) query['studentId'] = studentId;
      return await this.router.navigate([url.pathname], { queryParams: query });
    } catch {
      this.toast.warning('Unable to open notification', 'The destination may no longer be available.');
      return false;
    }
  }

  private compatibleRoute(route: string): string {
    const queryStart = route.indexOf('?');
    const path = queryStart >= 0 ? route.slice(0, queryStart) : route;
    const query = queryStart >= 0 ? route.slice(queryStart) : '';

    // Historical support notifications were persisted with the old generic
    // /dashboard/support-tickets target. Route them according to the user who
    // is opening the notification so existing inbox rows remain useful.
    if (path === '/dashboard/support-tickets') {
      return (this.auth.getUserRole() === 'SUPER_ADMIN'
        ? '/dashboard/support-queue'
        : '/dashboard/my-support-requests') + query;
    }

    return `${this.historicalRouteAliases[path] ?? path}${query}`;
  }

  private studentId(action: NotificationAction): string | null {
    if (action.sourceEntityType?.toUpperCase() === 'STUDENT') return action.sourceEntityId ?? null;
    if (!action.actionMetadata) return null;
    try { const value = JSON.parse(action.actionMetadata); return typeof value.studentId === 'string' ? value.studentId : null; }
    catch { return null; }
  }
}
