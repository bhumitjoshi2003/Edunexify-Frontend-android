import { Route } from '@angular/router';
import { routes } from '../app.routes';
import { GUIDES, GuideAudience, resolveAction, routePattern } from './getting-started-guides';

/**
 * The guide definitions: short, linked only to pages each audience may open, and never to a
 * website-only page on a platform that lacks it.
 * Shared by the web and Android clients — keep the two copies identical.
 */
describe('Getting-started guides — definitions', () => {
  const dashboard = routes.find(r => r.path === 'dashboard')!.children as Route[];
  const route = (path: string) => dashboard.find(r => r.path === path);
  const ROLE: Record<GuideAudience, string> = {
    ADMIN: 'ADMIN', SUB_ADMIN: 'SUB_ADMIN', PRINCIPAL: 'PRINCIPAL', COORDINATOR: 'COORDINATOR', PARENT: 'PARENT', STUDENT: 'STUDENT',
  };

  it('stays short: at most six steps, unique ids, each with a way to complete', () => {
    for (const guide of Object.values(GUIDES)) {
      expect(guide.steps.length).toBeLessThanOrEqual(6);
      expect(new Set(guide.steps.map(s => s.id)).size).toBe(guide.steps.length);
      for (const step of guide.steps) {
        if (step.completion.kind === 'data' || step.completion.kind === 'route' || step.completion.kind === 'setup') {
          expect(step.actions.length).withContext(`${guide.audience}/${step.id}`).toBeGreaterThan(0);
        } else {
          expect(step.actions.length).withContext(`${guide.audience}/${step.id}`).toBe(0);
          expect(step.actionLabel).withContext(`${guide.audience}/${step.id}`).toBeTruthy();
        }
      }
    }
  });

  it('every step can be opened on this platform, by its own audience (route roles)', () => {
    for (const guide of Object.values(GUIDES)) {
      for (const step of guide.steps.filter(s => s.actions.length)) {
        const present = step.actions.map(a => route(a.path)).filter((r): r is Route => !!r);
        expect(present.length).withContext(`${guide.audience}/${step.id} has a page on this platform`).toBeGreaterThan(0);
        for (const r of present) {
          expect((r.data?.['roles'] ?? []) as string[]).withContext(`${guide.audience} may open ${r.path}`).toContain(ROLE[guide.audience]);
        }
      }
    }
  });

  it('School Setup is offered only where the page exists; targeted fee generation is never a step', () => {
    const readiness = GUIDES.ADMIN.steps.find(s => s.id === 'readiness')!;
    expect(readiness.actions.map(a => a.path)).toEqual(['school-setup', 'school-settings']);
    const firstPresent = readiness.actions.find(a => !!route(a.path))!.path;
    expect(firstPresent).toBe(route('school-setup') ? 'school-setup' : 'school-settings');
    const paths = Object.values(GUIDES).flatMap(g => g.steps.flatMap(s => s.actions.map(a => a.path)));
    expect(paths.some(p => p.startsWith('fee-generation-target'))).toBeFalse();
  });

  it('the Coordinator guide stays in the Coordinator workspace and never offers teacher-leave decisions', () => {
    const paths = GUIDES.COORDINATOR.steps.flatMap(s => s.actions.map(a => a.path));
    expect(paths).not.toContain('teacher-leave-requests');
    expect(paths.some(p => ['teacher-dashboard', 'teacher-checkin', 'apply-teacher-leave'].includes(p))).toBeFalse();
  });

  it('parent steps that read a child’s data name the access they need', () => {
    for (const step of GUIDES.PARENT.steps.filter(s => s.actions.length)) {
      expect(step.childPermission).withContext(step.id).toBeTruthy();
    }
  });

  it('matches route paths with parameters and fills the selected child', () => {
    expect(routePattern('fees/:studentId').test('fees/stu_1')).toBeTrue();
    expect(routePattern('fees/:studentId').test('fees')).toBeFalse();
    expect(routePattern('timetable').test('timetable/extra')).toBeFalse();
    expect(resolveAction({ label: 'x', path: 'fees/:studentId' }, 'stu_1')).toEqual({ commands: ['/dashboard', 'fees', 'stu_1'], queryParams: undefined });
    expect(resolveAction({ label: 'x', path: 'my-results', queryParams: { studentId: ':studentId' } }, 'stu_2'))
      .toEqual({ commands: ['/dashboard', 'my-results'], queryParams: { studentId: 'stu_2' } });
    expect(resolveAction({ label: 'x', path: 'fees/:studentId' }, null)).toBeNull();
  });
});
