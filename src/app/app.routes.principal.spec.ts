import { Route } from '@angular/router';
import { routes } from './app.routes';
import { roleGuard } from './auth/role.guard';
import { principalCapabilityGuard } from './auth/principal-capability.guard';

/** Shared by the web and Android clients — keep the two copies identical. Principal screens open
 * only behind the server-owned capability check; publication and finance stay unreachable. */
describe('Principal route access', () => {
  const child = (path: string): Route => {
    const shell = routes.find(r => r.path === 'dashboard')!;
    const found = shell.children!.find(r => r.path === path);
    if (!found) throw new Error(`route ${path} missing`);
    return found;
  };

  const principalScreens: [string, string][] = [
    ['view-leaves', 'STUDENT_LEAVE_DECIDE'],
    ['teacher-leave-requests', 'TEACHER_LEAVE_DECIDE'],
    ['teacher-substitutions', 'TIMETABLE_READ'],
    ['student-list', 'STUDENT_READ'],
    ['teacher-list', 'TEACHER_READ'],
    ['timetable', 'TIMETABLE_READ'],
    ['notifications', 'OWN_INBOX'],
  ];

  principalScreens.forEach(([path, operation]) => {
    it(`${path}: Principal needs ${operation}, checked after the role guard`, () => {
      const route = child(path);
      expect(route.data?.['roles']).toContain('PRINCIPAL');
      expect(route.data?.['principalOperation']).toBe(operation);
      expect(route.canActivate).toContain(roleGuard);
      expect(route.canActivate).toContain(principalCapabilityGuard);
      expect(route.canActivate!.indexOf(roleGuard)).toBeLessThan(route.canActivate!.indexOf(principalCapabilityGuard));
    });
  });

  it('keeps fees, publication and identity administration closed to the Principal', () => {
    for (const path of ['fees', 'fee-structure', 'payment-history-admin', 'bulk-report-cards', 'register', 'admin-list', 'school-settings']) {
      const route = routes.find(r => r.path === 'dashboard')!.children!.find(r => r.path === path);
      if (route) expect(route.data?.['roles'] ?? []).not.toContain('PRINCIPAL');
    }
  });
});
