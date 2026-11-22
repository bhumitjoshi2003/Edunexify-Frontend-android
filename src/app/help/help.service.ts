import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Route, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { Observable, catchError, map, of, shareReplay, timeout } from 'rxjs';
import { AuthStateService } from '../auth/auth-state.service';
import { featureGuard } from '../auth/feature.guard';
import { principalCapabilityGuard } from '../auth/principal-capability.guard';
import { roleGuard } from '../auth/role.guard';
import { WorkspaceService } from '../services/workspace.service';
import { environment } from '../../environments/environment';
import {
  HELP_TOPICS, HelpAudience, HelpLine, HelpLink, HelpProblem, HelpTopicId, HelpWorkflow, forAudience,
} from './help-content';

/** A help topic as one viewer sees it: only their lines, and only links they could open now. */
export interface ResolvedHelp {
  id: HelpTopicId;
  title: string;
  audience: HelpAudience | null;
  /** The school's plan does not include this feature: only the description is shown. */
  unavailable: boolean;
  /** Parents open pages from the parent portal with a child selected, so no direct links. */
  parentNote: boolean;
  about: HelpLine[];
  prerequisites: HelpLine[];
  workflows: HelpWorkflow[];
  problems: HelpProblem[];
  links: HelpLink[];
  support: HelpLink[];
}

/** Opened from the "?" button. Input for {@link HelpService.open}. */
export interface HelpPanelData { topicId: HelpTopicId; /** The page the panel was opened on (not linked to itself). */ currentPage?: string | null }

const SUPPORT_LINKS: readonly HelpLink[] = [
  { label: 'Report a problem', path: 'report-problem' },
  { label: 'My support requests', path: 'my-support-requests' },
];

/** Guards whose rules this service re-applies. A route with any other guard is never linked. */
const KNOWN_GUARDS: readonly unknown[] = [roleGuard, featureGuard, principalCapabilityGuard];

/**
 * Contextual help: who is reading, which lines apply to them, and which links they may follow.
 * Shared by the web and Android clients — keep the two copies identical.
 *
 * A link is shown only when the viewer could open that page right now, using the same rules as
 * the route's own guards: its roles (a Coordinator only in the Coordinator workspace), the school's
 * plan feature and, for the Principal, the granted permission. Pages missing on this platform are
 * never linked. This only decides what help shows — the guards and the server still decide access.
 */
@Injectable({ providedIn: 'root' })
export class HelpService {
  private readonly auth = inject(AuthStateService);
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  private readonly dialog = inject(MatDialog);

  private capabilities: { userId: string; ops$: Observable<readonly string[]> } | null = null;

  /** Whose help to show. A Coordinator in the Teacher workspace reads the Teacher help. */
  audience(): HelpAudience | null {
    const role = this.auth.getUserRole();
    if (role === 'TEACHER') return WorkspaceService.leadershipView(this.auth) ? 'COORDINATOR' : 'TEACHER';
    return (['ADMIN', 'SUB_ADMIN', 'PRINCIPAL', 'PARENT', 'STUDENT'] as const).find(r => r === role) ?? null;
  }

  /** The topic for this viewer. Emits once (after the Principal's permissions, when needed). */
  resolve(topicId: HelpTopicId, currentPage: string | null = null): Observable<ResolvedHelp> {
    const topic = HELP_TOPICS[topicId];
    const audience = this.audience();
    const unavailable = !!topic.feature && !this.auth.hasFeature(topic.feature);
    const pick = <T extends { for?: readonly HelpAudience[] }>(items: readonly T[]): T[] =>
      audience ? forAudience(items, audience) : items.filter(i => !i.for);
    return this.principalOperations().pipe(map(ops => {
      const allowed = (links: readonly HelpLink[]) =>
        pick(links).filter(l => l.path !== currentPage && this.canOpen(l.path, audience, ops));
      return {
        id: topic.id,
        title: topic.title,
        audience,
        unavailable,
        parentNote: audience === 'PARENT',
        about: pick(topic.about),
        prerequisites: unavailable ? [] : pick(topic.prerequisites),
        workflows: unavailable ? [] : pick(topic.workflows),
        problems: unavailable ? [] : pick(topic.problems),
        links: unavailable || audience === 'PARENT' ? [] : allowed(topic.links),
        support: allowed(SUPPORT_LINKS),
      };
    }));
  }

  /** Could this viewer open /dashboard/{path} now? Mirrors the route's guards (see class comment). */
  canOpen(path: string, audience: HelpAudience | null, principalOps: readonly string[]): boolean {
    if (!audience) return false;
    const route = this.findRoute(path);
    if (!route || route.redirectTo) return false;
    const guards = route.canActivate ?? [];
    if (guards.some(g => !KNOWN_GUARDS.includes(g))) return false;
    const data = route.data ?? {};
    const roles: string[] = data['roles'] ?? [];
    if (guards.includes(roleGuard) && roles.length) {
      const role = this.auth.getUserRole();
      const ok = audience === 'COORDINATOR'
        ? roles.includes('COORDINATOR') || roles.includes(role)
        : roles.includes(role);
      if (!ok) return false;
    }
    if (guards.includes(featureGuard) && data['featureKey'] && !this.auth.hasFeature(data['featureKey'])) return false;
    // A Coordinator's links stay in the workspace they are reading: a Teacher-workspace page (which
    // would switch the workspace) is not offered in Coordinator help, and the reverse.
    const workspace = WorkspaceService.workspaceOf(path);
    if (audience === 'COORDINATOR' && workspace === 'TEACHER') return false;
    if (audience === 'TEACHER' && workspace === 'COORDINATOR') return false;
    if (guards.includes(principalCapabilityGuard) && this.auth.getUserRole() === 'PRINCIPAL') {
      return !!data['principalOperation'] && principalOps.includes(data['principalOperation']);
    }
    return true;
  }

  /** Opens the help panel: a right-side panel on wide screens, full screen on phones. */
  open(topicId: HelpTopicId): void {
    const currentPage = this.router.url.split(/[?#]/)[0].replace(/^\/dashboard\//, '') || null;
    const phone = typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 600px)').matches;
    // Loaded on first use so pages without help never pull the panel in.
    import('../components/help-panel/help-panel.component').then(({ HelpPanelComponent }) => {
      this.dialog.open<unknown, HelpPanelData>(HelpPanelComponent, {
        data: { topicId, currentPage },
        panelClass: ['edx-help-dialog', phone ? 'edx-help-dialog--phone' : 'edx-help-dialog--side'],
        width: phone ? '100vw' : '420px',
        maxWidth: '100vw',
        height: '100dvh',
        position: phone ? undefined : { right: '0', top: '0' },
        autoFocus: 'dialog',
        restoreFocus: true,
        ariaLabel: `Help: ${HELP_TOPICS[topicId].title}`,
      });
    });
  }

  /** Navigates to a help link (always a page under /dashboard). */
  go(path: string): void {
    void this.router.navigateByUrl(`/dashboard/${path}`);
  }

  private findRoute(path: string): Route | undefined {
    const dashboard = this.router.config.find(r => r.path === 'dashboard');
    return dashboard?.children?.find(r => r.path === path);
  }

  /** The Principal's granted operations (the same list the capability guard checks), once per user. */
  private principalOperations(): Observable<readonly string[]> {
    if (this.auth.getUserRole() !== 'PRINCIPAL') return of([]);
    const userId = this.auth.getUserId();
    if (this.capabilities?.userId !== userId) {
      this.capabilities = {
        userId,
        ops$: this.http.get<string[]>(`${environment.apiUrl}/principal/capabilities`).pipe(
          timeout(15000),
          catchError(() => {
            this.capabilities = null;   // try again next time; meanwhile show no guarded links
            return of([] as string[]);
          }),
          shareReplay({ bufferSize: 1, refCount: false }),
        ),
      };
    }
    return this.capabilities.ops$;
  }
}
