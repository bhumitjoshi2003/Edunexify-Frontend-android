import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { Subject, takeUntil } from 'rxjs';
import { SessionService } from '../../services/session.service';
import { UserSession } from '../../interfaces/user-session';
import { ToastService } from '../../services/toast.service';
import { LoggerService } from '../../services/logger.service';
import { deviceLabel, deviceIcon } from '../../utils/device-label.util';
import { partitionSessions, withoutSession } from '../../utils/session-security.util';
import { SignOutService } from '../../services/sign-out.service';

/** Lets a signed-in user see and manage their own active sessions — one login
 * instance each, never a physical device (two browsers on the same laptop are
 * two independent sessions). Every action here is scoped to the caller's own
 * account server-side; nothing here can see or touch another user's sessions.
 * Shared by the web and Android clients — keep the TypeScript identical (layout per platform).
 *
 *  - Log out one other session / all other sessions: this device stays signed in.
 *  - Log out everywhere: every session including this one; local sign-out follows (SignOutService).
 *  - This device alone: the normal Sign Out in the menu.
 * An expired or revoked session surfaces as a 401 that the auth interceptor turns into a sign-out;
 * this page only reports that it couldn't load. */
@Component({
  selector: 'app-active-sessions',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './active-sessions.component.html',
  styleUrl: './active-sessions.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ActiveSessionsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  sessions: UserSession[] = [];
  loading = true;
  loadError = false;
  revokingId: number | null = null;
  revokingOthers = false;
  signingOutEverywhere = false;

  constructor(
    private sessionService: SessionService,
    private toast: ToastService,
    private logger: LoggerService,
    private cdr: ChangeDetectorRef,
    private signOut: SignOutService,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private load(): void {
    this.loading = true;
    this.loadError = false;
    this.cdr.markForCheck();
    this.sessionService.list().pipe(takeUntil(this.destroy$)).subscribe({
      next: (sessions) => {
        this.sessions = sessions;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.logger.error('Error loading active sessions:', err);
        this.loading = false;
        this.loadError = true;
        this.cdr.markForCheck();
      },
    });
  }

  retry(): void {
    this.load();
  }

  get current(): UserSession | undefined {
    return partitionSessions(this.sessions).current;
  }

  get otherSessions(): UserSession[] {
    return partitionSessions(this.sessions).others;
  }

  /** False when the server couldn't identify this device: "others" would then include it. */
  get canRevokeOthers(): boolean {
    return partitionSessions(this.sessions).canRevokeOthers;
  }

  get currentKnown(): boolean {
    return partitionSessions(this.sessions).currentKnown;
  }

  label(session: UserSession): string {
    return deviceLabel(session.userAgent);
  }

  icon(session: UserSession): string {
    return deviceIcon(session.userAgent);
  }

  async revoke(session: UserSession): Promise<void> {
    const confirmed = await this.toast.confirm({
      title: 'Log out this session?',
      message: `This will sign out "${this.label(session)}". You can always sign back in there.`,
      confirmText: 'Log out',
      cancelText: 'Cancel',
      danger: true,
    });
    if (!confirmed) return;

    this.revokingId = session.id;
    this.cdr.markForCheck();
    this.sessionService.revoke(session.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.sessions = withoutSession(this.sessions, session.id);
        this.revokingId = null;
        this.toast.success('Signed out', 'That session has been logged out.');
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.revokingId = null;
        this.cdr.markForCheck();
        this.logger.error('Error revoking session:', err);
        this.toast.error('Error', 'Could not log out that session. Please try again.');
      },
    });
  }

  async revokeOthers(): Promise<void> {
    if (!this.canRevokeOthers) return;
    const confirmed = await this.toast.confirm({
      title: 'Log out all other sessions?',
      message: 'Every other place you\'re signed in will be logged out. This session stays signed in.',
      confirmText: 'Log out others',
      cancelText: 'Cancel',
      danger: true,
    });
    if (!confirmed) return;

    this.revokingOthers = true;
    this.cdr.markForCheck();
    this.sessionService.revokeOthers().pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.revokingOthers = false;
        this.toast.success('Signed out everywhere else', 'Only this session remains signed in.');
        this.load();
      },
      error: (err) => {
        this.revokingOthers = false;
        this.cdr.markForCheck();
        this.logger.error('Error revoking other sessions:', err);
        this.toast.error('Error', 'Could not log out other sessions. Please try again.');
      },
    });
  }

  async logOutEverywhere(): Promise<void> {
    if (this.signingOutEverywhere) return;
    const confirmed = await this.toast.confirm({
      title: 'Log out everywhere?',
      message: 'Every place you\'re signed in will be logged out, including this one. You\'ll need to sign in again.',
      confirmText: 'Log out everywhere',
      cancelText: 'Cancel',
      danger: true,
    });
    if (!confirmed) return;

    this.signingOutEverywhere = true;
    this.cdr.markForCheck();
    try {
      await this.signOut.signOutEverywhere();
    } catch (err) {
      this.logger.error('Error logging out everywhere:', err);
      this.toast.error('Error', 'Could not log out everywhere. You are still signed in — please try again.');
    } finally {
      this.signingOutEverywhere = false;
      this.cdr.markForCheck();
    }
  }
}
