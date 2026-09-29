import { WisdomCardsComponent } from '../wisdom/wisdom-cards.component';
import { TeacherGettingStartedComponent } from '../teacher-getting-started/teacher-getting-started.component';
import {
  ChangeDetectionStrategy, ChangeDetectorRef,
  Component, OnDestroy, OnInit
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { Subject, forkJoin, of, takeUntil } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ToastService } from '../../services/toast.service';

import { AuthStateService } from '../../auth/auth-state.service';
import { TeacherService } from '../../services/teacher.service';
import { StudentService } from '../../services/student.service';
import { AttendanceService } from '../../services/attendance.service';
import { LeaveService, LeaveApplication } from '../../services/leave.service';
import { LoggerService } from '../../services/logger.service';
import { NotificationStateService } from '../../services/notification-state.service';
import { TeacherCheckinService } from '../../services/teacher-checkin.service';
import { TeacherAttendanceRecord, TeacherAttendanceSummary } from '../../interfaces/teacher-checkin';
import { TeacherLeaveService } from '../../services/teacher-leave.service';
import { TeacherLeave } from '../../interfaces/teacher-leave';
import { formatTeacherAttendanceTime, teacherAttendanceErrorMessage } from '../../utils/teacher-attendance.util';
import { TimetableService } from '../../services/timetable.service';
import { TeacherSubstitutionService } from '../../services/teacher-substitution.service';
import { MyCoverage, TeacherSubstitution } from '../../interfaces/teacher-substitution';
import { TimetableEntry } from '../../interfaces/timetable';
import { subjectIcon } from '../../utils/subject-visual.util';
import { isShowTimesEnabled } from '../../utils/timetable-preferences.util';
import {
  buildTodayClassesView,
  todayDayCode,
  TeacherTodayClassEntry,
  TeacherTodayClassesView,
} from '../../utils/teacher-timetable-today.util';
import { EventService } from '../../services/event.service';
import { CalendarEvent } from '../../interfaces/event-calendar.component';
import { pickNearestUpcomingEvent } from '../../utils/upcoming-event.util';

const EMPTY_TODAY_VIEW: TeacherTodayClassesView = { current: null, upcoming: [], allDone: false, hasAnyToday: false };

@Component({
  selector: 'app-teacher-dashboard',
  standalone: true,
  imports: [WisdomCardsComponent, TeacherGettingStartedComponent, CommonModule, RouterLink, MatIconModule],
  templateUrl: './teacher-dashboard.component.html',
  styleUrl: './teacher-dashboard.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeacherDashboardComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  teacherName = '';
  className = '';
  isClassTeacher = false;
  isLoading = true;
  today = new Date();
  coverClassesHighlighted = false;

  totalStudents = 0;
  todayAbsent = 0;
  todayPresent = 0;
  attendanceTaken = false;   // true once today's attendance has been submitted for the class
  pendingLeavesCount = 0;
  monthlyAttendanceRate = 0;
  recentLeaves: LeaveApplication[] = [];
  /** true only when the combined class-data request failed — "Class {{ className }} today"
   *  and "Pending approvals" must show a neutral unavailable state instead of the fabricated
   *  "0 active students" / "No pending requests" a blank default would otherwise imply. */
  classDataFailed = false;
  personalAttendance: TeacherAttendanceSummary | null = null;
  todayTeacherRecord: TeacherAttendanceRecord | null = null;
  personalSummaryLoading = true;
  recentTeacherLeaves: TeacherLeave[] = [];
  teacherLeavesLoading = true;

  timetableEntries: TimetableEntry[] = [];
  todayClassesLoading = true;
  todayClassesError: string | null = null;
  todayView: TeacherTodayClassesView = EMPTY_TODAY_VIEW;
  tomorrowCovers: TeacherSubstitution[] = [];
  myCoverage: MyCoverage | null = null;
  unreadCount = 0;
  unreadCountLoading = true;
  /** true only when the unread-count call itself failed — the dashboard must stay fully
   *  usable either way, so this only swaps the Updates panel to a neutral fallback line. */
  unreadCountFailed = false;
  upcomingEvent: CalendarEvent | null = null;
  upcomingEventLoading = true;
  upcomingEventFailed = false;
  /** Read synchronously at construction — never loaded asynchronously, so the UI can never
   * briefly show clock times before the real "show times" preference is known. This is the
   * same per-device viewer preference as the full Timetable page's own "Show times" toggle
   * (localStorage, not a school/admin setting) — see timetable-preferences.util. */
  readonly showTimes: boolean = isShowTimesEnabled();

  constructor(
    private authState: AuthStateService,
    private teacherService: TeacherService,
    private studentService: StudentService,
    private attendanceService: AttendanceService,
    private leaveService: LeaveService,
    private cdr: ChangeDetectorRef,
    private logger: LoggerService,
    private toast: ToastService,
    private checkinService: TeacherCheckinService,
    private teacherLeaveService: TeacherLeaveService,
    private timetableService: TimetableService,
    private substitutionService: TeacherSubstitutionService,
    private notificationState: NotificationStateService,
    private eventService: EventService
  ) { }

  ngOnInit(): void {
    const user = this.authState.getUser();
    if (!user?.userId) { this.isLoading = false; return; }

    this.loadPersonalAttendance();
    this.loadRecentTeacherLeaves();
    this.loadTodayClasses(user.userId);
    this.subscribeToUnreadCount();
    this.loadUpcomingEvent();

    this.teacherService.getTeacher(user.userId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: teacher => {
          this.teacherName = teacher.name;
          this.className = teacher.classTeacher ?? '';
          this.isClassTeacher = !!teacher.classTeacher;
          if (this.isClassTeacher) {
            this.loadClassData();
          } else {
            this.isLoading = false;
            this.cdr.markForCheck();
          }
        },
        error: e => {
          this.logger.error('Teacher fetch error:', e);
          this.isLoading = false;
          this.cdr.markForCheck();
        }
      });
  }

  private loadRecentTeacherLeaves(): void {
    this.teacherLeaveService.getMyLeaves(0, 3)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: response => {
          this.recentTeacherLeaves = response.content.slice(0, 3);
          this.teacherLeavesLoading = false;
          this.cdr.markForCheck();
        },
        error: error => {
          this.logger.error('Recent teacher leaves load error:', error);
          this.teacherLeavesLoading = false;
          this.cdr.markForCheck();
        }
      });
  }

  private loadPersonalAttendance(): void {
    const month = this.today.getMonth() + 1;
    const year = this.today.getFullYear();

    this.checkinService.getMyAttendance(month, year)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: summary => {
          this.personalAttendance = summary;
          const todayKey = this.toLocalDateKey(this.today);
          this.todayTeacherRecord = summary.records.find(record => record.date === todayKey) ?? null;
          this.personalSummaryLoading = false;
          this.cdr.markForCheck();
        },
        error: error => {
          this.logger.error('Personal attendance summary load error:', error);
          this.personalSummaryLoading = false;
          this.cdr.markForCheck();
        }
      });
  }

  /** Reuses the dashboard shell's shared NotificationStateService (kept fresh by the shell on
   *  load, on navigation, and on its periodic poll) instead of issuing a second, redundant
   *  GET /api/notification/user/unread/count — the shell is always mounted as the parent of
   *  this route, so its refresh is already in flight (or resolved) by the time this
   *  subscribes, and the BehaviorSubject replays the latest value immediately either way.
   *  Isolated from every other dashboard section on purpose — a failure here must never
   *  block or blank out check-in status, Today's Classes, or leave data. */
  private subscribeToUnreadCount(): void {
    this.notificationState.unreadState$
      .pipe(takeUntil(this.destroy$))
      .subscribe(state => {
        this.unreadCountLoading = state.status === 'loading';
        this.unreadCountFailed = state.status === 'error';
        if (state.status === 'success') this.unreadCount = state.count;
        this.cdr.markForCheck();
      });
  }

  /** Current-month request first; only fires the next-month fallback when the current month
   *  genuinely has no upcoming event left — at most 2 requests, never fired in parallel, and
   *  isolated from the rest of the dashboard so an event failure never blocks anything else. */
  private loadUpcomingEvent(): void {
    this.upcomingEventLoading = true;
    this.upcomingEventFailed = false;
    const now = new Date();

    this.eventService.getEventsForMonthAndYear(now.getFullYear(), now.getMonth() + 1)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: events => {
          const nearest = pickNearestUpcomingEvent(events, now);
          if (nearest) {
            this.upcomingEvent = nearest;
            this.upcomingEventLoading = false;
            this.cdr.markForCheck();
            return;
          }
          this.loadNextMonthEvent(now);
        },
        error: error => {
          this.logger.error('Upcoming event load error:', error);
          this.upcomingEventLoading = false;
          this.upcomingEventFailed = true;
          this.cdr.markForCheck();
        }
      });
  }

  private loadNextMonthEvent(now: Date): void {
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    this.eventService.getEventsForMonthAndYear(nextMonth.getFullYear(), nextMonth.getMonth() + 1)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: events => {
          this.upcomingEvent = pickNearestUpcomingEvent(events, now);
          this.upcomingEventLoading = false;
          this.cdr.markForCheck();
        },
        error: error => {
          this.logger.error('Next-month event load error:', error);
          this.upcomingEventLoading = false;
          this.upcomingEventFailed = true;
          this.cdr.markForCheck();
        }
      });
  }

  private toLocalDateKey(date: Date): string {
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  /** Independent of the class-teacher forkJoin below — every teacher has periods they
   * teach, and a timetable failure here must never block the rest of the dashboard. */
  private loadTodayClasses(teacherId: string): void {
    this.todayClassesLoading = true;
    this.todayClassesError = null;
    this.cdr.markForCheck();
    this.loadCoverExtras();

    forkJoin({
      timetable: this.timetableService.getTeacherTimetable(teacherId),
      // Isolated so a substitution-service outage never blocks normal timetable classes —
      // Today's Classes must stay usable either way, just without cover-class markers.
      substitutions: this.substitutionService.getMine(this.toLocalDateKey(new Date())).pipe(
        catchError(error => {
          this.logger.error('Cover-class lookup failed (isolated from timetable load):', error);
          return of([]);
        }),
      ),
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ timetable, substitutions }) => {
          const coverEntries: TimetableEntry[] = substitutions.map(item => ({
            id: -item.id,
            className: item.className,
            sectionName: item.sectionName,
            day: todayDayCode(new Date()),
            periodNumber: item.periodNumber,
            startTime: item.startTime,
            endTime: item.endTime,
            subjectName: item.subjectName,
            teacherId,
            teacherName: item.substituteTeacherName,
            isSubstitution: true,
            originalTeacherName: item.originalTeacherName,
            substitutionNote: item.note ?? null,
            timetableEntryId: item.timetableEntryId,
          }));
          const entries = [...timetable, ...coverEntries];
          this.timetableEntries = entries;
          this.todayView = buildTodayClassesView(entries, new Date());
          this.todayClassesLoading = false;
          this.cdr.markForCheck();
        },
        error: error => {
          this.logger.error('Today\'s classes load error:', error);
          this.todayClassesError = teacherAttendanceErrorMessage(error, 'Unable to load today\'s classes.');
          this.todayClassesLoading = false;
          this.cdr.markForCheck();
        }
      });
  }

  /** Tomorrow's cover periods (as the substitute) and, on a day this teacher is away,
   *  who covers each of their own periods. Both are optional extras: a failure only hides them. */
  private loadCoverExtras(): void {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    forkJoin({
      tomorrow: this.substitutionService.getMine(this.toLocalDateKey(tomorrow)).pipe(catchError(() => of([] as TeacherSubstitution[]))),
      coverage: this.substitutionService.getMyCoverage(this.toLocalDateKey(new Date())).pipe(catchError(() => of(null))),
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe(({ tomorrow, coverage }) => {
        this.tomorrowCovers = tomorrow ?? [];
        this.myCoverage = coverage;
        this.cdr.markForCheck();
      });
  }

  get showMyCoverage(): boolean {
    return !!this.myCoverage?.unavailable && !!this.myCoverage.periods?.length;
  }

  myCoverageReason(): string {
    switch (this.myCoverage?.unavailabilityReason) {
      case 'APPROVED_LEAVE': return 'on leave';
      case 'ABSENT': return 'marked absent';
      case 'ON_LEAVE': return 'marked on leave';
      default: return 'away';
    }
  }

  coverClassLabel(item: { className: string; sectionName?: string | null }): string {
    return item.sectionName ? `Class ${item.className} – ${item.sectionName}` : `Class ${item.className}`;
  }

  retryTodayClasses(): void {
    const user = this.authState.getUser();
    if (!user?.userId) return;
    this.loadTodayClasses(user.userId);
  }

  classLabel(entry: TeacherTodayClassEntry): string {
    return entry.sectionName ? `Class ${entry.className} – ${entry.sectionName}` : `Class ${entry.className}`;
  }

  /** Period identity + class — always shown regardless of the "show times" preference,
   * since that preference only governs clock-time visibility (see classTimeRange). */
  periodClassLabel(entry: TeacherTodayClassEntry): string {
    return `Period ${entry.periodNumber} · ${this.classLabel(entry)}`;
  }

  getSubjectIcon(subjectName: string): string {
    return subjectIcon(subjectName);
  }

  /**
   * The clock-time range, or null when there's nothing genuine to show — either the entry
   * has no reliable start/end time (an untimed "scheduled" fallback entry) or the viewer's
   * "show times" preference is off. Never invents a time and never returns a placeholder
   * like "--": the template hides the whole time element when this is null, so the row
   * layout reclaims that space instead of leaving it blank.
   */
  classTimeRange(entry: TeacherTodayClassEntry): string | null {
    if (!this.showTimes) return null;
    if (!entry.startTime || !entry.endTime) return null;
    return `${formatTeacherAttendanceTime(entry.startTime)} – ${formatTeacherAttendanceTime(entry.endTime)}`;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadClassData(): void {
    this.classDataFailed = false;
    const now = this.today;
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    forkJoin([
      this.studentService.getActiveStudentsByClass(this.className),
      // Today's sheet for the teacher's own class/section (the server picks the school's today).
      // A sheet failure (e.g. no current session) only hides today's figures.
      this.attendanceService.getSheet(null).pipe(catchError(e => {
        this.logger.error('Today attendance load error:', e);
        return of(null);
      })),
      this.leaveService.getLeavesPaginated(0, 50, this.className),
      this.attendanceService.getClassSummary(this.className, { year, month }),
    ]).pipe(takeUntil(this.destroy$)).subscribe({
      next: ([students, todaySheet, leavesPage, summary]) => {
        this.totalStudents = students.length;
        this.attendanceTaken = !!todaySheet?.submitted;
        const todayRows = this.attendanceTaken ? todaySheet!.students : [];
        this.todayAbsent = todayRows.filter(s => s.status === 'ABSENT').length;
        this.todayPresent = todayRows.filter(s => s.status === 'PRESENT').length;

        const pending = leavesPage.content.filter(l => l.status === 'PENDING');
        this.pendingLeavesCount = pending.length;
        this.recentLeaves = pending.slice(0, 5);

        // Class rate = all present days / all submitted days (the same formula as each student's %).
        const workingDays = summary.reduce((sum, r) => sum + r.totalWorkingDays, 0);
        const presentDays = summary.reduce((sum, r) => sum + r.daysPresent, 0);
        this.monthlyAttendanceRate = workingDays > 0 ? Math.round(presentDays * 1000 / workingDays) / 10 : 0;

        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: e => {
        this.logger.error('Class data load error:', e);
        this.classDataFailed = true;
        this.isLoading = false;
        this.cdr.markForCheck();
      }
    });
  }

  approveLeave(leaveId: number): void {
    this.leaveService.updateLeaveStatus(leaveId, 'APPROVED')
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.recentLeaves = this.recentLeaves.filter(l => l.id !== leaveId);
          this.pendingLeavesCount = Math.max(0, this.pendingLeavesCount - 1);
          this.cdr.markForCheck();
        },
        error: e => {
          this.logger.error('Approve leave error:', e);
          this.toast.error('Error', 'Failed to approve leave. Please try again.');
        }
      });
  }

  rejectLeave(leaveId: number): void {
    this.leaveService.updateLeaveStatus(leaveId, 'REJECTED')
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.recentLeaves = this.recentLeaves.filter(l => l.id !== leaveId);
          this.pendingLeavesCount = Math.max(0, this.pendingLeavesCount - 1);
          this.cdr.markForCheck();
        },
        error: e => {
          this.logger.error('Reject leave error:', e);
          this.toast.error('Error', 'Failed to reject leave. Please try again.');
        }
      });
  }

  get greeting(): string {
    const h = this.today.getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  get attendanceColor(): string {
    if (this.monthlyAttendanceRate >= 85) return '#059669';
    if (this.monthlyAttendanceRate >= 70) return '#d97706';
    return '#dc2626';
  }

  get todayPresentCount(): number {
    return this.todayPresent;
  }

  get personalAttendanceStatus(): string {
    if (!this.todayTeacherRecord) return 'Not checked in';
    return this.todayTeacherRecord.status.replaceAll('_', ' ').toLowerCase()
      .replace(/\b\w/g, character => character.toUpperCase());
  }

  get coverClassCount(): number {
    return (this.todayView.current?.isSubstitution ? 1 : 0)
      + this.todayView.upcoming.filter(entry => entry.isSubstitution).length;
  }

  scrollToCoverClasses(): void {
    document.getElementById('todays-classes')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    this.coverClassesHighlighted = true;
    this.cdr.markForCheck();
    window.setTimeout(() => {
      this.coverClassesHighlighted = false;
      this.cdr.markForCheck();
    }, 1800);
  }

  get checkInNeedsAttention(): boolean {
    if (this.personalSummaryLoading) return false;
    const status = this.todayTeacherRecord?.status;
    return !this.todayTeacherRecord?.checkInTime && status !== 'ON_LEAVE' && status !== 'ABSENT';
  }

  get recentLeaveDecision(): TeacherLeave | null {
    const decided = this.recentTeacherLeaves.find(leave => leave.status === 'APPROVED' || leave.status === 'REJECTED');
    if (!decided?.appliedDate) return null;
    const applied = new Date(decided.appliedDate).getTime();
    return Number.isFinite(applied) && Date.now() - applied <= 7 * 24 * 60 * 60 * 1000 ? decided : null;
  }

  get teacherAttentionLoading(): boolean {
    return this.personalSummaryLoading || this.todayClassesLoading || this.unreadCountLoading || this.teacherLeavesLoading;
  }

  get hasTeacherAttention(): boolean {
    return this.checkInNeedsAttention || this.coverClassCount > 0 || this.unreadCount > 0 || !!this.recentLeaveDecision;
  }

  get personalAttendancePercent(): number {
    return Math.max(0, Math.min(100, this.personalAttendance?.attendancePercentage ?? 0));
  }

  formatAttendanceTime(value: string | null): string {
    return formatTeacherAttendanceTime(value);
  }

  /** Reuses the exact same "HH:mm" → "h:mm AM/PM" formatting already used for check-in and
   *  class times — an event's startTime comes from the same LocalTime-shaped backend field. */
  formatEventTime(value: string): string {
    return formatTeacherAttendanceTime(value);
  }

  /**
   * Derived entirely from `recentTeacherLeaves` — the same 3-most-recent-by-startDate list
   * already fetched for the "My recent leaves" panel — so this adds zero new requests. The
   * teacher-facing `/my-leaves` endpoint has no status filter (unlike the admin endpoint), so
   * fetching a dedicated pending count would mean a second, largely-duplicate call against the
   * same data; reusing what's already loaded is deliberately preferred over that. This is a
   * best-effort signal from the most recent 3 applications, not an exhaustive lifetime count.
   */
  get leaveStatusLabel(): string {
    const todayKey = this.toLocalDateKey(new Date());
    const onLeaveToday = this.recentTeacherLeaves.find(leave =>
      leave.status === 'APPROVED' && leave.startDate <= todayKey && leave.endDate >= todayKey);
    if (onLeaveToday) return 'On leave today · Approved';

    const pendingCount = this.recentTeacherLeaves.filter(leave => leave.status === 'PENDING').length;
    if (pendingCount > 0) return `${pendingCount} request${pendingCount === 1 ? '' : 's'} pending`;

    return 'No pending requests';
  }

  get isWeekend(): boolean {
    return this.today.getDay() === 0; // Sunday only — Indian schools are open on Saturday
  }

  /** 'weekend' | 'not-marked' | 'marked' */
  get absentCardState(): 'weekend' | 'not-marked' | 'marked' {
    if (this.isWeekend) return 'weekend';
    // 'not-marked' = today's attendance has not been submitted
    // 'marked'     = submitted (todayAbsent may be 0 = all present, or N explicit absences)
    return this.attendanceTaken ? 'marked' : 'not-marked';
  }

  hasFeature(featureKey: string): boolean {
    return this.authState.hasFeature(featureKey);
  }
}
