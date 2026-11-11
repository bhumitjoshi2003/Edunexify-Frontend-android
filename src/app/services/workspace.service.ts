import { Injectable, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { AuthStateService } from '../auth/auth-state.service';

export type Workspace = 'TEACHER' | 'COORDINATOR';

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
  private memory = new Map<string, Workspace>();

  /** True while the signed-in teacher holds an active Coordinator appointment (the switcher shows). */
  hasChoice(): boolean {
    return this.auth.isCoordinator();
  }

  /** The workspace to show now; always TEACHER without an active appointment. */
  active(): Workspace {
    if (!this.auth.isCoordinator()) {
      this.forget();
      return 'TEACHER';
    }
    return this.read() ?? 'COORDINATOR';
  }

  isCoordinatorWorkspace(): boolean {
    return this.active() === 'COORDINATOR';
  }

  /** Remembers the choice for this user and school. Ignored (and Teacher kept) without an appointment. */
  select(workspace: Workspace): Workspace {
    if (!this.auth.isCoordinator()) return 'TEACHER';
    const key = this.key();
    if (key) {
      this.memory.set(key, workspace);
      try { localStorage.setItem(key, workspace); } catch { /* storage unavailable: the in-memory choice still works */ }
    }
    this.changed$$.next(workspace);
    return workspace;
  }

  /** The route a workspace opens on. */
  homeRoute(workspace: Workspace = this.active()): string {
    return workspace === 'COORDINATOR' ? '/dashboard/coordinator-dashboard' : '/dashboard/teacher-dashboard';
  }

  /** The workspace a URL belongs to, when that is unambiguous (shared pages return null). */
  static workspaceOf(url: string): Workspace | null {
    const segment = url.split('?')[0].split('#')[0].replace(/^\/dashboard\//, '').split('/')[0];
    if (segment === 'teacher-dashboard') return 'TEACHER';
    if (segment.startsWith('coordinator-') || ['report-card-review', 'staff-attendance', 'teacher-substitutions'].includes(segment)) {
      return 'COORDINATOR';
    }
    return null;
  }

  private key(): string | null {
    const user = this.auth.getUser();
    if (!user?.userId) return null;
    return `edunexify.workspace.v1.${user.schoolSlug ?? 'default'}.${user.userId}`;
  }

  private read(): Workspace | null {
    const key = this.key();
    if (!key) return null;
    let value: string | null = null;
    try { value = localStorage.getItem(key); } catch { value = null; }
    value = value ?? this.memory.get(key) ?? null;
    return value === 'TEACHER' || value === 'COORDINATOR' ? value : null;
  }

  /** The appointment has ended: drop the stale choice so a later appointment starts in Coordinator. */
  private forget(): void {
    const key = this.key();
    if (!key || !this.auth.getUser() || this.auth.getUser()?.role !== 'TEACHER') return;
    this.memory.delete(key);
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  }
}
