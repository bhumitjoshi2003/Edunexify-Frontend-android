import { TestBed } from '@angular/core/testing';
import { HTTP_INTERCEPTORS, HttpClient, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { NavigationEnd, Route, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { Subject, firstValueFrom, of } from 'rxjs';
import { routes } from '../app.routes';
import { AuthStateService } from '../auth/auth-state.service';
import { isCoreFeature } from '../auth/feature-keys';
import { HelpService } from '../help/help.service';
import { ChildAccess } from '../interfaces/parent-portal';
import { CoordinatorService } from '../services/coordinator.service';
import { ParentChildContextService } from '../services/parent-child-context.service';
import { WorkspaceService } from '../services/workspace.service';
import { environment } from '../../environments/environment';
import { GUIDES } from './getting-started-guides';
import { GettingStartedInterceptor } from './getting-started.interceptor';
import { GettingStartedService, GuideContext, apiPath, dashboardPath } from './getting-started.service';

const ALL_FEATURES = ['CLASSROOM', 'EXAMS_RESULTS', 'REPORT_CARDS', 'FEE_MANAGEMENT', 'ONLINE_PAYMENTS', 'PARENT_PORTAL'];

interface FakeUser { userId: string; role: string; schoolSlug: string; coordinator?: boolean; featureKeys: string[] }

/**
 * Getting-started progress: which steps each viewer gets, what completes them, and where progress
 * is kept (per guide, school, user — and Coordinator appointment).
 * Shared by the web and Android clients — keep the two copies identical.
 */
describe('GettingStartedService', () => {
  let user: FakeUser;
  let appointment: { id: number } | null;
  let ops: string[];
  let routerEvents: Subject<unknown>;
  let service: GettingStartedService;
  let help: HelpService;
  let workspace: WorkspaceService;
  let parentContext: ParentChildContextService;
  let config: Route[];

  const as = (role: string, over: Partial<FakeUser> = {}) => {
    user = { userId: `${role.toLowerCase()}_1`, role, schoolSlug: 'alpha', featureKeys: [...ALL_FEATURES], ...over };
  };
  const child = (id: string, over: Partial<ChildAccess> = {}): ChildAccess => ({
    relationshipId: 1, studentId: id, studentName: id, className: '8', sectionName: 'A', relationshipType: 'MOTHER',
    primaryGuardian: true, canViewAttendance: true, canViewFees: true, canPayFees: true, canViewResults: true,
    canViewTimetable: true, canManageLeave: true, effectiveFrom: '2026-04-01', effectiveUntil: null, ...over,
  });
  const navigate = (url: string, urlAfterRedirects = url) => routerEvents.next(new NavigationEnd(1, url, urlAfterRedirects));
  const ids = async (ctx: GuideContext = {}) =>
    (await firstValueFrom(service.resolveSteps(service.guide()!, ctx))).map(r => `${r.step.id}${r.action ? ':' + r.action.path : ''}`);
  const done = async (audience = service.audience()!) => (await service.state((await service.keyFor(audience))!)).done;
  const flush = () => new Promise(resolve => setTimeout(resolve, 0));

  function setup(routeConfig: Route[] = routes.find(r => r.path === 'dashboard')!.children as Route[]) {
    config = [{ path: 'dashboard', children: routeConfig }];
    localStorage.clear();
    as('ADMIN');
    appointment = { id: 7 };
    ops = [];
    routerEvents = new Subject();
    const auth = {
      getUser: () => user, getUserRole: () => user.role, getUserId: () => user.userId,
      isCoordinator: () => user.role === 'TEACHER' && !!user.coordinator,
      hasFeature: (k: string) => isCoreFeature(k) || user.featureKeys.includes(k),
      verified$: new Subject<void>(),
    };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting(),
        { provide: HTTP_INTERCEPTORS, useClass: GettingStartedInterceptor, multi: true },
        { provide: AuthStateService, useValue: auth },
        { provide: Router, useValue: { config, events: routerEvents, navigate: () => Promise.resolve(true) } },
        { provide: MatDialog, useValue: { open: () => null } },
        { provide: CoordinatorService, useValue: { mine: () => of(appointment) } },
      ],
    });
    help = TestBed.inject(HelpService);
    spyOn(help as any, 'principalOperations').and.callFake(() => of(ops));
    workspace = TestBed.inject(WorkspaceService);
    parentContext = TestBed.inject(ParentChildContextService);
    service = TestBed.inject(GettingStartedService);
  }

  beforeEach(() => setup());
  afterEach(() => localStorage.clear());

  describe('audiences', () => {
    it('has a guide for every non-teaching role; a Teacher keeps the existing Teacher guide', () => {
      for (const role of ['ADMIN', 'SUB_ADMIN', 'PRINCIPAL', 'PARENT', 'STUDENT']) {
        as(role);
        expect(service.audience()).toBe(role as never);
      }
      as('TEACHER');
      expect(service.audience()).toBeNull();
    });

    it('a Coordinator gets the Coordinator guide only in the Coordinator workspace', () => {
      as('TEACHER', { coordinator: true });
      expect(service.audience()).toBe('COORDINATOR');
      workspace.select('TEACHER');
      expect(service.audience()).toBeNull();
      workspace.select('COORDINATOR');
      expect(service.audience()).toBe('COORDINATOR');
    });
  });

  describe('where progress is kept', () => {
    it('per guide, school and user — another user or school never sees it', async () => {
      as('STUDENT', { userId: 'stu_1', schoolSlug: 'alpha' });
      const alpha = (await service.keyFor('STUDENT'))!;
      await service.markDone(alpha, ['timetable']);
      as('STUDENT', { userId: 'stu_1', schoolSlug: 'beta' });
      expect(await done('STUDENT')).toEqual([]);
      as('STUDENT', { userId: 'stu_2', schoolSlug: 'alpha' });
      expect(await done('STUDENT')).toEqual([]);
      as('STUDENT', { userId: 'stu_1', schoolSlug: 'alpha' });
      expect(await done('STUDENT')).toEqual(['timetable']);
    });

    it('a Coordinator’s progress belongs to the appointment: a new appointment starts fresh, none means no guide', async () => {
      as('TEACHER', { coordinator: true });
      const first = (await service.keyFor('COORDINATOR'))!;
      expect(first).toContain('appointment-7');
      await service.markDone(first, ['student-search']);
      appointment = { id: 9 };
      expect(await done('COORDINATOR')).toEqual([]);
      appointment = null;
      expect(await service.keyFor('COORDINATOR')).toBeNull();
    });

    it('never touches the Teacher guide’s storage', async () => {
      localStorage.setItem('edunexify.teacher-onboarding.v1.teacher_1', '{"profileVisited":true}');
      as('TEACHER', { coordinator: true });
      await service.markDone((await service.keyFor('COORDINATOR'))!, ['student-search']);
      workspace.select('TEACHER');
      await flush();
      expect(localStorage.getItem('edunexify.teacher-onboarding.v1.teacher_1')).toBe('{"profileVisited":true}');
    });

    it('hiding and minimising keep progress; restoring brings the guide back on its home page', async () => {
      as('PRINCIPAL');
      const key = (await service.keyFor('PRINCIPAL'))!;
      await service.markDone(key, ['leave']);
      await service.update(key, s => ({ ...s, hidden: true, minimized: true }));
      expect(await service.isHidden()).toBeTrue();
      expect(await service.restore()).toBe('/dashboard/principal-dashboard');
      const state = await service.state(key);
      expect(state).toEqual(jasmine.objectContaining({ hidden: false, minimized: false, done: ['leave'] }));
      expect(await service.isHidden()).toBeFalse();
    });

    it('a damaged stored value starts over instead of failing', async () => {
      as('STUDENT');
      const key = (await service.keyFor('STUDENT'))!;
      localStorage.setItem(key, '{not json');
      expect((await service.state(key)).done).toEqual([]);
    });
  });

  describe('which steps a viewer gets', () => {
    it('the Principal sees only steps for permissions actually granted', async () => {
      as('PRINCIPAL');
      ops = [];
      expect(await ids()).toEqual(['signature:my-signature']);
      ops = ['STUDENT_LEAVE_DECIDE', 'REPORT_CARD_REVIEW'];
      expect(await ids()).toEqual(['signature:my-signature', 'leave:view-leaves', 'report-cards:report-card-review']);
      ops = ['STUDENT_LEAVE_DECIDE', 'TEACHER_ATTENDANCE_CORRECT', 'ATTENDANCE_READ', 'REPORT_CARD_REVIEW'];
      expect((await ids()).length).toBe(5);
    });

    it('a permission withdrawn later removes its step (and its link) even when it was done', async () => {
      as('PRINCIPAL');
      ops = ['STUDENT_LEAVE_DECIDE'];
      await service.markDone((await service.keyFor('PRINCIPAL'))!, ['leave']);
      ops = [];
      expect(await ids()).not.toContain('leave:view-leaves');
    });

    it('plan features decide which steps exist', async () => {
      as('STUDENT', { featureKeys: [] });
      expect(await ids()).toEqual(['timetable:timetable', 'attendance:attendance-summary']);
      as('PRINCIPAL', { featureKeys: [] });
      ops = ['REPORT_CARD_REVIEW', 'STUDENT_LEAVE_DECIDE'];
      expect(await ids()).toEqual(['leave:view-leaves']);
      as('ADMIN', { featureKeys: [] });
      expect(await ids()).not.toContain('fees:fee-structure');
    });

    it('the Sub-admin only gets pages a Sub-admin may open, and no readiness item', async () => {
      as('SUB_ADMIN');
      const steps = await ids();
      expect(steps).toEqual(['classes:class-management', 'timetable:timetable', 'substitutions:teacher-substitutions', 'attendance:attendance-summary', 'notices:notice']);
      expect(GUIDES.SUB_ADMIN.steps.some(s => s.completion.kind === 'setup')).toBeFalse();
    });

    it('Admin readiness items that do not apply to the school are left out', async () => {
      as('ADMIN');
      expect(await ids({ setup: { TEACHERS: 'COMPLETED', STUDENTS: 'INCOMPLETE', FEE_CONFIGURATION: 'NOT_APPLICABLE' } }))
        .not.toContain('fees:fee-structure');
    });

    it('parents: no "choose a child" with one child; at least one child must allow each step', async () => {
      as('PARENT');
      expect(await ids({ children: [child('a')] })).not.toContain('choose-child');
      expect(await ids({ children: [child('a'), child('b')] })).toContain('choose-child');
      const limited = await ids({ children: [child('a', { canViewFees: false, canViewResults: false }), child('b', { canViewResults: false })] });
      expect(limited).toContain('fees:fees/:studentId');
      expect(limited).not.toContain('results:my-results');
      expect(await ids({ children: [] })).not.toContain('attendance:attendance-summary');
    });

    it('notifications appear only where the device supports them', async () => {
      as('STUDENT');
      expect(await ids({ notifications: 'unavailable' })).not.toContain('notifications');
      expect(await ids({ notifications: 'prompt' })).toContain('notifications');
    });

    it('a page missing on this platform is never linked; School Setup falls back to School Settings', async () => {
      const withoutSetup = (routes.find(r => r.path === 'dashboard')!.children as Route[]).filter(r => r.path !== 'school-setup');
      TestBed.resetTestingModule();
      setup(withoutSetup);
      as('ADMIN');
      const steps = await ids();
      expect(steps).toContain('readiness:school-settings');
      expect(steps.some(s => s.includes('school-setup') || s.includes('fee-generation-target'))).toBeFalse();
    });

    it('the Coordinator’s workspace step needs an active appointment', async () => {
      as('TEACHER', { coordinator: true });
      expect(await ids()).toContain('teacher-workspace');
      expect(await ids()).not.toContain('teacher-leave');
    });

    it('another audience’s guide resolves to nothing (no cross-workspace links)', async () => {
      as('TEACHER', { coordinator: true });
      workspace.select('TEACHER');
      expect(await firstValueFrom(service.resolveSteps(GUIDES.COORDINATOR, {}))).toEqual([]);
    });
  });

  describe('what completes a step', () => {
    it('a page’s own data loading successfully, while that page is open', async () => {
      as('STUDENT', { userId: 'stu_1' });
      service.observeResponse('GET', `${environment.apiUrl}/timetable/class/8`, []);
      await flush();
      expect(await done()).toEqual([]);                 // not on the timetable page
      navigate('/dashboard/timetable');
      service.observeResponse('GET', `${environment.apiUrl}/school/settings`, {});
      await flush();
      expect(await done()).toEqual([]);                 // another request on that page
      service.observeResponse('GET', `${environment.apiUrl}/timetable/class/8?x=1`, []);
      await flush();
      expect(await done()).toEqual(['timetable']);
    });

    it('a side request on the page (the fee session list) is not the page’s data', async () => {
      as('PARENT');
      navigate('/dashboard/fees/a');
      service.observeResponse('GET', `${environment.apiUrl}/student-fees/sessions/a`, ['2026-2027']);
      await flush();
      expect(await done()).toEqual([]);
      service.observeResponse('GET', `${environment.apiUrl}/student-fees/a/2026-2027`, []);
      await flush();
      expect(await done()).toEqual(['fees']);
    });

    it('a failed or refused load never completes a step (only 2xx responses are passed on)', async () => {
      as('STUDENT', { userId: 'stu_1' });
      navigate('/dashboard/timetable');
      const http = TestBed.inject(HttpClient);
      const ctrl = TestBed.inject(HttpTestingController);
      http.get(`${environment.apiUrl}/timetable/class/8`).subscribe({ error: () => undefined });
      ctrl.expectOne(`${environment.apiUrl}/timetable/class/8`).flush({ message: 'no' }, { status: 403, statusText: 'Forbidden' });
      http.get(`${environment.apiUrl}/timetable/class/8`).subscribe({ error: () => undefined });
      ctrl.expectOne(`${environment.apiUrl}/timetable/class/8`).flush('x', { status: 500, statusText: 'Error' });
      await flush();
      expect(await done()).toEqual([]);
      http.get(`${environment.apiUrl}/timetable/class/8`).subscribe();
      ctrl.expectOne(`${environment.apiUrl}/timetable/class/8`).flush([]);
      await flush();
      expect(await done()).toEqual(['timetable']);
      ctrl.verify();
    });

    it('a redirected or blocked navigation does not complete a "find the page" step', async () => {
      as('PRINCIPAL');
      navigate('/dashboard/attendance-summary', '/dashboard/principal-dashboard');   // redirected away
      await flush();
      expect(await done()).toEqual([]);
      navigate('/dashboard/attendance-summary');
      await flush();
      expect(await done()).toEqual(['attendance']);
    });

    it('the Principal’s signature counts only when it is saved, from the page’s own request', async () => {
      as('PRINCIPAL');
      navigate('/dashboard/my-signature');
      service.observeResponse('GET', `${environment.apiUrl}/signatures/me`, { saved: false, imageBase64: null });
      await flush();
      expect(await done()).toEqual([]);
      service.observeResponse('PUT', `${environment.apiUrl}/signatures/me`, { saved: true });
      await flush();
      expect(await done()).toEqual(['signature']);
    });

    it('parents: only choosing a child themselves completes "Choose a child"', async () => {
      as('PARENT');
      parentContext.reconcile({ parent: { parentId: user.userId } as never, children: [child('a'), child('b')] });
      parentContext.select(child('b'));
      await flush();
      expect(await done()).toEqual([]);
      parentContext.select(child('a'), true);
      await flush();
      expect(await done()).toEqual(['choose-child']);
    });

    it('parents: progress is the parent’s, not a child’s — switching child keeps it', async () => {
      as('PARENT');
      navigate('/dashboard/fees/a');
      service.observeResponse('GET', `${environment.apiUrl}/student-fees/a/2026-2027`, []);
      await flush();
      parentContext.select(child('b'), true);
      await flush();
      expect((await done()).sort()).toEqual(['choose-child', 'fees']);
    });

    it('a Coordinator switching to the Teacher workspace completes that step in the Coordinator guide', async () => {
      as('TEACHER', { coordinator: true });
      workspace.select('TEACHER');
      await flush();
      expect(await done('COORDINATOR')).toEqual(['teacher-workspace']);
    });

    it('done steps stay done', async () => {
      as('STUDENT');
      const key = (await service.keyFor('STUDENT'))!;
      await service.markDone(key, ['timetable']);
      await service.markDone(key, ['timetable', 'homework']);
      expect((await service.state(key)).done).toEqual(['timetable', 'homework']);
    });
  });

  it('reads dashboard and API paths', () => {
    expect(dashboardPath('/dashboard/fees/stu_1?x=1#y')).toBe('fees/stu_1');
    expect(dashboardPath('/home')).toBeNull();
    expect(apiPath(`${environment.apiUrl}/school/setup-health?x=1`)).toBe('/school/setup-health');
    expect(apiPath('https://elsewhere.example/other')).toBeNull();
  });
});
