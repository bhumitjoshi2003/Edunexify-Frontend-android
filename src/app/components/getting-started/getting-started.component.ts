import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Injector, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { Subject, filter, firstValueFrom, takeUntil } from 'rxjs';
import { AuthStateService } from '../../auth/auth-state.service';
import { HelpService } from '../../help/help.service';
import { ChildAccess } from '../../interfaces/parent-portal';
import { ChildPermission, GuideDefinition, resolveAction } from '../../onboarding/getting-started-guides';
import { DevicePermission, GettingStartedService, GuideState, ResolvedStep } from '../../onboarding/getting-started.service';
import { SchoolService, SchoolSetupHealth } from '../../services/school.service';
import { TeacherOnboardingService } from '../../services/teacher-onboarding.service';
import { WorkspaceService } from '../../services/workspace.service';

export interface GettingStartedItem extends ResolvedStep {
  complete: boolean;
  /** Beyond the first two open steps: on phones, shown only after "View all steps". */
  extra: boolean;
  /** Parent: the selected child lacks this step's access; the button asks for another child. */
  needsOtherChild: boolean;
}

/**
 * The compact getting-started card on a home page (Admin, Sub-admin, Principal, Coordinator
 * workspace, Parent, Student). Optional: it never opens a dialog or blocks a page, can be minimised
 * or hidden (Help → "Show getting-started guide" brings it back, progress kept) and disappears once
 * every step is done. The Teacher guide is TeacherGettingStartedComponent.
 * Shared by the web and Android clients — keep the two copies identical.
 */
@Component({
  selector: 'app-getting-started',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './getting-started.component.html',
  styleUrl: './getting-started.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GettingStartedComponent implements OnInit, OnChanges, OnDestroy {
  /** Admin: the readiness the page already loaded (null while loading or after a failure). Left
   *  unset, an Admin card loads it once itself. Never requested for anyone else. */
  @Input() setupHealth: SchoolSetupHealth | null | undefined = undefined;
  /** Parent: linked children (null until loaded). */
  @Input() children: readonly ChildAccess[] | null = null;
  @Input() selectedChild: ChildAccess | null = null;
  /** Parent: asks the page to show its child switcher (with the access a step needs, if any). */
  @Output() readonly chooseChild = new EventEmitter<ChildPermission | null>();

  private readonly service = inject(GettingStartedService);
  private readonly auth = inject(AuthStateService);
  private readonly help = inject(HelpService);
  private readonly router = inject(Router);
  private readonly school = inject(SchoolService);
  // Resolved when needed: on Android it pulls in the push-notification stack, which must never stop the page.
  private readonly injector = inject(Injector);
  private readonly workspace = inject(WorkspaceService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();

  guide: GuideDefinition | null = null;
  state: GuideState | null = null;
  steps: ResolvedStep[] = [];
  loading = true;
  pending: string | null = null;
  showCompletion = false;
  /** Phones: all steps shown ("View all steps"). Only the viewer changes it; never stored. */
  showAll = false;
  private key: string | null = null;
  private notifications: DevicePermission = 'unavailable';
  private setup: Record<string, string> | null = null;
  private generation = 0;
  private initialised = false;

  async ngOnInit(): Promise<void> {
    try {
      await this.init();
    } catch {
      // Optional UI: a failure here hides the card and never affects the page around it.
      this.guide = null;
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  private async init(): Promise<void> {
    this.guide = this.service.guide();
    if (!this.guide) { this.loading = false; this.cdr.markForCheck(); return; }
    this.key = await this.service.keyFor(this.guide.audience);
    if (!this.key) { this.loading = false; this.cdr.markForCheck(); return; }
    this.service.changed$.pipe(filter(k => k === this.key), takeUntil(this.destroy$)).subscribe(() => void this.refresh());
    try { this.notifications = (await this.injector.get(TeacherOnboardingService).permissions()).notifications; } catch { this.notifications = 'unavailable'; }
    if (this.guide.audience === 'ADMIN' && this.setupHealth === undefined && this.auth.getUserRole() === 'ADMIN'
        && await this.needsReadiness(this.guide, this.key)) {
      const health = await firstValueFrom(this.school.getSetupHealth()).catch(() => null);
      this.setup = statuses(health);
    } else {
      this.setup = this.guide.audience === 'ADMIN' ? statuses(this.setupHealth ?? null) : null;
    }
    this.initialised = true;
    await this.refresh();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['setupHealth'] && this.guide?.audience === 'ADMIN') this.setup = statuses(this.setupHealth ?? null);
    if (this.initialised) void this.refresh();
  }

  ngOnDestroy(): void {
    this.generation++;
    this.destroy$.next();
    this.destroy$.complete();
  }

  get items(): GettingStartedItem[] {
    const done = this.state?.done ?? [];
    const firstOpen = this.steps.filter(r => !done.includes(r.step.id)).slice(0, COLLAPSED_STEPS).map(r => r.step.id);
    return this.steps.map(r => ({
      ...r,
      complete: done.includes(r.step.id),
      extra: !firstOpen.includes(r.step.id),
      needsOtherChild: !!r.step.childPermission && !this.selectedChild?.[r.step.childPermission],
    }));
  }
  /** Steps a phone hides until "View all steps" (completed ones and open ones after the first two). */
  get extraCount(): number { return this.items.filter(i => i.extra).length; }
  toggleShowAll(): void { this.showAll = !this.showAll; this.cdr.markForCheck(); }
  get completedCount(): number { return this.items.filter(i => i.complete).length; }
  get progressPercent(): number { return this.steps.length ? Math.round(this.completedCount * 100 / this.steps.length) : 0; }
  get isComplete(): boolean { return this.steps.length > 0 && this.completedCount === this.steps.length; }
  get visible(): boolean {
    if (this.loading || !this.state || !this.steps.length || this.state.hidden) return false;
    // Once finished it stays finished: a step added later (e.g. a plan upgrade) does not bring it back.
    return this.showCompletion || (!this.state.completedAt && !this.isComplete);
  }

  buttonLabel(item: GettingStartedItem): string {
    if (this.pending === item.step.id) return 'Please wait…';
    if (item.needsOtherChild) return 'Choose a child';
    return item.action?.label ?? item.step.actionLabel ?? 'Open';
  }

  /** Opens the step's page (or does its action). Never marks the step done by itself. */
  async run(item: GettingStartedItem): Promise<void> {
    if (item.complete || this.pending || !this.key) return;
    const step = item.step;
    if (item.needsOtherChild) { this.chooseChild.emit(step.childPermission ?? null); return; }
    this.pending = step.id;
    this.cdr.markForCheck();
    try {
      if (step.completion.kind === 'event' && step.completion.event === 'child-chosen') {
        this.chooseChild.emit(null);
      } else if (step.completion.kind === 'event' && step.completion.event === 'teacher-workspace') {
        this.workspace.select('TEACHER');
        await this.router.navigateByUrl(this.workspace.homeRoute('TEACHER'));
      } else if (step.completion.kind === 'device') {
        this.notifications = await this.injector.get(TeacherOnboardingService).enableNotifications();
        await this.refresh();
      } else if (item.action) {
        const target = resolveAction(item.action, this.selectedChild?.studentId ?? null);
        if (target) await this.router.navigate(target.commands, target.queryParams ? { queryParams: target.queryParams } : undefined);
      }
    } finally {
      this.pending = null;
      this.cdr.markForCheck();
    }
  }

  openHelp(item: GettingStartedItem): void {
    if (item.step.help) this.help.open(item.step.help);
  }

  async setMinimized(minimized: boolean): Promise<void> {
    if (!this.key) return;
    this.state = await this.service.update(this.key, s => ({ ...s, minimized }));
    if (!minimized) this.showCompletion = this.showCompletion && this.isComplete;
    this.cdr.markForCheck();
  }

  /** Hides the card; progress is kept and Help → "Show getting-started guide" brings it back. */
  async hide(): Promise<void> {
    if (!this.key) return;
    this.state = await this.service.update(this.key, s => ({ ...s, hidden: true }));
    this.showCompletion = false;
    this.cdr.markForCheck();
  }

  /** Admin without the dashboard's readiness: request it only while a readiness step is still open. */
  private async needsReadiness(guide: GuideDefinition, key: string): Promise<boolean> {
    const state = await this.service.state(key);
    if (state.hidden || state.completedAt) return false;
    return guide.steps.some(s => s.completion.kind === 'setup' && !state.done.includes(s.id));
  }

  /** Re-reads the steps and progress; latches server and device signals that are now complete. */
  private async refresh(): Promise<void> {
    const guide = this.guide;
    const key = this.key;
    if (!guide || !key) return;
    // The viewer is leaving this guide (e.g. a Coordinator just switched to the Teacher workspace):
    // their steps would resolve against the other workspace, so leave progress alone.
    if (this.service.audience() !== guide.audience) return;
    const run = ++this.generation;
    if (guide.audience === 'PARENT' && !(this.children?.length)) {
      this.steps = [];
      this.loading = this.children === null;
      this.cdr.markForCheck();
      return;
    }
    const steps = await firstValueFrom(this.service.resolveSteps(guide, {
      children: this.children, setup: this.setup, notifications: this.notifications,
    })).catch(() => [] as ResolvedStep[]);
    const signalled = steps.filter(({ step: s }) =>
      (s.completion.kind === 'setup' && this.setup?.[s.completion.setupKey] === 'COMPLETED')
      || (s.completion.kind === 'device' && this.notifications === 'granted')).map(r => r.step.id);
    let state = signalled.length ? await this.service.markDone(key, signalled) : await this.service.state(key);
    if (run !== this.generation) return;
    this.steps = steps;
    const allDone = steps.length > 0 && steps.every(r => state.done.includes(r.step.id));
    if (allDone && !state.completedAt) {
      this.showCompletion = true;   // set first: the write below triggers another refresh
      state = await this.service.update(key, s => ({ ...s, completedAt: new Date().toISOString(), minimized: false }));
      if (run !== this.generation) return;
    }
    this.state = state;
    this.loading = false;
    this.cdr.markForCheck();
  }
}

/** Open steps a phone shows before "View all steps". */
const COLLAPSED_STEPS = 2;

function statuses(health: SchoolSetupHealth | null): Record<string, string> | null {
  return health?.items ? Object.fromEntries(health.items.map(i => [i.key, i.status])) : null;
}
