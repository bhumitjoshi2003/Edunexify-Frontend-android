import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { MatIconModule } from '@angular/material/icon';
import { Observable, Subject, forkJoin, of } from 'rxjs';
import { catchError, map, switchMap, takeUntil, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { AuthStateService } from '../../auth/auth-state.service';
import { OnLeaveTodayComponent } from '../on-leave-today/on-leave-today.component';
import { LeaveAttentionBucket, LeaveAttentionSummary, NEEDS_ATTENTION_BADGE, attentionOverdueLabel } from '../../utils/leave-escalation.util';

/** One class's attendance; recordedToday is absent from servers older than this screen. */
export interface PrincipalClassAttendance {
  className: string;
  students: number;
  attendanceRate: number | null;
  workingDays: number;
  recordedToday?: boolean;
}

export interface PrincipalOverview {
  totalStudents: number;
  totalTeachers: number;
  todayAttendanceRate: number | null;
  schoolDate: string;
  todayRecordedStudents: number;
  todayPresentStudents: number;
  pendingStudentLeaves: number;
  pendingTeacherLeaves: number;
  publishedReportCards: number;
  awaitingTeacherReview: number;
  awaitingPrincipalReview: number;
  readyForPublication: number;
  returnedForCorrection: number;
  classAttendance: PrincipalClassAttendance[];
}

/** Principal projection of today's staff attendance: counts only, never locations. */
export interface PrincipalStaffToday {
  date: string;
  presentCount: number;
  lateCount: number;
  absentCount: number;
  halfDayCount: number;
  onLeaveCount: number;
  /** Teachers expected to attend; 0 on a school holiday. */
  expectedCount?: number;
  notCheckedInCount?: number;
}

interface UncoveredPeriod { assignment?: unknown | null; }

export interface PrincipalUpcomingEvent {
  id?: number;
  title: string;
  startDate: string;
  endDate?: string | null;
  startTime?: string | null;
  category?: string;
}

/** urgent: teaching is affected now · warning: expected work is missing · action: waits for you · info: for awareness. */
export type AttentionSeverity = 'urgent' | 'warning' | 'action' | 'info';

export interface AttentionItem {
  key: string;
  severity: AttentionSeverity;
  icon: string;
  label: string;
  count: number;
  /** null: no Principal screen lists these details yet; the row informs without navigating. */
  route: string | null;
  /** Leave pending from day 3: red edge, listed before other actions, with a short detail line. */
  overdue?: boolean;
  detail?: string;
}

interface Widget<T> { data: T | null; loading: boolean; failed: boolean; }

const SEVERITY_ORDER: Record<AttentionSeverity, number> = { urgent: 0, warning: 1, action: 2, info: 3 };

/**
 * The Principal's school-day overview. Every widget loads and fails independently, so one
 * unavailable source never hides the others. Academic and operational data only: nothing here
 * reads fees, payments or staff locations.
 */
@Component({
  selector: 'app-principal-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule, OnLeaveTodayComponent],
  templateUrl: './principal-dashboard.component.html',
  styleUrl: './principal-dashboard.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrincipalDashboardComponent implements OnInit, OnDestroy {
  private readonly api = environment.apiUrl;
  private destroy$ = new Subject<void>();
  private refresh$ = new Subject<void>();
  private schoolDate$ = new Subject<string>();

  overview: Widget<PrincipalOverview> = { data: null, loading: true, failed: false };
  staff: Widget<PrincipalStaffToday> = { data: null, loading: true, failed: false };
  uncovered: Widget<number> = { data: null, loading: true, failed: false };
  events: Widget<PrincipalUpcomingEvent[]> = { data: null, loading: true, failed: false };
  /** Overdue leave counts; optional — without them the leave rows simply aren't marked overdue. */
  leaveAttention: Widget<LeaveAttentionSummary> = { data: null, loading: true, failed: false };
  updatedAt: Date | null = null;

  constructor(private http: HttpClient, private auth: AuthStateService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.refresh$.pipe(
      tap(() => this.start(this.overview)),
      switchMap(() => this.http.get<PrincipalOverview>(`${this.api}/principal/overview`).pipe(
        catchError(() => of(null)))),
      takeUntil(this.destroy$),
    ).subscribe(data => {
      this.finish(this.overview, data);
      if (data) this.updatedAt = new Date();
      // Today-bound widgets follow the school's own date; fall back to this device's date.
      this.schoolDate$.next(data?.schoolDate ?? this.localDate());
    });

    this.refresh$.pipe(
      tap(() => this.start(this.staff)),
      switchMap(() => this.http.get<PrincipalStaffToday>(`${this.api}/principal/staff-attendance/today-summary`).pipe(
        catchError(() => of(null)))),
      takeUntil(this.destroy$),
    ).subscribe(data => this.finish(this.staff, data));

    this.refresh$.pipe(
      tap(() => this.start(this.leaveAttention)),
      switchMap(() => this.http.get<LeaveAttentionSummary>(`${this.api}/leaves/attention-summary`).pipe(
        catchError(() => of(null)))),
      takeUntil(this.destroy$),
    ).subscribe(data => this.finish(this.leaveAttention, data));

    this.schoolDate$.pipe(
      tap(() => this.start(this.uncovered)),
      switchMap(date => this.http.get<UncoveredPeriod[]>(`${this.api}/substitutions/uncovered`, { params: { date } }).pipe(
        map(periods => periods.filter(p => !p.assignment).length),
        catchError(() => of(null)))),
      takeUntil(this.destroy$),
    ).subscribe(count => this.finish(this.uncovered, count));

    this.schoolDate$.pipe(
      tap(() => this.start(this.events)),
      switchMap(date => this.upcomingEvents(date)),
      takeUntil(this.destroy$),
    ).subscribe(events => this.finish(this.events, events));

    this.refresh();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  refresh(): void { this.refresh$.next(); }

  get name(): string { return this.auth.getUser()?.name?.trim() || 'Principal'; }

  get greeting(): string {
    const hour = new Date().getHours();
    return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  }

  get schoolDate(): string | null { return this.overview.data?.schoolDate ?? null; }

  get reportCardsEnabled(): boolean { return this.auth.hasFeature('REPORT_CARDS'); }

  get eventsEnabled(): boolean { return this.auth.hasFeature('SCHOOL_COMMUNICATION'); }

  /** A school holiday or closed day: the staff summary expects nobody. Unknown counts as a school day. */
  get closedToday(): boolean { return this.staff.data?.expectedCount === 0; }

  get staffPresent(): number {
    const s = this.staff.data;
    return s ? s.presentCount + s.lateCount + s.halfDayCount : 0;
  }

  get pendingLeaves(): number {
    const o = this.overview.data;
    return o ? o.pendingStudentLeaves + o.pendingTeacherLeaves : 0;
  }

  /** Classes with pupils that have not submitted today's attendance; null when the server cannot say. */
  get classesUnmarked(): number | null {
    const classes = (this.overview.data?.classAttendance ?? []).filter(c => c.students > 0);
    if (!classes.length || classes.some(c => c.recordedToday === undefined)) return null;
    return classes.filter(c => !c.recordedToday).length;
  }

  get classesWithPupils(): number {
    return (this.overview.data?.classAttendance ?? []).filter(c => c.students > 0).length;
  }

  get attention(): AttentionItem[] {
    const items: AttentionItem[] = [];
    const add = (item: AttentionItem) => { if (item.count > 0) items.push(item); };
    const o = this.overview.data;
    const s = this.staff.data;
    const uncovered = this.uncovered.data ?? 0;
    add({ key: 'uncovered', severity: 'urgent', icon: 'event_busy', count: uncovered,
      label: this.plural(uncovered, 'period has', 'periods have') + ' no substitute today',
      route: '/dashboard/teacher-substitutions' });
    if (!this.closedToday) {
      const unmarked = this.classesUnmarked ?? 0;
      add({ key: 'unmarked', severity: 'warning', icon: 'fact_check', count: unmarked,
        label: this.plural(unmarked, 'class has', 'classes have') + ' not marked attendance',
        route: '/dashboard/attendance-summary' });
      const notIn = s?.notCheckedInCount ?? 0;
      add({ key: 'not-checked-in', severity: 'warning', icon: 'schedule', count: notIn,
        label: this.plural(notIn, 'teacher has', 'teachers have') + ' not checked in',
        route: null });
    }
    if (this.reportCardsEnabled) {
      const awaiting = o?.awaitingPrincipalReview ?? 0;
      add({ key: 'approvals', severity: 'action', icon: 'draw', count: awaiting,
        label: this.plural(awaiting, 'report-card review awaits', 'report-card reviews await') + ' your approval',
        route: '/dashboard/report-card-approvals' });
    }
    const leave = this.leaveAttention.data;
    const teacherLeave = o?.pendingTeacherLeaves ?? 0;
    add({ key: 'teacher-leave', severity: 'action', icon: 'work_off', count: teacherLeave,
      label: this.plural(teacherLeave, 'teacher leave request', 'teacher leave requests') + ' to decide',
      route: '/dashboard/teacher-leave-requests', ...this.overdue(leave?.teacher) });
    const studentLeave = o?.pendingStudentLeaves ?? 0;
    add({ key: 'student-leave', severity: 'action', icon: 'event_note', count: studentLeave,
      label: this.plural(studentLeave, 'student leave request', 'student leave requests') + ' to decide',
      route: '/dashboard/view-leaves', ...this.overdue(leave?.student) });
    if (this.reportCardsEnabled) {
      const returned = o?.returnedForCorrection ?? 0;
      add({ key: 'returned', severity: 'info', icon: 'undo', count: returned,
        label: this.plural(returned, 'report-card review is', 'report-card reviews are') + ' back with teachers',
        route: '/dashboard/report-card-approvals' });
    }
    const rank = (item: AttentionItem) => SEVERITY_ORDER[item.severity] - (item.overdue ? 0.5 : 0);
    return items.sort((a, b) => rank(a) - rank(b) || b.count - a.count);
  }

  private overdue(bucket: LeaveAttentionBucket | null | undefined): Pick<AttentionItem, 'overdue' | 'detail'> {
    return bucket && (bucket.attention ?? bucket.overdue) > 0
      ? { overdue: true, detail: `${NEEDS_ATTENTION_BADGE} · ${attentionOverdueLabel(bucket)}` }
      : {};
  }

  /** "All clear" is only claimed when every source the list depends on actually answered. */
  get attentionComplete(): boolean {
    return !!this.overview.data && !this.overview.failed && !this.staff.failed && !this.uncovered.failed;
  }

  get attentionLoading(): boolean {
    return this.overview.loading || this.staff.loading || this.uncovered.loading;
  }

  rateTone(rate: number | null): 'good' | 'fair' | 'low' | 'none' {
    if (rate === null) return 'none';
    return rate >= 90 ? 'good' : rate >= 75 ? 'fair' : 'low';
  }

  trackByKey(_: number, item: AttentionItem): string { return item.key; }
  trackByClass(_: number, item: PrincipalClassAttendance): string { return item.className; }
  trackByEvent(_: number, item: PrincipalUpcomingEvent): string { return `${item.id ?? item.title}-${item.startDate}`; }

  private upcomingEvents(date: string): Observable<PrincipalUpcomingEvent[] | null> {
    if (!this.eventsEnabled) return of([]);
    const [year, month] = date.split('-').map(Number);
    const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
    const fetch = (y: number, m: number) =>
      this.http.get<PrincipalUpcomingEvent[]>(`${this.api}/events/month/${m}/year/${y}`);
    return forkJoin([fetch(year, month), fetch(next.year, next.month)]).pipe(
      map(([current, following]) => {
        const seen = new Set<string>();
        return [...current, ...following]
          .filter(e => (e.endDate || e.startDate) >= date)
          .filter(e => {
            const key = this.trackByEvent(0, e);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .sort((a, b) => a.startDate.localeCompare(b.startDate) || (a.startTime ?? '').localeCompare(b.startTime ?? ''))
          .slice(0, 4);
      }),
      catchError(() => of(null)),
    );
  }

  private start<T>(widget: Widget<T>): void {
    widget.loading = true;
    widget.failed = false;
    this.cdr.markForCheck();
  }

  /** A failed refresh keeps the last good data visible and flags the widget instead. */
  private finish<T>(widget: Widget<T>, data: T | null): void {
    widget.loading = false;
    widget.failed = data === null;
    if (data !== null) widget.data = data;
    this.cdr.markForCheck();
  }

  private plural(count: number, one: string, many: string): string {
    return `${count} ${count === 1 ? one : many}`;
  }

  private localDate(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}
