import { DashboardComponent } from './dashboard.component';

/**
 * Back history: the role-home redirect from the bare /dashboard replaces that history entry, so Back
 * from the role home never lands on /dashboard and bounces forward again. Real navigation (a
 * Coordinator switching workspace) and the expired-Admin redirect keep normal history entries.
 * Same expectations on the website and Android.
 */
describe('DashboardComponent — redirect history', () => {
  function shell(role: string, url = '/dashboard', subscriptionStatus: string | null = null) {
    const router = { url, navigate: jasmine.createSpy('navigate').and.resolveTo(true), navigateByUrl: jasmine.createSpy('navigateByUrl').and.resolveTo(true) };
    const c: any = Object.create(DashboardComponent.prototype);
    Object.defineProperty(c, 'subscriptionStatus', { get: () => subscriptionStatus });   // a getter on the component
    Object.assign(c, {
      router, Role: role,
      workspace: { homeRoute: () => '/dashboard/coordinator-dashboard', hasChoice: () => true, active: () => 'COORDINATOR', select: () => 'TEACHER' },
      cdr: { markForCheck: () => {} },
    });
    return { c, router };
  }

  for (const [role, home] of [
    ['STUDENT', '/dashboard/student-dashboard'], ['TEACHER', '/dashboard/coordinator-dashboard'], ['PRINCIPAL', '/dashboard/principal-dashboard'],
    ['ADMIN', '/dashboard/admin-dashboard'], ['SUB_ADMIN', '/dashboard/admin-dashboard'], ['PARENT', '/dashboard/parent-dashboard'],
    ['SUPER_ADMIN', '/dashboard/super-admin-dashboard'],
  ]) {
    it(`${role}: the redirect to ${home} replaces the bare /dashboard entry`, () => {
      const { c, router } = shell(role);
      c.handleInitialNavigation();
      expect(router.navigate).toHaveBeenCalledOnceWith([home], { replaceUrl: true });
    });
  }

  it('does not redirect (or touch history) on a page other than the bare /dashboard', () => {
    const { c, router } = shell('STUDENT', '/dashboard/timetable');
    c.handleInitialNavigation();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('keeps the expired-Admin redirect to Settings unchanged', () => {
    const { c, router } = shell('ADMIN', '/dashboard/timetable', 'EXPIRED');
    c.handleInitialNavigation();
    const [, extras] = router.navigate.calls.mostRecent().args;
    expect(extras.replaceUrl).toBeUndefined();
  });

  it('a Coordinator switching workspace is real navigation: a normal history entry', () => {
    const { c, router } = shell('TEACHER', '/dashboard/coordinator-dashboard');
    c.switchWorkspace('TEACHER');
    expect(router.navigateByUrl).toHaveBeenCalledOnceWith('/dashboard/coordinator-dashboard');
  });
});
