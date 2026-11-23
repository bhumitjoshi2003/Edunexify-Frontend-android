import { AppComponent } from './app.component';
import { AndroidBackService } from './core/android-back.service';

/**
 * Android hardware Back: close the topmost dismissible thing first (dialog, popup, drawer — one per
 * press), otherwise go back, and leave the app only when the WebView has no history entry left.
 */
describe('AppComponent — Android hardware Back', () => {
  let dialogs: { openDialogs: { disableClose: boolean; close: jasmine.Spy }[] };
  let container: HTMLElement;
  let back: AndroidBackService;
  let app: AppComponent;
  let goBack: jasmine.Spy;
  let exitApp: jasmine.Spy;

  const dialog = (disableClose = false) => ({ disableClose, close: jasmine.createSpy('close') });
  function backdrop(): jasmine.Spy {
    const el = document.createElement('div');
    el.className = 'cdk-overlay-backdrop cdk-overlay-backdrop-showing';
    const click = jasmine.createSpy('backdropClick');
    el.addEventListener('click', click);
    container.appendChild(el);
    return click;
  }

  beforeEach(() => {
    dialogs = { openDialogs: [] };
    container = document.createElement('div');
    back = new AndroidBackService();
    app = new AppComponent({} as any, dialogs as any, {} as any, {} as any, {} as any, { start: () => {} } as any,
      { getContainerElement: () => container } as any, back);
    goBack = spyOn(app as any, 'goBack');
    exitApp = spyOn(app as any, 'exitApp');
  });

  it('closes only the topmost dialog and does not navigate', () => {
    const lower = dialog(), top = dialog();
    dialogs.openDialogs = [lower, top];
    app.onHardwareBack(true);
    expect(top.close).toHaveBeenCalled();
    expect(lower.close).not.toHaveBeenCalled();
    expect(goBack).not.toHaveBeenCalled();
  });

  it('respects disableClose: the dialog stays and Back does nothing else', () => {
    const locked = dialog(true);
    dialogs.openDialogs = [locked];
    const closeMenu = jasmine.createSpy('menu').and.returnValue(true);
    back.register('popup', closeMenu);
    app.onHardwareBack(true);
    expect(locked.close).not.toHaveBeenCalled();
    expect(closeMenu).not.toHaveBeenCalled();
    expect(goBack).not.toHaveBeenCalled();
    expect(exitApp).not.toHaveBeenCalled();
  });

  it('then closes the profile menu through its own close API, before any other popup or the drawer', () => {
    const closeMenu = jasmine.createSpy('menu').and.returnValue(true);
    const closeDrawer = jasmine.createSpy('drawer').and.returnValue(true);
    back.register('popup', closeMenu);
    back.register('panel', closeDrawer);
    const other = backdrop();
    app.onHardwareBack(true);
    expect(closeMenu).toHaveBeenCalled();
    expect(other).not.toHaveBeenCalled();
    expect(closeDrawer).not.toHaveBeenCalled();
    expect(goBack).not.toHaveBeenCalled();
  });

  it('then closes another open popup (select, date picker) like an outside tap — the topmost only', () => {
    const lower = backdrop(), top = backdrop();
    const closeDrawer = jasmine.createSpy('drawer').and.returnValue(true);
    back.register('popup', () => false);
    back.register('panel', closeDrawer);
    app.onHardwareBack(true);
    expect(top).toHaveBeenCalled();
    expect(lower).not.toHaveBeenCalled();
    expect(closeDrawer).not.toHaveBeenCalled();
  });

  it('then closes the mobile sidebar drawer', () => {
    const closeDrawer = jasmine.createSpy('drawer').and.returnValue(true);
    back.register('panel', closeDrawer);
    app.onHardwareBack(true);
    expect(closeDrawer).toHaveBeenCalled();
    expect(goBack).not.toHaveBeenCalled();
  });

  it('with nothing open: goes back when there is history, and exits only when there is none', () => {
    back.register('popup', () => false);
    back.register('panel', () => false);
    app.onHardwareBack(true);
    expect(goBack).toHaveBeenCalledTimes(1);
    expect(exitApp).not.toHaveBeenCalled();
    app.onHardwareBack(false);
    expect(exitApp).toHaveBeenCalledTimes(1);
    expect(goBack).toHaveBeenCalledTimes(1);
  });
});
