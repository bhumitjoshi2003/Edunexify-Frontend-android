import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject, catchError, map, of, switchMap, takeUntil } from 'rxjs';
import { NotificationService } from './notification.service';
import { AuthStateService } from '../auth/auth-state.service';

export type UnreadCountStatus = 'loading' | 'success' | 'error';

/** `count` is meaningful only when `status === 'success'` — a `loading`/`error` state must
 *  never be collapsed into a bare `0`, since a genuine zero and "we don't know yet" are
 *  different UI states (see Teacher Dashboard's Updates tile). */
export interface UnreadCountState {
  status: UnreadCountStatus;
  count: number;
}

interface RefreshResult { generation: number; userId: string; count: number; ok: boolean; }

/**
 * The one unread-notification count for the signed-in user. Shared by the web and Android clients
 * — keep the two copies identical. Native push only calls into it (refreshUnread / setUnread).
 *
 * It is bound to the session:
 *  - Every change that makes in-flight answers obsolete (sign-out, a different user signing in, a
 *    local mark-read / mark-all-read, setUnread) starts a new generation and cancels the in-flight
 *    request. An answer from an older generation, or for a user who is no longer signed in, is
 *    dropped — so an older count can never overwrite a newer one, and one user's count is never
 *    shown to the next.
 *  - It follows AuthStateService itself: any confirmed sign-out (explicit logout, logout-all, a
 *    server-revoked session rejected by the interceptor) clears it without each caller having to.
 *  - A failed refresh reports `error` and keeps the last known count; it never invents a zero.
 */
@Injectable({ providedIn: 'root' })
export class NotificationStateService {
  private readonly unreadSubject = new BehaviorSubject(0);
  readonly unreadCount$ = this.unreadSubject.asObservable();
  private readonly unreadStateSubject = new BehaviorSubject<UnreadCountState>({ status: 'loading', count: 0 });
  readonly unreadState$: Observable<UnreadCountState> = this.unreadStateSubject.asObservable();
  /** Fires after a local read/all-read so open lists can re-sync. */
  readonly changed$ = new Subject<void>();

  private generation = 0;
  private boundUserId: string | null = null;
  private readonly refreshRequest = new Subject<{ generation: number; userId: string }>();
  private readonly invalidate$ = new Subject<void>();

  constructor(private api: NotificationService, private auth: AuthStateService) {
    this.refreshRequest.pipe(switchMap(({ generation, userId }) => this.api.getUnreadNotificationCount().pipe(
      map((count): RefreshResult => ({ generation, userId, count, ok: true })),
      catchError(() => of<RefreshResult>({ generation, userId, count: 0, ok: false })),
      takeUntil(this.invalidate$),
    ))).subscribe(result => this.apply(result));

    this.auth.status$.subscribe(status => {
      if (status === 'UNAUTHENTICATED') {
        this.boundUserId = null;
        this.clear();
      } else if (status === 'AUTHENTICATED') {
        const userId = this.auth.getUserId() || null;
        if (userId !== this.boundUserId) {
          this.clear();
          this.boundUserId = userId;
        }
      }
    });
  }

  /** Asks the server for the current count (latest request wins). No-op without a signed-in user. */
  refreshUnread(): void {
    const userId = this.auth.getUserId();
    if (!userId || !this.auth.isAuthenticated()) return;
    this.refreshRequest.next({ generation: this.generation, userId });
  }

  /** A count known locally (e.g. from a push payload) — newer than anything in flight. */
  setUnread(count: number): void {
    this.invalidateInFlight();
    this.publish(Math.max(0, count));
  }

  notificationRead(wasUnread: boolean): void {
    if (wasUnread) this.setUnread(this.unreadSubject.value - 1);
    this.changed$.next();
  }

  allRead(): void {
    this.setUnread(0);
    this.changed$.next();
  }

  /** Back to "unknown" and cancel anything in flight (sign-out / user switch). */
  clear(): void {
    this.invalidateInFlight();
    this.unreadSubject.next(0);
    this.unreadStateSubject.next({ status: 'loading', count: 0 });
  }

  private invalidateInFlight(): void {
    this.generation++;
    this.invalidate$.next();
  }

  private apply(result: RefreshResult): void {
    if (result.generation !== this.generation || result.userId !== this.auth.getUserId()) return;
    if (result.ok) this.publish(result.count);
    else this.unreadStateSubject.next({ status: 'error', count: this.unreadSubject.value });
  }

  private publish(count: number): void {
    this.unreadSubject.next(count);
    this.unreadStateSubject.next({ status: 'success', count });
  }
}
