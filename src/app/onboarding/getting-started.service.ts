import { Injectable, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Observable, Subject, filter, firstValueFrom, map, of } from 'rxjs';
import { AuthStateService } from '../auth/auth-state.service';
import { HelpService } from '../help/help.service';
import { ChildAccess } from '../interfaces/parent-portal';
import { CoordinatorService } from '../services/coordinator.service';
import { OnboardingStoreService } from '../services/onboarding-store.service';
import { ParentChildContextService } from '../services/parent-child-context.service';
import { WorkspaceService } from '../services/workspace.service';
import { environment } from '../../environments/environment';
import { GUIDES, GuideAction, GuideAudience, GuideDefinition, GuideEvent, GuideStep, routePattern } from './getting-started-guides';

/** What is stored per guide on this device. Hiding or minimising never clears `done`. */
export interface GuideState {
  done: string[];
  minimized: boolean;
  hidden: boolean;
  completedAt: string | null;
}

export type DevicePermission = 'granted' | 'denied' | 'prompt' | 'unavailable';

/** What the viewer's steps depend on, gathered by the home page. */
export interface GuideContext {
  /** Parent: linked children (null when not loaded). */
  children?: readonly ChildAccess[] | null;
  /** Admin: readiness item statuses by key (null when not loaded or failed). */
  setup?: Readonly<Record<string, string>> | null;
  notifications?: DevicePermission;
}

/** A step the viewer may act on now, with the page it opens. */
export interface ResolvedStep { step: GuideStep; action: GuideAction | null; }

const DEFAULT_STATE: GuideState = { done: [], minimized: false, hidden: false, completedAt: null };

/**
 * Getting-started guides: which guide a viewer has, which steps apply, and progress on this device.
 * Shared by the web and Android clients — keep the two copies identical.
 *
 * Progress is per guide, school and user (and, for the Coordinator guide, per appointment, so a new
 * appointment starts fresh while the Teacher guide is never touched). Steps complete only from what
 * actually happened — see getting-started-guides.ts — never from a button press.
 */
@Injectable({ providedIn: 'root' })
export class GettingStartedService {
  private readonly auth = inject(AuthStateService);
  private readonly help = inject(HelpService);
  private readonly router = inject(Router);
  private readonly store = inject(OnboardingStoreService);
  private readonly coordinators = inject(CoordinatorService);
  private readonly workspace = inject(WorkspaceService);
  private readonly childContext = inject(ParentChildContextService);

  private readonly writes = new Map<string, Promise<unknown>>();
  private readonly changed$$ = new Subject<string>();
  /** Emits a storage key after its state changed (a step completed elsewhere, restore, hide…). */
  readonly changed$ = this.changed$$.asObservable();
  private currentPath: string | null = null;

  constructor() {
    this.router.events?.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(e => this.onNavigation(e.urlAfterRedirects));
    this.workspace.changed$?.subscribe(w => { if (w === 'TEACHER') void this.recordEvent('COORDINATOR', 'teacher-workspace'); });
    this.childContext.explicitSelection$?.subscribe(() => void this.recordEvent('PARENT', 'child-chosen'));
  }

  /** The viewer's guide audience; null for a Teacher (their guide is TeacherGettingStartedComponent). */
  audience(): GuideAudience | null {
    const a = this.help.audience();
    return a && a !== 'TEACHER' ? a : null;
  }

  guide(audience: GuideAudience | null = this.audience()): GuideDefinition | null {
    return audience ? GUIDES[audience] : null;
  }

  /** Storage key for a guide; null when signed out or (Coordinator) without a current appointment. */
  async keyFor(audience: GuideAudience): Promise<string | null> {
    const user = this.auth.getUser();
    if (!user?.userId) return null;
    const base = `edunexify.getting-started.v1.${audience}.${user.schoolSlug ?? 'default'}.${user.userId}`;
    if (audience !== 'COORDINATOR') return base;
    let appointment: { id?: number } | null = null;
    try { appointment = await firstValueFrom(this.coordinators.mine()); } catch { appointment = null; }
    return appointment?.id != null ? `${base}.appointment-${appointment.id}` : null;
  }

  async state(key: string): Promise<GuideState> {
    try {
      const raw = await this.store.get(key);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === 'object'
        ? { ...DEFAULT_STATE, ...parsed, done: Array.isArray(parsed.done) ? parsed.done.filter((d: unknown) => typeof d === 'string') : [] }
        : { ...DEFAULT_STATE };
    } catch { return { ...DEFAULT_STATE }; }
  }

  /** Applies a change to stored state; changes to one key run one after another. */
  update(key: string, change: (s: GuideState) => GuideState): Promise<GuideState> {
    const previous = this.writes.get(key) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(async () => {
      const before = await this.state(key);
      const after = change(before);
      if (JSON.stringify(after) !== JSON.stringify(before)) {
        await this.store.set(key, JSON.stringify(after));
        this.changed$$.next(key);
      }
      return after;
    });
    this.writes.set(key, next);
    return next;
  }

  /** Marks steps done (kept done: a later failure, rollover or permission change never undoes it). */
  markDone(key: string, stepIds: readonly string[]): Promise<GuideState> {
    return this.update(key, s => {
      const missing = stepIds.filter(id => !s.done.includes(id));
      return missing.length ? { ...s, done: [...s.done, ...missing] } : s;
    });
  }

  /**
   * The steps this viewer may act on now, in order. Plan features, child access and the page
   * checks of contextual help (role, workspace, Principal permission, page on this platform) apply.
   */
  resolveSteps(guide: GuideDefinition, ctx: GuideContext): Observable<ResolvedStep[]> {
    // Page checks use the current viewer, so another audience's guide resolves to nothing.
    if (this.audience() !== guide.audience) return of([]);
    const children = ctx.children ?? [];
    const candidates = guide.steps.filter(step => {
      if (step.feature && !this.auth.hasFeature(step.feature)) return false;
      if (step.multipleChildrenOnly && children.length < 2) return false;
      if (step.childPermission && !children.some(c => !!c[step.childPermission!])) return false;
      if (step.completion.kind === 'device' && (ctx.notifications ?? 'unavailable') === 'unavailable') return false;
      if (step.completion.kind === 'setup' && ctx.setup) {
        const status = ctx.setup[step.completion.setupKey];
        if (!status || status === 'NOT_APPLICABLE') return false;
      }
      if (step.completion.kind === 'event' && step.completion.event === 'teacher-workspace' && !this.workspace.hasChoice()) return false;
      return true;
    });
    const links = candidates.flatMap(step => step.actions.map((action, i) => ({ path: action.path, stepId: step.id, i })));
    const allowed$ = links.length ? this.help.allowedLinks(links) : of([] as typeof links);
    return allowed$.pipe(map(allowed => candidates.flatMap((step): ResolvedStep[] => {
      if (!step.actions.length) return [{ step, action: null }];
      const first = allowed.filter(l => l.stepId === step.id).sort((a, b) => a.i - b.i)[0];
      return first ? [{ step, action: step.actions[first.i] }] : [];
    })));
  }

  /** True when the viewer has a guide they hid (Help offers to show it again). */
  async isHidden(): Promise<boolean> {
    const audience = this.audience();
    const key = audience ? await this.keyFor(audience) : null;
    return !!key && (await this.state(key)).hidden;
  }

  /** Shows a hidden guide again (progress kept). Returns the page it lives on. */
  async restore(): Promise<string | null> {
    const audience = this.audience();
    const key = audience ? await this.keyFor(audience) : null;
    if (!audience || !key) return null;
    await this.update(key, s => ({ ...s, hidden: false, minimized: false }));
    return GUIDES[audience].home;
  }

  /**
   * A successful API response (from GettingStartedInterceptor). Completes a `data` step when it is
   * the page's own data and that page is open now. Errors never reach here.
   */
  observeResponse(method: string, url: string, body: unknown): void {
    const path = this.currentPath;
    const audience = path ? this.audience() : null;
    if (!path || !audience) return;
    const api = apiPath(url);
    if (!api) return;
    const ids = GUIDES[audience].steps.filter(step => step.completion.kind === 'data'
      && this.onStepPage(step, path)
      && step.completion.api.some(m => (m.method ?? 'GET') === method && m.path.test(api) && (!m.when || safe(() => m.when!(body)))))
      .map(s => s.id);
    if (ids.length) void this.record(audience, ids);
  }

  private onNavigation(url: string): void {
    const path = dashboardPath(url);
    this.currentPath = path;
    const audience = path ? this.audience() : null;
    if (!path || !audience) return;
    const ids = GUIDES[audience].steps.filter(s => s.completion.kind === 'route' && this.onStepPage(s, path)).map(s => s.id);
    if (ids.length) void this.record(audience, ids);
  }

  private onStepPage(step: GuideStep, path: string): boolean {
    return step.actions.some(a => routePattern(a.path).test(path));
  }

  private async recordEvent(audience: GuideAudience, event: GuideEvent): Promise<void> {
    if (audience === 'PARENT' && this.auth.getUserRole() !== 'PARENT') return;
    const ids = GUIDES[audience].steps.filter(s => s.completion.kind === 'event' && s.completion.event === event).map(s => s.id);
    if (ids.length) await this.record(audience, ids);
  }

  private async record(audience: GuideAudience, ids: string[]): Promise<void> {
    const key = await this.keyFor(audience);
    if (key) await this.markDone(key, ids);
  }
}

/** `/dashboard/fees/x?y` → `fees/x`; null outside /dashboard. */
export function dashboardPath(url: string): string | null {
  const path = url.split(/[?#]/)[0];
  return path.startsWith('/dashboard/') ? path.slice('/dashboard/'.length).replace(/\/$/, '') || null : null;
}

/** An API URL relative to the API base (`/school/setup-health`); null for anything else. */
export function apiPath(url: string): string | null {
  const base = environment.apiUrl.replace(/\/$/, '');
  const clean = url.split(/[?#]/)[0];
  if (clean.startsWith(base + '/')) return clean.slice(base.length);
  const at = clean.indexOf('/api/');
  return base.startsWith('/') && at >= 0 && clean.slice(at, at + base.length + 1) === base + '/' ? clean.slice(at + base.length) : null;
}

function safe(check: () => boolean): boolean {
  try { return check(); } catch { return false; }
}
