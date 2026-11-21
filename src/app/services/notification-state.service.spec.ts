import { BehaviorSubject, Subject, throwError } from 'rxjs';
import { NotificationStateService, UnreadCountState } from './notification-state.service';

/** Shared by the web and Android clients — keep the two copies identical. */
describe('NotificationStateService', () => {
  let status$: BehaviorSubject<string>;
  let userId: string;
  let auth: any;
  let api: any;

  beforeEach(() => {
    userId = 'U1';
    status$ = new BehaviorSubject<string>('AUTHENTICATED');
    auth = {
      status$,
      getUserId: () => (status$.value === 'AUTHENTICATED' ? userId : ''),
      isAuthenticated: () => status$.value === 'AUTHENTICATED',
    };
    api = jasmine.createSpyObj('NotificationService', ['getUnreadNotificationCount']);
  });

  const make = () => new NotificationStateService(api, auth);
  const latestState = (state: NotificationStateService) => { let s: UnreadCountState | undefined; state.unreadState$.subscribe(v => (s = v)).unsubscribe(); return s!; };
  const latestCount = (state: NotificationStateService) => { let c = -1; state.unreadCount$.subscribe(v => (c = v)).unsubscribe(); return c; };

  it('starts in a loading/unknown state', () => {
    expect(latestState(make())).toEqual({ status: 'loading', count: 0 });
  });

  it('refresh publishes a success state alongside the plain count', () => {
    const source = new Subject<number>();
    api.getUnreadNotificationCount.and.returnValue(source);
    const state = make();
    state.refreshUnread();
    source.next(5);
    expect(latestState(state)).toEqual({ status: 'success', count: 5 });
    expect(latestCount(state)).toBe(5);
  });

  it('a failure reports error and keeps the last known count (never a false zero)', () => {
    const first = new Subject<number>();
    api.getUnreadNotificationCount.and.returnValue(first);
    const state = make();
    state.refreshUnread();
    first.next(4);
    api.getUnreadNotificationCount.and.returnValue(throwError(() => new Error('offline')));
    state.refreshUnread();
    expect(latestState(state)).toEqual({ status: 'error', count: 4 });
    expect(latestCount(state)).toBe(4);
  });

  it('overlapping refreshes answered out of order: the older answer is ignored', () => {
    const older = new Subject<number>();
    const newer = new Subject<number>();
    api.getUnreadNotificationCount.and.returnValues(older, newer);
    const state = make();
    const counts: number[] = [];
    state.unreadCount$.subscribe(v => counts.push(v));
    state.refreshUnread();
    state.refreshUnread();
    newer.next(3);
    older.next(9);
    expect(counts).toEqual([0, 3]);
  });

  it('logout while a refresh is in flight: the late answer is dropped and the state is unknown', () => {
    const source = new Subject<number>();
    api.getUnreadNotificationCount.and.returnValue(source);
    const state = make();
    state.refreshUnread();
    status$.next('UNAUTHENTICATED');
    source.next(7);
    expect(latestState(state)).toEqual({ status: 'loading', count: 0 });
  });

  it('user A → logout → user B never shows A\'s count', () => {
    const forA = new Subject<number>();
    const forB = new Subject<number>();
    api.getUnreadNotificationCount.and.returnValues(forA, forB);
    const state = make();
    state.refreshUnread();
    forA.next(5);
    expect(latestCount(state)).toBe(5);

    status$.next('UNAUTHENTICATED');
    expect(latestState(state)).toEqual({ status: 'loading', count: 0 });
    userId = 'U2';
    status$.next('AUTHENTICATED');
    expect(latestState(state)).toEqual({ status: 'loading', count: 0 });
    state.refreshUnread();
    forB.next(1);
    expect(latestCount(state)).toBe(1);
  });

  it('a different user signing in directly (no logout in between) also resets and drops A\'s in-flight answer', () => {
    const forA = new Subject<number>();
    api.getUnreadNotificationCount.and.returnValue(forA);
    const state = make();
    state.setUnread(4);
    state.refreshUnread();
    userId = 'U2';
    status$.next('AUTHENTICATED');
    forA.next(8);
    expect(latestState(state)).toEqual({ status: 'loading', count: 0 });
  });

  it('a server-revoked session (auth state goes UNAUTHENTICATED) clears the count', () => {
    const state = make();
    state.setUnread(6);
    status$.next('UNAUTHENTICATED');
    expect(latestCount(state)).toBe(0);
    expect(latestState(state).status).toBe('loading');
  });

  it('mark one read updates the shared count and a stale in-flight refresh cannot undo it', () => {
    const inFlight = new Subject<number>();
    api.getUnreadNotificationCount.and.returnValue(inFlight);
    const state = make();
    state.setUnread(3);
    state.refreshUnread();
    const changed = jasmine.createSpy('changed');
    state.changed$.subscribe(changed);
    state.notificationRead(true);
    inFlight.next(3);                       // computed before the read
    expect(latestCount(state)).toBe(2);
    expect(changed).toHaveBeenCalled();
  });

  it('mark all read sets zero and a stale in-flight refresh cannot undo it', () => {
    const inFlight = new Subject<number>();
    api.getUnreadNotificationCount.and.returnValue(inFlight);
    const state = make();
    state.setUnread(3);
    state.refreshUnread();
    state.allRead();
    inFlight.next(3);
    expect(latestState(state)).toEqual({ status: 'success', count: 0 });
  });

  it('reading an already-read notification leaves the count alone; never below zero', () => {
    const state = make();
    state.setUnread(0);
    state.notificationRead(false);
    state.notificationRead(true);
    expect(latestCount(state)).toBe(0);
  });

  it('no refresh is requested without a signed-in user', () => {
    status$.next('UNAUTHENTICATED');
    const state = make();
    state.refreshUnread();
    expect(api.getUnreadNotificationCount).not.toHaveBeenCalled();
  });
});
