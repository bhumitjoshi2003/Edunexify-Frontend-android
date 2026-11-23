import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { Subject, of, throwError } from 'rxjs';
import { AuthStateService } from '../../auth/auth-state.service';
import { HelpService } from '../../help/help.service';
import { ChildAccess } from '../../interfaces/parent-portal';
import { GUIDES, GuideAudience, GuideStep } from '../../onboarding/getting-started-guides';
import { GettingStartedService, GuideState, ResolvedStep } from '../../onboarding/getting-started.service';
import { SchoolService, SchoolSetupHealth } from '../../services/school.service';
import { TeacherOnboardingService } from '../../services/teacher-onboarding.service';
import { WorkspaceService } from '../../services/workspace.service';
import { GettingStartedComponent } from './getting-started.component';

/**
 * The compact getting-started card: optional, never a dialog, never completes a step by itself,
 * and remembers hide/minimise without losing progress.
 * Shared by the web and Android clients — keep the two copies identical.
 */
describe('GettingStartedComponent', () => {
  let stored: Record<string, GuideState>;
  let changed$: Subject<string>;
  let audience: GuideAudience | null;
  let role: string;
  let steps: GuideStep[];
  let router: jasmine.SpyObj<Router>;
  let school: jasmine.SpyObj<SchoolService>;
  let dialog: jasmine.SpyObj<MatDialog>;
  let help: jasmine.SpyObj<HelpService>;
  let notifications: 'granted' | 'prompt' | 'unavailable';
  let workspace: jasmine.SpyObj<WorkspaceService>;
  const KEY = 'gs-key';

  const blank = (): GuideState => ({ done: [], minimized: false, hidden: false, completedAt: null });
  const child = (id: string, over: Partial<ChildAccess> = {}): ChildAccess => ({
    relationshipId: 1, studentId: id, studentName: id.toUpperCase(), className: '8', sectionName: 'A', relationshipType: 'FATHER',
    primaryGuardian: true, canViewAttendance: true, canViewFees: true, canPayFees: true, canViewResults: true,
    canViewTimetable: true, canManageLeave: true, effectiveFrom: '2026-04-01', effectiveUntil: null, ...over,
  });
  const health = (statuses: Record<string, string>): SchoolSetupHealth => ({
    completionPercentage: 0, completedRequired: 0, totalRequired: 0, status: 'IN_PROGRESS',
    items: Object.entries(statuses).map(([key, status]) => ({ key, status, title: key, description: '', importance: 'REQUIRED' })) as never,
  });

  function configure(a: GuideAudience | null, r = a ?? 'TEACHER', guideSteps?: GuideStep[]) {
    audience = a;
    role = r;
    steps = guideSteps ?? (a ? [...GUIDES[a].steps] : []);
    stored = {};
    changed$ = new Subject<string>();
    notifications = 'unavailable';
    router = jasmine.createSpyObj<Router>('Router', ['navigate', 'navigateByUrl']);
    router.navigate.and.resolveTo(true);
    router.navigateByUrl.and.resolveTo(true);
    school = jasmine.createSpyObj<SchoolService>('SchoolService', ['getSetupHealth']);
    school.getSetupHealth.and.returnValue(of(health({ TEACHERS: 'COMPLETED', STUDENTS: 'INCOMPLETE', FEE_CONFIGURATION: 'INCOMPLETE' })));
    dialog = jasmine.createSpyObj<MatDialog>('MatDialog', ['open']);
    help = jasmine.createSpyObj<HelpService>('HelpService', ['open']);
    workspace = jasmine.createSpyObj<WorkspaceService>('WorkspaceService', ['select', 'homeRoute']);
    workspace.homeRoute.and.returnValue('/dashboard/teacher-dashboard');
    const service: Partial<GettingStartedService> = {
      changed$: changed$.asObservable(),
      guide: () => (audience ? { ...GUIDES[audience], steps } : null),
      audience: () => audience,
      keyFor: async () => KEY,
      state: async key => stored[key] ?? blank(),
      update: async (key, change) => {
        const before = stored[key] ?? blank();
        const after = change(before);
        if (JSON.stringify(after) !== JSON.stringify(before)) { stored[key] = after; changed$.next(key); }
        return after;
      },
      markDone: async (key, ids) => service.update!(key, s => ({ ...s, done: [...s.done, ...ids.filter(i => !s.done.includes(i))] })),
      resolveSteps: (_guide, ctx) => of(steps
        .filter(s => !s.childPermission || (ctx.children ?? []).some(c => !!c[s.childPermission!]))
        .filter(s => !s.multipleChildrenOnly || (ctx.children ?? []).length > 1)
        .filter(s => s.completion.kind !== 'device' || ctx.notifications !== 'unavailable')
        .filter(s => s.completion.kind !== 'setup' || !ctx.setup || (ctx.setup[s.completion.setupKey] ?? 'NOT_APPLICABLE') !== 'NOT_APPLICABLE')
        .map((step): ResolvedStep => ({ step, action: step.actions[0] ?? null }))),
    };
    TestBed.configureTestingModule({
      imports: [GettingStartedComponent],
      providers: [
        { provide: GettingStartedService, useValue: service },
        { provide: AuthStateService, useValue: { getUserRole: () => role } },
        { provide: HelpService, useValue: help },
        { provide: Router, useValue: router },
        { provide: SchoolService, useValue: school },
        { provide: MatDialog, useValue: dialog },
        { provide: WorkspaceService, useValue: workspace },
        { provide: TeacherOnboardingService, useValue: {
          permissions: async () => ({ location: 'unavailable', notifications }),
          enableNotifications: async () => { notifications = 'granted'; return 'granted'; },
        } },
      ],
    });
  }

  async function render(inputs: Record<string, unknown> = {}) {
    const fixture = TestBed.createComponent(GettingStartedComponent);
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    fixture.detectChanges();
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    const stepIds = () => Array.from(el.querySelectorAll('[data-step]')).map(s => s.getAttribute('data-step') + (s.classList.contains('is-complete') ? '✓' : ''));
    const button = (id: string) => el.querySelector(`[data-step="${id}"] .gs-action`) as HTMLButtonElement | null;
    return { fixture, el, stepIds, button };
  }
  async function settle(fixture: { detectChanges(): void; whenStable(): Promise<unknown> }) {
    for (let i = 0; i < 4; i++) { await new Promise(r => setTimeout(r, 0)); await fixture.whenStable(); fixture.detectChanges(); }
  }

  it('shows nothing for a Teacher (their guide is the existing Teacher card) and never opens a dialog', async () => {
    configure(null, 'TEACHER');
    const { el } = await render();
    expect(el.querySelector('[data-getting-started]')).toBeNull();
    expect(dialog.open).not.toHaveBeenCalled();
  });

  it('renders each role’s compact card with its own steps', async () => {
    for (const a of ['SUB_ADMIN', 'PRINCIPAL', 'COORDINATOR', 'STUDENT'] as GuideAudience[]) {
      TestBed.resetTestingModule();
      configure(a);
      const { el, stepIds } = await render();
      expect(el.querySelector('[data-getting-started]')?.getAttribute('data-audience')).toBe(a);
      expect(stepIds()).toEqual(GUIDES[a].steps.filter(s => s.completion.kind !== 'device').map(s => s.id));
      expect(el.textContent).toContain(`0 of ${stepIds().length}`);
    }
    expect(dialog.open).not.toHaveBeenCalled();
  });

  it('pressing a step opens its page but does not complete it', async () => {
    configure('STUDENT');
    const { fixture, button, stepIds } = await render();
    button('timetable')!.click();
    await settle(fixture);
    expect(router.navigate).toHaveBeenCalledWith(['/dashboard', 'timetable'], undefined);
    expect(stepIds()).toContain('timetable');
    expect(stepIds()).not.toContain('timetable✓');
  });

  it('a step done elsewhere (e.g. after Android back from its page) shows as done', async () => {
    configure('STUDENT');
    const first = await render();
    first.fixture.destroy();                                // leaving the dashboard
    stored[KEY] = { ...blank(), done: ['timetable'] };      // the page loaded its data meanwhile
    const back = await render();                            // Back recreates the dashboard
    expect(back.stepIds()).toContain('timetable✓');
    expect(back.el.textContent).toContain('1 of 5');
  });

  it('updates while open when a step completes elsewhere', async () => {
    configure('PRINCIPAL');
    const { fixture, stepIds } = await render();
    stored[KEY] = { ...blank(), done: ['leave'] };
    changed$.next(KEY);
    await settle(fixture);
    expect(stepIds()).toContain('leave✓');
  });

  it('minimise and hide are remembered and keep progress', async () => {
    configure('STUDENT');
    stored[KEY] = { ...blank(), done: ['attendance'] };
    const { fixture, el } = await render();
    (el.querySelector('[aria-label="Minimize getting-started guide"]') as HTMLButtonElement).click();
    await settle(fixture);
    expect(stored[KEY].minimized).toBeTrue();
    expect(el.textContent).toContain('1 of 5 complete');
    (el.querySelector('[aria-label="Hide getting-started guide"]') as HTMLButtonElement).click();
    await settle(fixture);
    expect(stored[KEY]).toEqual(jasmine.objectContaining({ hidden: true, done: ['attendance'] }));
    expect(el.querySelector('[data-getting-started]')).toBeNull();
    stored[KEY] = { ...stored[KEY], hidden: false, minimized: false };     // restored from Help
    changed$.next(KEY);
    await settle(fixture);
    expect(el.querySelector('[data-step="attendance"]')?.classList).toContain('is-complete');
  });

  it('finishing shows "You’re all set" once, then the card stays away', async () => {
    configure('SUB_ADMIN');
    stored[KEY] = { ...blank(), done: ['classes', 'timetable', 'substitutions', 'attendance'] };
    const { fixture, el } = await render();
    stored[KEY] = { ...stored[KEY], done: [...stored[KEY].done, 'notices'] };
    changed$.next(KEY);
    await settle(fixture);
    expect(el.textContent).toContain('You’re all set');
    expect(stored[KEY].completedAt).toBeTruthy();
    fixture.destroy();
    const again = await render();
    expect(again.el.querySelector('[data-getting-started]')).toBeNull();
  });

  describe('Admin', () => {
    it('uses the readiness the dashboard already loaded, and latches completed items', async () => {
      configure('ADMIN');
      const { fixture, stepIds } = await render({ setupHealth: health({ TEACHERS: 'COMPLETED', STUDENTS: 'INCOMPLETE', FEE_CONFIGURATION: 'INCOMPLETE' }) });
      expect(school.getSetupHealth).not.toHaveBeenCalled();
      expect(stepIds()).toContain('teachers✓');
      expect(stepIds()).toContain('students');
      // A new academic session: readiness drops, but what the Admin already did stays done.
      fixture.componentRef.setInput('setupHealth', health({ TEACHERS: 'INCOMPLETE', STUDENTS: 'INCOMPLETE', FEE_CONFIGURATION: 'INCOMPLETE' }));
      fixture.detectChanges();
      await settle(fixture);
      expect(stepIds()).toContain('teachers✓');
    });

    it('without the dashboard’s readiness (Android), loads it once itself; a failure leaves steps open', async () => {
      configure('ADMIN');
      const ok = await render();
      expect(school.getSetupHealth).toHaveBeenCalledTimes(1);
      expect(ok.stepIds()).toContain('teachers✓');
      TestBed.resetTestingModule();
      configure('ADMIN');
      school.getSetupHealth.and.returnValue(throwError(() => ({ status: 503 })));
      const failed = await render();
      expect(failed.stepIds()).toContain('teachers');
      expect(failed.stepIds()).not.toContain('teachers✓');
    });

    it('does not request readiness once its steps are done, or while the guide is hidden or finished', async () => {
      configure('ADMIN');
      stored[KEY] = { ...blank(), done: ['teachers', 'students', 'fees'] };
      await render();
      expect(school.getSetupHealth).not.toHaveBeenCalled();
      TestBed.resetTestingModule();
      configure('ADMIN');
      stored[KEY] = { ...blank(), hidden: true };
      await render();
      expect(school.getSetupHealth).not.toHaveBeenCalled();
    });

    it('the Sub-admin never requests the Admin-only readiness', async () => {
      configure('SUB_ADMIN');
      await render();
      expect(school.getSetupHealth).not.toHaveBeenCalled();
    });
  });

  describe('Parent', () => {
    it('hidden when no child is linked', async () => {
      configure('PARENT');
      const { el } = await render({ children: [], selectedChild: null });
      expect(el.querySelector('[data-getting-started]')).toBeNull();
    });

    it('opens the selected child’s page', async () => {
      configure('PARENT');
      const a = child('a');
      const { fixture, button } = await render({ children: [a, child('b')], selectedChild: a });
      button('fees')!.click();
      await settle(fixture);
      expect(router.navigate).toHaveBeenCalledWith(['/dashboard', 'fees', 'a'], undefined);
    });

    it('when the selected child lacks access, asks for another child instead of opening the page', async () => {
      configure('PARENT');
      const noResults = child('a', { canViewResults: false });
      const { fixture, el, button } = await render({ children: [noResults, child('b')], selectedChild: noResults });
      const asked: unknown[] = [];
      fixture.componentInstance.chooseChild.subscribe(p => asked.push(p));
      expect(button('results')!.textContent).toContain('Choose a child');
      expect(el.querySelector('[data-step="results"]')!.textContent).toContain('Not available for A');
      button('results')!.click();
      await settle(fixture);
      expect(asked).toEqual(['canViewResults']);
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('"Choose a child" (two or more children) asks the page for its switcher and is not completed by that', async () => {
      configure('PARENT');
      const { fixture, button, stepIds } = await render({ children: [child('a'), child('b')], selectedChild: child('a') });
      const asked: unknown[] = [];
      fixture.componentInstance.chooseChild.subscribe(p => asked.push(p));
      button('choose-child')!.click();
      await settle(fixture);
      expect(asked).toEqual([null]);
      expect(stepIds()).toContain('choose-child');
      expect(stored[KEY]?.done ?? []).toEqual([]);
    });
  });

  it('notifications (Android): the step completes when permission is granted', async () => {
    configure('STUDENT');
    notifications = 'prompt';
    const { fixture, button, stepIds } = await render();
    button('notifications')!.click();
    await settle(fixture);
    expect(stepIds()).toContain('notifications✓');
  });

  it('the Coordinator’s workspace step switches to the Teacher workspace like the menu does', async () => {
    configure('COORDINATOR', 'TEACHER');
    const { fixture, button } = await render();
    button('teacher-workspace')!.click();
    await settle(fixture);
    expect(workspace.select).toHaveBeenCalledWith('TEACHER');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard/teacher-dashboard');
  });

  it('each step links its help topic', async () => {
    configure('PRINCIPAL');
    const { el } = await render();
    (el.querySelector('[data-step="leave"] .gs-help') as HTMLButtonElement).click();
    expect(help.open).toHaveBeenCalledWith('leave');
  });
});
