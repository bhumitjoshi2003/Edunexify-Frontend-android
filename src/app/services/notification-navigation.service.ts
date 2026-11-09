import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { UserNotification } from '../interfaces/user-notification';
import { AuthStateService } from '../auth/auth-state.service';
import { ParentPortalService } from './parent-portal.service';
import { ParentChildContextService } from './parent-child-context.service';
import { ToastService } from './toast.service';

export interface NotificationAction {
  actionRoute?: string | null;
  eventCode?: string | null;
  sourceEntityType?: string | null;
  sourceEntityId?: string | null;
  actionMetadata?: string | null;
}

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
    const fallbackRoute = this.routeForEvent(action);
    const route = requestedRoute ? this.compatibleRoute(requestedRoute) : fallbackRoute;
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

    // The pre-approval report-card viewer was retired. Keep older inbox links
    // useful without sending anyone to the unsigned legacy PDF.
    if (path === '/dashboard/report-card') return this.reportCardDestination() + query;

    return `${this.historicalRouteAliases[path] ?? path}${query}`;
  }

  private reportCardDestination(): string {
    const role = this.auth.getUserRole();
    if (role === 'PARENT' || role === 'STUDENT') return '/dashboard/report-card-documents';
    if (role === 'ADMIN') return '/dashboard/bulk-report-cards';
    return '/dashboard/report-card-approvals';
  }

  private routeForEvent(action: NotificationAction): string | null {
    const role = this.auth.getUserRole();
    switch ((action.eventCode ?? '').toUpperCase()) {
      case 'NOTICE_PUBLISHED': return '/dashboard/notice';
      case 'EVENT_PUBLISHED': return '/dashboard/event-calendar';
      case 'HOLIDAY_PUBLISHED': return '/dashboard/holiday-calendar';
      case 'ATTENDANCE_REMINDER': return '/dashboard/teacher-checkin';
      case 'HOMEWORK_CLASSWORK_POSTED': return '/dashboard/homework';
      case 'CLASS_UPDATE_POSTED': return '/dashboard/class-updates';
      case 'ASSESSMENT_SCHEDULED':
      case 'ASSESSMENT_UPDATED':
      case 'ASSESSMENT_REMINDER': return '/dashboard/assessments';
      case 'TEACHER_SUBSTITUTION_ASSIGNED':
      case 'TEACHER_SUBSTITUTION_CANCELLED':
      case 'STAFF_ADOPTION_NOT_STARTED_REMINDER':
      case 'STAFF_ADOPTION_ONBOARDING_REMINDER': return '/dashboard/teacher-dashboard';
      case 'SUPPORT_TICKET_IN_PROGRESS':
      case 'SUPPORT_TICKET_RESOLVED':
        return role === 'SUPER_ADMIN' ? '/dashboard/support-queue' : '/dashboard/my-support-requests';
      case 'PAYMENT_SUCCESS':
      case 'PAYMENT_REFUNDED': return '/dashboard/payment-history';
      case 'FEE_DUE':
      case 'FEE_OVERDUE':
      case 'FEE_REMINDER': return '/dashboard/fees';
      case 'STUDENT_ABSENT':
      case 'ATTENDANCE_LOW': return '/dashboard/attendance-summary';
      case 'REPORT_CARD_APPROVAL_REQUIRED':
      case 'REPORT_CARD_CORRECTION_REQUESTED':
      case 'REPORT_CARD_READY_TO_PUBLISH': return '/dashboard/report-card-approvals';
      case 'REPORT_CARD_READY':
        if (action.sourceEntityType?.toUpperCase() === 'REPORTCARDDOCUMENT' && action.sourceEntityId) {
          return `/dashboard/report-card-documents/${encodeURIComponent(action.sourceEntityId)}`;
        }
        return this.reportCardDestination();
      default: return null;
    }
  }

  private studentId(action: NotificationAction): string | null {
    if (action.sourceEntityType?.toUpperCase() === 'STUDENT') return action.sourceEntityId ?? null;
    if (!action.actionMetadata) return null;
    try { const value = JSON.parse(action.actionMetadata); return typeof value.studentId === 'string' ? value.studentId : null; }
    catch { return null; }
  }
}
