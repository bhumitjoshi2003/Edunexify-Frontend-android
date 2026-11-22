import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { routes } from '../app.routes';
import { AuthStateService } from '../auth/auth-state.service';
import { HELP_TOPICS, HelpTopicId } from './help-content';
import { HelpService, ResolvedHelp } from './help.service';
import { environment } from '../../environments/environment';

/**
 * Contextual help shows each role only its own lines and only links it could open right now.
 * Runs against this platform's real route table, so a page missing on a platform is never linked.
 * Shared by the web and Android clients — keep the two copies identical.
 */
describe('HelpService — role-aware help and authorised links', () => {
  let service: HelpService;
  let http: HttpTestingController;
  let user: { userId: string; role: string; schoolSlug: string; coordinator?: boolean };
  let features: string[];

  const auth = {
    getUser: () => user,
    getUserRole: () => user.role,
    getUserId: () => user.userId,
    hasFeature: (key: string) => ['SCHOOL_ADMINISTRATION', 'ATTENDANCE', 'LEAVE_MANAGEMENT', 'TIMETABLE', 'SCHOOL_COMMUNICATION'].includes(key) || features.includes(key),
  };
  const PRINCIPAL_CAPS = `${environment.apiUrl}/principal/capabilities`;

  function setup(role: string, opts: { coordinator?: boolean; features?: string[] } = {}): void {
    user = { userId: `u-${role}`, role, schoolSlug: 'school', coordinator: opts.coordinator };
    features = opts.features ?? ['EXAMS_RESULTS', 'REPORT_CARDS', 'FEE_MANAGEMENT', 'ONLINE_PAYMENTS', 'FEE_REMINDERS', 'BULK_IMPORT'];
  }

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes), provideHttpClient(), provideHttpClientTesting(),
        { provide: AuthStateService, useValue: auth },
        { provide: MatDialog, useValue: jasmine.createSpyObj('MatDialog', ['open']) },
      ],
    });
    service = TestBed.inject(HelpService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => { http.verify(); localStorage.clear(); });

  const resolve = (id: HelpTopicId) => firstValueFrom(service.resolve(id));
  const paths = (h: ResolvedHelp) => h.links.map(l => l.path);
  const routeExists = (path: string) =>
    !!TestBed.inject(Router).config.find(r => r.path === 'dashboard')?.children?.some(r => r.path === path && !r.redirectTo);

  it('Admin: setup links for the timetable, and the bulk import only with the Bulk Import plan feature', async () => {
    setup('ADMIN');
    expect(paths(await resolve('timetable'))).toEqual(jasmine.arrayContaining(['subject-config', 'class-management', 'school-settings', 'timetable-bulk-import']));
    setup('ADMIN', { features: ['EXAMS_RESULTS'] });
    expect(paths(await resolve('timetable'))).not.toContain('timetable-bulk-import');
  });

  it('Admin: the website-only school setup page is linked only where the page exists', async () => {
    setup('ADMIN');
    expect(paths(await resolve('school-settings')).includes('school-setup')).toBe(routeExists('school-setup'));
  });

  it('Sub-admin: sees class management, never subject or school settings links', async () => {
    setup('SUB_ADMIN');
    const h = await resolve('timetable');
    expect(h.audience).toBe('SUB_ADMIN');
    expect(paths(h)).toContain('class-management');
    expect(paths(h)).not.toContain('subject-config');
    expect(paths(h)).not.toContain('school-settings');
  });

  it('Teacher: teacher help and teacher pages only — no setup or approval links', async () => {
    setup('TEACHER');
    const timetable = await resolve('timetable');
    expect(timetable.audience).toBe('TEACHER');
    expect(timetable.links).toEqual([]);
    expect(timetable.workflows.map(w => w.title)).toContain('Add a period');
    expect(timetable.workflows.map(w => w.title)).not.toContain('Set period times');
    const leave = paths(await resolve('leave'));
    expect(leave).toEqual(jasmine.arrayContaining(['view-leaves', 'apply-teacher-leave']));
    expect(leave).not.toContain('teacher-leave-requests');
  });

  it('Coordinator workspace: coordinator help and the coordinator pages', async () => {
    setup('TEACHER', { coordinator: true });
    const leave = await resolve('leave');
    expect(leave.audience).toBe('COORDINATOR');
    expect(paths(leave)).toContain('teacher-leave-requests');
    const attendance = await resolve('attendance');
    expect(paths(attendance)).toContain('coordinator-attendance');
    expect(paths(attendance)).not.toContain('teacher-attendance');
    expect(attendance.about.map(a => a.text).join(' ')).toContain('Teacher workspace');
  });

  it('Coordinator workspace: student leave to decide, teacher leave to view only', async () => {
    setup('TEACHER', { coordinator: true });
    const leave = await resolve('leave');
    const titles = leave.workflows.map(w => w.title);
    expect(titles).toContain('Review student leave');
    expect(titles).toContain('See teacher leave');
    expect(titles).not.toContain('Review teacher leave');
    expect(paths(leave)).toEqual(jasmine.arrayContaining(['view-leaves', 'teacher-leave-requests']));
    expect(leave.about.map(a => a.text).join(' ')).toContain('cannot approve, reject or cancel');
  });

  it('Admin and Principal: decide teacher leave', async () => {
    setup('ADMIN');
    expect((await resolve('leave')).workflows.map(w => w.title)).toContain('Review teacher leave');
    setup('PRINCIPAL');
    const p = resolve('leave');
    http.expectOne(PRINCIPAL_CAPS).flush(['TEACHER_LEAVE_DECIDE']);
    const h = await p;
    expect(h.workflows.map(w => w.title)).toContain('Review teacher leave');
    expect(h.principalNote).toBeTrue();
    expect(paths(h)).toContain('teacher-leave-requests');
  });

  it('Coordinator workspace: never offers a Teacher-workspace page (which would switch the workspace)', async () => {
    setup('TEACHER', { coordinator: true });
    for (const id of Object.keys(HELP_TOPICS) as HelpTopicId[]) {
      const h = await resolve(id);
      for (const path of paths(h)) {
        expect(['timetable', 'teacher-attendance', 'apply-teacher-leave', 'report-card-approvals'].includes(path) || path.startsWith('report-cards-v2'))
          .withContext(`${id} → ${path}`).toBeFalse();
      }
    }
  });

  it('does not link the page the panel was opened on', async () => {
    setup('ADMIN');
    const h = await firstValueFrom(service.resolve('leave', 'view-leaves'));
    expect(paths(h)).not.toContain('view-leaves');
    expect(paths(h)).toContain('teacher-leave-requests');
  });

  it('Coordinator in the Teacher workspace: reads the Teacher help, with no coordinator links', async () => {
    setup('TEACHER', { coordinator: true });
    localStorage.setItem('edunexify.workspace.v1.school.u-TEACHER', 'TEACHER');
    const leave = await resolve('leave');
    expect(leave.audience).toBe('TEACHER');
    expect(paths(leave)).not.toContain('teacher-leave-requests');
    expect(paths(await resolve('attendance'))).not.toContain('coordinator-attendance');
  });

  it('Principal: a link appears only with the permission its page requires', async () => {
    setup('PRINCIPAL');
    const granted = resolve('subjects');
    http.expectOne(PRINCIPAL_CAPS).flush(['ACADEMIC_CONFIGURATION_EDIT', 'TIMETABLE_READ']);
    expect(paths(await granted)).toEqual(jasmine.arrayContaining(['class-management', 'timetable']));
    expect(paths(await resolve('subjects'))).toContain('class-management');   // cached: no second request
  });

  it('Principal: without the permission, or when it cannot be checked, the link is hidden', async () => {
    setup('PRINCIPAL');
    const none = resolve('subjects');
    http.expectOne(PRINCIPAL_CAPS).flush(['TIMETABLE_READ']);
    expect(paths(await none)).not.toContain('class-management');
    user = { ...user, userId: 'other-principal' };
    const failed = resolve('subjects');
    http.expectOne(PRINCIPAL_CAPS).flush('down', { status: 503, statusText: 'Unavailable' });
    const h = await failed;
    expect(paths(h)).not.toContain('class-management');
    expect(paths(h)).not.toContain('timetable');
  });

  it('Parent: no direct page links (pages need a selected child), but Help & Support stays', async () => {
    setup('PARENT');
    const h = await resolve('fees');
    expect(h.parentNote).toBeTrue();
    expect(h.links).toEqual([]);
    expect(h.support.map(l => l.path)).toContain('report-problem');
    expect(h.workflows.map(w => w.title)).toEqual(['Pay fees']);
  });

  it('Student: student help and student pages only', async () => {
    setup('STUDENT');
    const h = await resolve('fees');
    expect(h.problems.every(p => !p.problem.includes('Fee Rules') && !p.solution.includes('Fee Assignment'))).toBeTrue();
    expect(paths(h)).toEqual(jasmine.arrayContaining(['fee-structure', 'fees']));
    expect(paths(h)).not.toContain('fee-assignment');
  });

  it('A feature outside the school plan: only the description and a plan note, no steps or links', async () => {
    setup('ADMIN', { features: [] });
    const h = await resolve('report-cards');
    expect(h.unavailable).toBeTrue();
    expect(h.workflows).toEqual([]);
    expect(h.links).toEqual([]);
    expect(h.about.length).toBeGreaterThan(0);
  });

  it('every role sees something on every topic and never a link it could not open', async () => {
    for (const role of ['ADMIN', 'SUB_ADMIN', 'TEACHER', 'PARENT', 'STUDENT']) {
      setup(role);
      for (const id of Object.keys(HELP_TOPICS) as HelpTopicId[]) {
        const h = await resolve(id);
        expect(h.links.every(l => service.canOpen(l.path, h.audience, []))).withContext(`${role} ${id}`).toBeTrue();
      }
    }
  });
});
