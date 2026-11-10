import { Route } from '@angular/router';
import { routes } from './app.routes';
import { roleGuard } from './auth/role.guard';
import { principalCapabilityGuard } from './auth/principal-capability.guard';

/** Shared by the web and Android clients — keep the two copies identical. The Principal reaches the
 * academic-configuration screens through the server-owned capability check, Admin keeps its access,
 * and rollover, school-ownership, billing and platform screens stay closed to the Principal. */
describe('Academic configuration route access', () => {
  const child = (path: string): Route | undefined =>
    routes.find(r => r.path === 'dashboard')!.children!.find(r => r.path === path);

  const principalScreens: [string, string][] = [
    ['class-management', 'ACADEMIC_CONFIGURATION_EDIT'],
    ['subject-config', 'ACADEMIC_CONFIGURATION_EDIT'],
    ['exam-config', 'ACADEMIC_CONFIGURATION_EDIT'],
    ['assessment-groups', 'ACADEMIC_CONFIGURATION_EDIT'],
    ['student-stream', 'STUDENT_ACADEMIC_EDIT'],
    ['elective-assignment', 'STUDENT_ACADEMIC_EDIT'],
    ['timetable', 'TIMETABLE_READ'],
    ['manage-assessments', 'ASSESSMENT_CALENDAR_EDIT'],
  ];

  principalScreens.forEach(([path, operation]) => {
    it(`${path}: Principal needs ${operation} after the role guard; Admin is unchanged`, () => {
      const route = child(path)!;
      const roles = route.data?.['roles'] as string[];
      expect(roles).toContain('PRINCIPAL');
      expect(roles).toContain('ADMIN');
      expect(route.data?.['principalOperation']).toBe(operation);
      expect(route.canActivate).toContain(roleGuard);
      expect(route.canActivate).toContain(principalCapabilityGuard);
      expect(route.canActivate!.indexOf(roleGuard)).toBeLessThan(route.canActivate!.indexOf(principalCapabilityGuard));
    });
  });

  it('keeps assessments open to teachers', () => {
    expect(child('manage-assessments')!.data?.['roles']).toContain('TEACHER');
  });

  it('keeps rollover, ownership, billing and platform screens closed to the Principal', () => {
    for (const path of ['student-promotion', 'school-settings', 'timetable-bulk-import', 'fee-structure', 'bus-fees', 'fee-head-management',
        'fee-assignment', 'payment-history-admin', 'admin-list', 'register-admin', 'principal-management', 'audit-logs', 'analytics',
        'super-admin-dashboard', 'school-setup']) {
      const route = child(path);
      if (route) expect(route.data?.['roles'] ?? []).not.toContain('PRINCIPAL', path);
    }
  });
});
