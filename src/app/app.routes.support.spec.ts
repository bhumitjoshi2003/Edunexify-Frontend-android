import { Route } from '@angular/router';
import { routes } from './app.routes';
import { roleGuard } from './auth/role.guard';
import { principalCapabilityGuard } from './auth/principal-capability.guard';

/** Shared by the web and Android clients — keep the two copies identical. Every school role,
 * the Principal included, can report a platform problem and follow their own requests; the
 * Principal's access still passes the server-owned capability check. The SUPER_ADMIN queue
 * stays closed to every school role. */
describe('Support route access', () => {
  const child = (path: string): Route => {
    const shell = routes.find(r => r.path === 'dashboard')!;
    const found = shell.children!.find(r => r.path === path);
    if (!found) throw new Error(`route ${path} missing`);
    return found;
  };

  for (const path of ['report-problem', 'my-support-requests']) {
    it(`${path}: open to the Principal behind OWN_SUPPORT, and unchanged for other roles`, () => {
      const route = child(path);
      const roles = route.data?.['roles'] as string[];
      expect(roles).toEqual(['STUDENT', 'TEACHER', 'ADMIN', 'SUB_ADMIN', 'PARENT', 'PRINCIPAL']);
      expect(roles).not.toContain('SUPER_ADMIN');
      expect(route.data?.['principalOperation']).toBe('OWN_SUPPORT');
      expect(route.canActivate).toContain(roleGuard);
      expect(route.canActivate).toContain(principalCapabilityGuard);
      expect(route.canActivate!.indexOf(roleGuard)).toBeLessThan(route.canActivate!.indexOf(principalCapabilityGuard));
    });
  }

  it('keeps the global support queue for SUPER_ADMIN only', () => {
    expect(child('support-queue').data?.['roles']).toEqual(['SUPER_ADMIN']);
  });
});
