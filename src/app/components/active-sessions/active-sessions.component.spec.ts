import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { ActiveSessionsComponent } from './active-sessions.component';
import { SessionService } from '../../services/session.service';
import { ToastService } from '../../services/toast.service';
import { LoggerService } from '../../services/logger.service';
import { UserSession } from '../../interfaces/user-session';
import { SignOutService } from '../../services/sign-out.service';

/** Shared by the web and Android clients — keep the two copies identical. */
describe('ActiveSessionsComponent', () => {
  let component: ActiveSessionsComponent;
  let fixture: ComponentFixture<ActiveSessionsComponent>;
  let sessionServiceSpy: jasmine.SpyObj<SessionService>;
  let toastSpy: jasmine.SpyObj<ToastService>;
  let signOutSpy: jasmine.SpyObj<SignOutService>;

  const currentSession: UserSession = {
    id: 1, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/128.0.0.0 Safari/537.36',
    ipAddress: '1.1.1.1', createdAt: '2026-09-16T10:00:00Z', lastUsedAt: '2026-09-17T09:00:00Z',
    expiresAt: '2026-09-24T10:00:00Z', current: true,
  };
  const otherSession: UserSession = {
    id: 2, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/128.0.0.0 Safari/537.36',
    ipAddress: '2.2.2.2', createdAt: '2026-09-15T10:00:00Z', lastUsedAt: '2026-09-16T09:00:00Z',
    expiresAt: '2026-09-23T10:00:00Z', current: false,
  };

  beforeEach(async () => {
    sessionServiceSpy = jasmine.createSpyObj('SessionService', ['list', 'revoke', 'revokeOthers']);
    toastSpy = jasmine.createSpyObj('ToastService', ['confirm', 'success', 'error']);
    signOutSpy = jasmine.createSpyObj('SignOutService', ['signOut', 'signOutEverywhere']);
    signOutSpy.signOutEverywhere.and.resolveTo();

    await TestBed.configureTestingModule({
      imports: [ActiveSessionsComponent],
      providers: [
        { provide: SessionService, useValue: sessionServiceSpy },
        { provide: ToastService, useValue: toastSpy },
        { provide: SignOutService, useValue: signOutSpy },
        { provide: LoggerService, useValue: jasmine.createSpyObj('LoggerService', ['error', 'warn', 'info']) },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ActiveSessionsComponent);
    component = fixture.componentInstance;
  });

  it('shows the loading state before the list resolves', () => {
    sessionServiceSpy.list.and.returnValue(of([]));
    expect(component.loading).toBeTrue();
  });

  it('loads and renders the session list successfully', () => {
    sessionServiceSpy.list.and.returnValue(of([currentSession, otherSession]));
    fixture.detectChanges();

    expect(component.loading).toBeFalse();
    expect(component.loadError).toBeFalse();
    expect(component.sessions.length).toBe(2);
  });

  it('shows an error state (not an indefinite spinner) and supports retry', () => {
    sessionServiceSpy.list.and.returnValue(throwError(() => new Error('network down')));
    fixture.detectChanges();

    expect(component.loading).toBeFalse();
    expect(component.loadError).toBeTrue();

    // list() resolves synchronously here (of(...)), so by the time retry()
    // returns, the transient loading=true has already settled back to false —
    // what matters is that the error clears and the retried data loads.
    sessionServiceSpy.list.and.returnValue(of([currentSession]));
    component.retry();
    expect(component.loading).toBeFalse();
    expect(component.loadError).toBeFalse();
    expect(component.sessions).toEqual([currentSession]);
  });

  it('identifies the current session using only session.current, never device/browser/IP', () => {
    sessionServiceSpy.list.and.returnValue(of([currentSession, otherSession]));
    fixture.detectChanges();

    expect(component.current).toEqual(currentSession);
    expect(component.otherSessions).toEqual([otherSession]);
  });

  it('renders the current session card with a CURRENT SESSION badge and no revoke/log-out action', () => {
    sessionServiceSpy.list.and.returnValue(of([currentSession]));
    fixture.detectChanges();

    // "SESSION" is its own span (hidden at narrow widths, see .as-status-badge-full)
    // so the full text only assembles correctly via textContent, not innerHTML.
    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('CURRENT');
    expect(text).toContain('SESSION');
    const currentBlock = fixture.nativeElement.querySelector('.as-current-card');
    expect(currentBlock).not.toBeNull();
    expect(currentBlock.querySelector('button')).toBeNull();
  });

  it('renders a "Log out" button for a non-current session', () => {
    sessionServiceSpy.list.and.returnValue(of([currentSession, otherSession]));
    fixture.detectChanges();

    const buttons: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('.as-btn-danger-sm'));
    expect(buttons.length).toBe(1);
  });

  it('shows a polished empty state when only the current session exists', () => {
    sessionServiceSpy.list.and.returnValue(of([currentSession]));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain("You're not signed in anywhere else");
    expect(fixture.nativeElement.querySelector('.as-empty-card')).not.toBeNull();
  });

  it('log out everywhere: confirmed, it signs out every session through the sign-out adapter', async () => {
    sessionServiceSpy.list.and.returnValue(of([currentSession, otherSession]));
    fixture.detectChanges();
    toastSpy.confirm.and.resolveTo(true);

    await component.logOutEverywhere();

    expect(signOutSpy.signOutEverywhere).toHaveBeenCalledTimes(1);
    expect(sessionServiceSpy.revokeOthers).not.toHaveBeenCalled();
  });

  it('log out everywhere: cancelling does nothing', async () => {
    sessionServiceSpy.list.and.returnValue(of([currentSession, otherSession]));
    fixture.detectChanges();
    toastSpy.confirm.and.resolveTo(false);
    await component.logOutEverywhere();
    expect(signOutSpy.signOutEverywhere).not.toHaveBeenCalled();
  });

  it('log out everywhere: if the server call fails, says so and stays signed in', async () => {
    sessionServiceSpy.list.and.returnValue(of([currentSession, otherSession]));
    fixture.detectChanges();
    toastSpy.confirm.and.resolveTo(true);
    signOutSpy.signOutEverywhere.and.rejectWith({ status: 0 });
    await component.logOutEverywhere();
    expect(toastSpy.error).toHaveBeenCalledWith('Error', jasmine.stringMatching(/still signed in/));
    expect(component.signingOutEverywhere).toBeFalse();
  });

  it('revoking another session never touches this device\'s sign-in', async () => {
    sessionServiceSpy.list.and.returnValue(of([currentSession, otherSession]));
    sessionServiceSpy.revoke.and.returnValue(of('Session revoked.'));
    fixture.detectChanges();
    toastSpy.confirm.and.resolveTo(true);
    await component.revoke(otherSession);
    expect(signOutSpy.signOut).not.toHaveBeenCalled();
    expect(signOutSpy.signOutEverywhere).not.toHaveBeenCalled();
    expect(component.current?.id).toBe(1);
  });

  it('when the server could not identify this device, "log out all others" is not offered', async () => {
    sessionServiceSpy.list.and.returnValue(of([{ ...currentSession, current: false }, otherSession]));
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="revoke-others"]')).toBeNull();
    expect(root.querySelector('[data-testid="current-unknown"]')).not.toBeNull();
    await component.revokeOthers();
    expect(toastSpy.confirm).not.toHaveBeenCalled();
    expect(sessionServiceSpy.revokeOthers).not.toHaveBeenCalled();
  });

  it('an expired or revoked session (401) shows the load error; the auth interceptor handles the sign-out', () => {
    sessionServiceSpy.list.and.returnValue(throwError(() => ({ status: 401 })));
    fixture.detectChanges();
    expect(component.loadError).toBeTrue();
    expect(signOutSpy.signOut).not.toHaveBeenCalled();
  });

  it('revoke: cancelling the confirmation never calls the API', async () => {
    sessionServiceSpy.list.and.returnValue(of([currentSession, otherSession]));
    fixture.detectChanges();
    toastSpy.confirm.and.resolveTo(false);

    await component.revoke(otherSession);

    expect(sessionServiceSpy.revoke).not.toHaveBeenCalled();
  });

  it('revoke: confirming calls the API and removes the session from the list', async () => {
    sessionServiceSpy.list.and.returnValue(of([currentSession, otherSession]));
    fixture.detectChanges();
    toastSpy.confirm.and.resolveTo(true);
    sessionServiceSpy.revoke.and.returnValue(of('Session revoked.'));

    await component.revoke(otherSession);

    expect(sessionServiceSpy.revoke).toHaveBeenCalledWith(otherSession.id);
    expect(component.sessions).toEqual([currentSession]);
  });

  it('revoke-others: confirming calls the API and reloads the list', async () => {
    sessionServiceSpy.list.and.returnValues(
      of([currentSession, otherSession]),
      of([currentSession]),
    );
    fixture.detectChanges();
    toastSpy.confirm.and.resolveTo(true);
    sessionServiceSpy.revokeOthers.and.returnValue(of({ revokedCount: 1 }));

    await component.revokeOthers();

    expect(sessionServiceSpy.revokeOthers).toHaveBeenCalled();
    expect(sessionServiceSpy.list).toHaveBeenCalledTimes(2);
    expect(component.sessions).toEqual([currentSession]);
  });

  it('revoke-others: cancelling the confirmation never calls the API', async () => {
    sessionServiceSpy.list.and.returnValue(of([currentSession, otherSession]));
    fixture.detectChanges();
    toastSpy.confirm.and.resolveTo(false);

    await component.revokeOthers();

    expect(sessionServiceSpy.revokeOthers).not.toHaveBeenCalled();
  });
});
