import { DashboardComponent } from './dashboard.component';

/** Android hardware Back: the shell closes its own profile menu and mobile drawer (their own close APIs). */
describe('DashboardComponent — Android hardware Back', () => {
  function shell() {
    const c: any = Object.create(DashboardComponent.prototype);
    Object.assign(c, { mobileSidebarOpen: false, cdr: { markForCheck: () => {} } });
    return c;
  }

  it('closes the profile menu only when it is open', () => {
    const c = shell();
    c.profileMenuTrigger = { menuOpen: false, closeMenu: jasmine.createSpy('closeMenu') };
    expect(c.closeProfileMenuOnBack()).toBeFalse();
    c.profileMenuTrigger.menuOpen = true;
    expect(c.closeProfileMenuOnBack()).toBeTrue();
    expect(c.profileMenuTrigger.closeMenu).toHaveBeenCalledTimes(1);
    c.profileMenuTrigger = undefined;                    // no header (yet)
    expect(c.closeProfileMenuOnBack()).toBeFalse();
  });

  it('closes the mobile drawer only when it is open', () => {
    const c = shell();
    expect(c.closeMobileSidebarOnBack()).toBeFalse();
    c.mobileSidebarOpen = true;
    expect(c.closeMobileSidebarOnBack()).toBeTrue();
    expect(c.mobileSidebarOpen).toBeFalse();
  });
});
