import { DashboardComponent } from './dashboard.component';

/** The Android update card slides up on a downward scroll and hides at the top or on an upward
 * scroll, so it never covers the AI Copilot button when the page first opens. */
describe('DashboardComponent — update banner reveal on scroll', () => {
  let c: any;
  let markForCheck: jasmine.Spy;

  const scrollTo = (top: number) => c.onContentScroll({ target: { scrollTop: top } } as unknown as Event);

  beforeEach(() => {
    c = Object.create(DashboardComponent.prototype);
    markForCheck = jasmine.createSpy('markForCheck');
    c.cdr = { markForCheck };
    c.showUpdateBanner = true;
    c.updateBannerRevealed = false;
    c.lastScrollTop = 0;
  });

  it('is hidden on arrival at the top of the page', () => {
    expect(c.updateBannerRevealed).toBeFalse();
    scrollTo(0);
    scrollTo(10);
    expect(c.updateBannerRevealed).toBeFalse();
    expect(markForCheck).not.toHaveBeenCalled();
  });

  it('slides in after scrolling down a little, and stays while scrolling down', () => {
    scrollTo(30);
    expect(c.updateBannerRevealed).toBeFalse(); // not far enough yet
    scrollTo(120);
    expect(c.updateBannerRevealed).toBeTrue();
    scrollTo(400);
    expect(c.updateBannerRevealed).toBeTrue();
    expect(markForCheck).toHaveBeenCalledTimes(1);
  });

  it('hides again when scrolling up, and when back at the top', () => {
    scrollTo(300);
    expect(c.updateBannerRevealed).toBeTrue();
    scrollTo(280);
    expect(c.updateBannerRevealed).toBeFalse();
    scrollTo(500);
    expect(c.updateBannerRevealed).toBeTrue();
    scrollTo(0);
    expect(c.updateBannerRevealed).toBeFalse();
  });

  it('ignores tiny jitter so it does not flicker', () => {
    scrollTo(300);
    expect(c.updateBannerRevealed).toBeTrue();
    scrollTo(296);
    scrollTo(302);
    expect(c.updateBannerRevealed).toBeTrue();
  });

  it('does nothing when no update is available', () => {
    c.showUpdateBanner = false;
    scrollTo(500);
    expect(c.updateBannerRevealed).toBeFalse();
    expect(markForCheck).not.toHaveBeenCalled();
  });

  it('starts hidden again on a new page', () => {
    scrollTo(300);
    expect(c.updateBannerRevealed).toBeTrue();
    c.resetUpdateBannerReveal();
    expect(c.updateBannerRevealed).toBeFalse();
    expect(c.lastScrollTop).toBe(0);
  });
  describe('when the page itself scrolls (phones: the content area does not scroll)', () => {
    let pageTop = 0;
    const scrollPage = (top: number) => { pageTop = top; c.onPageScroll(); };

    beforeEach(() => { c.pageScrollTop = () => pageTop; pageTop = 0; });

    it('slides in on a downward page scroll and hides on an upward one', () => {
      scrollPage(300);
      expect(c.updateBannerRevealed).toBeTrue();
      scrollPage(500);
      expect(c.updateBannerRevealed).toBeTrue();
      scrollPage(420);
      expect(c.updateBannerRevealed).toBeFalse();
      scrollPage(700);
      expect(c.updateBannerRevealed).toBeTrue();
      scrollPage(0);
      expect(c.updateBannerRevealed).toBeFalse();
    });

    it('stays hidden when no update is available', () => {
      c.showUpdateBanner = false;
      scrollPage(400);
      expect(c.updateBannerRevealed).toBeFalse();
    });
  });
});
