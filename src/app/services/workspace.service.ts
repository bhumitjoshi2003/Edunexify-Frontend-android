import { Injectable, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { AuthStateService } from '../auth/auth-state.service';

export type Workspace = 'TEACHER' | 'COORDINATOR';

/** Minimal view of the auth state the helpers need (also satisfied by the small doubles used in specs). */
interface AuthLike {
  getUser?: () => { userId?: string; role?: string; schoolSlug?: string | null; coordinator?: boolean } | null;
  getUserRole?: () => string;
}

const memory = new Map<string, Workspace>();

function keyFor(user: ReturnType<NonNullable<AuthLike['getUser']>>): string | null {
  return user?.userId ? `edunexify.workspace.v1.${user.schoolSlug ?? 'default'}.${user.userId}` : null;
}

function storedChoice(key: string | null): Workspace | null {
  if (!key) return null;
  let value: string | null;
  try { value = localStorage.getItem(key); } catch { value = memory.get(key) ?? null; }   // storage blocked: the in-memory choice
  return value === 'TEACHER' || value === 'COORDINATOR' ? value : null;
}

/**
 * Which workspace a coordinating teacher is looking at. This is a UI preference only — never a
 * permission: the account, its role and every authorisation decision (active appointment, scope,
 * school) stay with the server and with {@link AuthStateService}. A teacher without an active
 * appointment is always in the Teacher workspace, whatever was stored on this device.
 *
 * Preferences are stored per school and user on this device. A coordinator with no stored choice
 * (the first login after being appointed) opens the Coordinator workspace.
 * Shared by the web and Android clients — keep the two copies identical.
 */
@Injectable({ providedIn: 'root' })
export class WorkspaceService {
  private readonly auth = inject(AuthStateService);
  private readonly changed$$ = new Subject<Workspace>();
  /** Emits after an explicit {@link select}. */
  readonly changed$ = this.changed$$.asObservable();
  private hadChoice = false;
  private readonly revoked$$ = new Subject<void>();
  /** Emits when a successful session verification shows the Coordinator appointment has ended. */
  readonly revoked$ = this.revoked$$.asObservable();

  constructor() {
    // Optional so that minimal AuthStateService stubs keep working.
    this.auth.verified$?.subscribe(() => this.reconcile());
  }

  /** True while the signed-in teacher holds an active Coordinator appointment (the switcher shows). */
  hasChoice(): boolean {
    const has = this.coordinator();
    if (has) this.hadChoice = true;
    return has;
  }

  /** Called after each verified session: an ended appointment drops the preference and notifies the shell. */
  reconcile(): void {
    const has = this.coordinator();
    if (this.hadChoice && !has) {
      this.forget();
      this.hadChoice = false;
      this.revoked$$.next();
    } else if (has) {
      this.hadChoice = true;
    }
  }

  /** An active Coordinator appointment on the signed-in TEACHER account (as last verified by the server). */
  private coordinator(): boolean {
    const user = this.auth.getUser?.();   // optional call: tolerates the minimal auth doubles some specs provide
    return user?.role === 'TEACHER' && user?.coordinator === true;
  }

  /** The workspace to show now; always TEACHER without an active appointment. */
  active(): Workspace {
    if (!this.coordinator()) {
      this.forget();
      return 'TEACHER';
    }
    return this.read() ?? 'COORDINATOR';
  }

  /**
   * The Principal, or a Coordinator in the Coordinator workspace: the school-wide read screens and the
   * leadership endpoints. A UI choice only — the server decides what each call may do.
   */
  isLeadershipView(): boolean { return WorkspaceService.leadershipView(this.auth); }

  /**
   * Same answer without an injected instance, for components that already hold the auth state. The
   * Principal always; a Coordinator while the Coordinator workspace is selected (the default).
   */
  static leadershipView(auth: AuthLike): boolean {
    const user = auth.getUser?.() ?? null;
    if ((auth.getUserRole?.() ?? user?.role) === 'PRINCIPAL') return true;
    if (!(user?.role === 'TEACHER' && user.coordinator === true)) return false;
    return (storedChoice(keyFor(user)) ?? 'COORDINATOR') === 'COORDINATOR';
  }

  isCoordinatorWorkspace(): boolean {
    return this.active() === 'COORDINATOR';
  }

  /** Remembers the choice for this user and school. Ignored (and Teacher kept) without an appointment. */
  select(workspace: Workspace): Workspace {
    if (!this.coordinator()) return 'TEACHER';
    const key = this.key();
    if (key) {
      memory.set(key, workspace);
      try { localStorage.setItem(key, workspace); } catch { /* storage unavailable: the in-memory choice still works */ }
    }
    this.changed$$.next(workspace);
    return workspace;
  }

  /** The route a workspace opens on. */
  homeRoute(workspace: Workspace = this.active()): string {
    return workspace === 'COORDINATOR' ? '/dashboard/coordinator-dashboard' : '/dashboard/teacher-dashboard';
  }

  /** Personal teaching pages (a notification or link to one opens the Teacher workspace). */
  private static readonly TEACHER_PAGES = [
    'teacher-dashboard', 'teacher-checkin', 'apply-teacher-leave', 'teacher-attendance',
    'my-signature', 'homework-classwork', 'teacher-class-updates', 'report-card-approvals', 'report-cards-v2',
    'timetable',
  ];
  /** Coordinator oversight pages (they open the Coordinator workspace). */
  private static readonly COORDINATOR_PAGES = [
    'report-card-review', 'staff-attendance', 'teacher-substitutions', 'student-search', 'teacher-list', 'teacher-leave-requests',
  ];

  /** The workspace a URL belongs to, when that is unambiguous (shared pages return null). */
  static workspaceOf(url: string): Workspace | null {
    const segment = url.split('?')[0].split('#')[0].replace(/^\/dashboard\//, '').split('/')[0];
    if (WorkspaceService.TEACHER_PAGES.includes(segment)) return 'TEACHER';
    if (segment.startsWith('coordinator-') || WorkspaceService.COORDINATOR_PAGES.includes(segment)) return 'COORDINATOR';
    return null;
  }

  private key(): string | null { return keyFor(this.auth.getUser?.() ?? null); }

  private read(): Workspace | null { return storedChoice(this.key()); }

  /** The appointment has ended: drop the stale choice so a later appointment starts in Coordinator. */
  private forget(): void {
    const key = this.key();
    if (!key || !this.auth.getUser() || this.auth.getUser()?.role !== 'TEACHER') return;
    memory.delete(key);
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  }
}
