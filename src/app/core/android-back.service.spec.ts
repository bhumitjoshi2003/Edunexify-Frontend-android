import { AndroidBackService } from './android-back.service';

/** Android hardware Back: components that are on screen close themselves, newest first, one per press. */
describe('AndroidBackService', () => {
  it('closes the most recently registered open item of a layer, and reports when nothing was open', () => {
    const back = new AndroidBackService();
    const calls: string[] = [];
    let olderOpen = true, newerOpen = true;
    back.register('popup', () => { if (!olderOpen) return false; calls.push('older'); olderOpen = false; return true; });
    back.register('popup', () => { if (!newerOpen) return false; calls.push('newer'); newerOpen = false; return true; });
    expect(back.closeTopmost('popup')).toBeTrue();
    expect(calls).toEqual(['newer']);                 // only the topmost per press
    expect(back.closeTopmost('popup')).toBeTrue();
    expect(calls).toEqual(['newer', 'older']);
    expect(back.closeTopmost('popup')).toBeFalse();
    expect(back.closeTopmost('panel')).toBeFalse();   // layers are separate
  });

  it('forgets a handler once its component unregisters', () => {
    const back = new AndroidBackService();
    const close = jasmine.createSpy('close').and.returnValue(true);
    const unregister = back.register('panel', close);
    unregister();
    expect(back.closeTopmost('panel')).toBeFalse();
    expect(close).not.toHaveBeenCalled();
  });
});
