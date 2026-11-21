import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { StartupRecoveryComponent } from './startup-recovery.component';
import { StartupService } from '../../core/startup.service';
import { AuthStateService, UserInfo } from '../../auth/auth-state.service';
import { STARTUP_SLOW_NOTICE_MS } from '../../core/startup.constants';
import { setIntendedRouteSchoolResolver } from '../../auth/redirect-url.util';

describe('StartupRecoveryComponent', () => {
  let startupService: jasmine.SpyObj<StartupService>;
  let authState: AuthStateService;
  let router: Router;

  const userInfo: UserInfo = {
    userId: 'T1', role: 'TEACHER', name: null, className: null, schoolSlug: null,
    featureKeys: null, planTier: null, planVersion: null, subscriptionStatus: null,
    trialEndsAt: null, expiresAt: null, graceEndsAt: null, permissionKeys: null,
  };

  beforeEach(async () => {
    startupService = jasmine.createSpyObj('StartupService', ['retry']);
    await TestBed.configureTestingModule({
      imports: [StartupRecoveryComponent, RouterTestingModule, HttpClientTestingModule],
      providers: [{ provide: StartupService, useValue: startupService }],
    }).compileComponents();
    authState = TestBed.inject(AuthStateService);
    router = TestBed.inject(Router);
    spyOn(router, 'navigateByUrl').and.resolveTo(true);
    localStorage.removeItem('redirectUrl');
    // TenantService registers a module-wide school resolver; a spec that ran earlier may have
    // left one behind, so this suite starts from "no school" like a fresh app.
    setIntendedRouteSchoolResolver(() => null);
  });

  afterEach(() => localStorage.removeItem('redirectUrl'));

  function create(variant: 'unavailable' | 'offline' | 'loading') {
    const fixture = TestBed.createComponent(StartupRecoveryComponent);
    fixture.componentInstance.variant = variant;
    fixture.detectChanges();
    return fixture;
  }

  // ─── Copy per variant ─────────────────────────────────────────────────────

  it('unavailable: shows the polished "trouble connecting" copy, no infrastructure jargon', () => {
    const fixture = create('unavailable');
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('We’re having trouble connecting');
    expect(text).toContain('Try Again');
    expect(text.toLowerCase()).not.toContain('postgres');
    expect(text.toLowerCase()).not.toContain('neon');
    expect(text.toLowerCase()).not.toContain('redis');
    expect(text.toLowerCase()).not.toContain('503');
    expect(text.toLowerCase()).not.toContain('database');
  });

  it('offline: shows the distinct offline copy', () => {
    const fixture = create('offline');
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('You appear to be offline');
    expect(text).toContain('Check your internet connection');
  });

  it('loading: shows the initial "getting ready" copy with no Retry button', () => {
    const fixture = create('loading');
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.textContent).toContain('Getting Edunexify ready');
    expect(compiled.querySelector('.sr-retry-btn')).toBeNull();
  });

  it('loading: switches to "taking longer than usual" after the slow-notice threshold', fakeAsync(() => {
    const fixture = create('loading');
    tick(STARTUP_SLOW_NOTICE_MS - 1);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Getting Edunexify ready');

    tick(1);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('taking a little longer than usual');

    // No leftover timer errors on destroy.
    fixture.destroy();
  }));

  it('session note appears for unavailable/offline but not for loading', () => {
    expect(create('unavailable').nativeElement.textContent).toContain('Your session is still here');
    expect(create('offline').nativeElement.textContent).toContain('Your session is still here');
    expect(create('loading').nativeElement.textContent).not.toContain('Your session is still here');
  });

  // ─── Retry behavior ───────────────────────────────────────────────────────

  it('clicking Try Again shows a loading state and disables the button while retrying', fakeAsync(() => {
    let resolveRetry!: () => void;
    startupService.retry.and.returnValue(new Promise<void>(res => { resolveRetry = res; }));
    const fixture = create('unavailable');
    const btn = () => fixture.nativeElement.querySelector('.sr-retry-btn') as HTMLButtonElement;

    btn().click();
    fixture.detectChanges();
    expect(btn().disabled).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain('Trying again');

    resolveRetry();
    tick();
    fixture.detectChanges();
    expect(startupService.retry).toHaveBeenCalledTimes(1);
  }));

  it('ignores a second click while a retry is already in flight', fakeAsync(() => {
    let resolveRetry!: () => void;
    startupService.retry.and.returnValue(new Promise<void>(res => { resolveRetry = res; }));
    const fixture = create('unavailable');
    const btn = () => fixture.nativeElement.querySelector('.sr-retry-btn') as HTMLButtonElement;

    btn().click();
    fixture.detectChanges();
    btn().click(); // no-op: disabled and retrying guard both prevent re-entry
    fixture.detectChanges();

    resolveRetry();
    tick();

    expect(startupService.retry).toHaveBeenCalledTimes(1);
  }));

  it('a successful retry (now AUTHENTICATED) navigates to the saved intended route', fakeAsync(() => {
    localStorage.setItem('redirectUrl', JSON.stringify({ url: '/dashboard/teacher-attendance', school: null }));
    startupService.retry.and.callFake(async () => { authState.setUser(userInfo); });
    const fixture = create('unavailable');

    fixture.nativeElement.querySelector('.sr-retry-btn').click();
    tick();

    expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard/teacher-attendance');
  }));

  it('a retry that resolves to UNAUTHENTICATED does not navigate — the login flow takes over via router-outlet', fakeAsync(() => {
    startupService.retry.and.callFake(async () => { authState.clearUser(); });
    const fixture = create('unavailable');

    fixture.nativeElement.querySelector('.sr-retry-btn').click();
    tick();

    expect(router.navigateByUrl).not.toHaveBeenCalled();
  }));

  it('a retry that is still unavailable leaves the Retry button usable again (no navigation)', fakeAsync(() => {
    startupService.retry.and.resolveTo(); // status stays whatever it already was — still not AUTHENTICATED
    const fixture = create('unavailable');
    const btn = () => fixture.nativeElement.querySelector('.sr-retry-btn') as HTMLButtonElement;

    btn().click();
    tick();
    fixture.detectChanges();

    expect(router.navigateByUrl).not.toHaveBeenCalled();
    expect(btn().disabled).toBeFalse();
  }));

  // ─── Offline reconnect ────────────────────────────────────────────────────

  it('offline: firing the browser "online" event triggers exactly one automatic retry', fakeAsync(() => {
    startupService.retry.and.resolveTo();
    create('offline');

    window.dispatchEvent(new Event('online'));
    tick();
    window.dispatchEvent(new Event('online')); // a second reconnect blip must not spam retries
    tick();

    expect(startupService.retry).toHaveBeenCalledTimes(1);
  }));

  it('unavailable/loading variants do not listen for the online event', fakeAsync(() => {
    startupService.retry.and.resolveTo();
    create('unavailable');

    window.dispatchEvent(new Event('online'));
    tick();

    expect(startupService.retry).not.toHaveBeenCalled();
  }));
});
