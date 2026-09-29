import { WisdomCardsComponent } from '../wisdom/wisdom-cards.component';
import {
  ChangeDetectionStrategy, ChangeDetectorRef,
  Component, OnDestroy, OnInit, Optional
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { Subject, takeUntil } from 'rxjs';

import { AuthStateService } from '../../auth/auth-state.service';
import { DashboardAnalyticsService, DashboardStats } from '../../services/dashboard-analytics.service';
import { LeaveService, LeaveApplication } from '../../services/leave.service';
import { SchoolService, SchoolEntitlementSummary } from '../../services/school.service';
import { TeacherCheckinService } from '../../services/teacher-checkin.service';
import { TeacherAttendanceTodaySummary } from '../../interfaces/teacher-checkin';
import { LoggerService } from '../../services/logger.service';
import { StaffAdoptionService } from '../../services/staff-adoption.service';
import { StaffAdoptionSummary } from '../../interfaces/staff-adoption';
import { TeacherLeaveService } from '../../services/teacher-leave.service';
import { EventService } from '../../services/event.service';
import { CalendarEvent } from '../../interfaces/event-calendar.component';
import { pickNearestUpcomingEvent } from '../../utils/upcoming-event.util';
import { TeacherSubstitutionService } from '../../services/teacher-substitution.service';
import { OnLeaveTodayComponent } from '../on-leave-today/on-leave-today.component';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [WisdomCardsComponent, OnLeaveTodayComponent, CommonModule, RouterLink, MatIconModule],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDashboardComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  adminName = '';
  isLoading = true;
  today = new Date();

  stats: DashboardStats | null = null;
  recentLeaves: LeaveApplication[] = [];
  entitlement: SchoolEntitlementSummary | null = null;
  staffAttendance: TeacherAttendanceTodaySummary | null = null;
  staffAdoption: StaffAdoptionSummary | null = null;
  staffAdoptionLoading = false;
  staffAdoptionError = false;
  isAdmin = false;
  teacherPendingLeaveCount: number | null = null;
  teacherPendingLeaveLoading = true;
  teacherPendingLeaveFailed = false;
  upcomingEvent: CalendarEvent | null = null;
  upcomingEventLoading = true;
  upcomingEventFailed = false;
  statsLoading = true;
  statsFailed = false;
  studentLeavesFailed = false;
  entitlementFailed = false;
  staffAttendanceFailed = false;
  uncoveredSubstitutionCount = 0;
  substitutionsLoading = true;
  substitutionsFailed = false;

  constructor(
    private authState: AuthStateService,
    private analyticsService: DashboardAnalyticsService,
    private leaveService: LeaveService,
    private schoolService: SchoolService,
    private teacherCheckinService: TeacherCheckinService,
    private cdr: ChangeDetectorRef,
    private logger: LoggerService,
    private staffAdoptionService: StaffAdoptionService,
    private teacherLeaveService: TeacherLeaveService,
    private eventService: EventService,
    @Optional() private substitutionService: TeacherSubstitutionService | null,
  ) {}

  ngOnInit(): void {
    const user = this.authState.getUser();
    this.isAdmin = user?.role === 'ADMIN';
    // The greeting name only ever needs the display name — already present on the session
    // user from /auth/me (the same Admin.name field getAdminById() would otherwise re-fetch),
    // so no separate admin-profile request is needed here.
    this.adminName = user?.name ?? '';

    this.loadUpcomingEvent();
    this.loadUncoveredSubstitutions();
    if (this.isAdmin) {
      this.loadStats();
      this.loadStudentLeaves();
      this.loadEntitlement();
      this.loadStaffAttendance();
      this.loadStaffAdoption();
      this.loadTeacherPendingLeaveCount();
    }
    this.isLoading = false;
  }

  loadUncoveredSubstitutions(): void {
    if (!this.substitutionService) {
      this.substitutionsLoading = false;
      return;
    }
    this.substitutionsLoading = true;
    this.substitutionsFailed = false;
    const pad = (value: number) => String(value).padStart(2, '0');
    const date = `${this.today.getFullYear()}-${pad(this.today.getMonth() + 1)}-${pad(this.today.getDate())}`;
    this.substitutionService.getUncovered(date).pipe(takeUntil(this.destroy$)).subscribe({
      next: periods => {
        this.uncoveredSubstitutionCount = periods.filter(period => !period.assignment).length;
        this.substitutionsLoading = false;
        this.cdr.markForCheck();
      },
      error: error => {
        this.logger.error('Uncovered substitutions load error:', error);
        this.substitutionsLoading = false;
        this.substitutionsFailed = true;
        this.cdr.markForCheck();
      },
    });
  }

  get adoptionOnboardingIncomplete(): number {
    if (!this.staffAdoption || this.staffAdoption.onboardingCompletedTeachers == null) return 0;
    return Math.max(0, this.staffAdoption.totalTeachers - this.staffAdoption.onboardingCompletedTeachers);
  }

  get adoptionOutdatedApp(): number {
    if (!this.staffAdoption || this.staffAdoption.appUpToDateTeachers == null) return 0;
    return Math.max(0, this.staffAdoption.totalTeachers - this.staffAdoption.appUpToDateTeachers);
  }

  /** Pending student leave only (stats.pendingLeaves now also includes teacher leave). */
  get studentPendingLeaves(): number {
    return this.stats?.pendingStudentLeaves ?? this.stats?.pendingLeaves ?? 0;
  }

  get hasAdminAttention(): boolean {
    return this.uncoveredSubstitutionCount > 0 || (this.isAdmin && (
      this.notYetCheckedIn > 0 || (this.staffAttendance?.onLeaveCount ?? 0) > 0
      || (this.teacherPendingLeaveCount ?? 0) > 0 || this.studentPendingLeaves > 0
      || this.staffAdoptionNotStarted > 0 || this.adoptionOnboardingIncomplete > 0 || this.adoptionOutdatedApp > 0
    ));
  }

  get attentionLoading(): boolean {
    return this.substitutionsLoading || (this.isAdmin && (
      this.statsLoading || this.teacherPendingLeaveLoading || this.staffAdoptionLoading
      || (!this.staffAttendance && !this.staffAttendanceFailed)
    ));
  }

  get attentionDataFailed(): boolean {
    return this.substitutionsFailed || (this.isAdmin && (
      this.statsFailed || this.teacherPendingLeaveFailed || this.staffAdoptionError || this.staffAttendanceFailed
    ));
  }

  loadStaffAdoption(): void {
    this.staffAdoptionLoading = true;
    this.staffAdoptionError = false;
    this.staffAdoptionService.getStaffAdoption().pipe(takeUntil(this.destroy$)).subscribe({
      next: response => { this.staffAdoption = response.summary; this.staffAdoptionLoading = false; this.cdr.markForCheck(); },
      error: e => { this.logger.error('Staff adoption load error:', e); this.staffAdoptionLoading = false; this.staffAdoptionError = true; this.cdr.markForCheck(); }
    });
  }

  get staffAdoptionNotStarted(): number {
    return this.staffAdoption ? this.staffAdoption.notStartedTeachers + this.staffAdoption.disabledTeachers : 0;
  }

  /** Reuses the existing ADMIN-only teacher-leave endpoint's status filter — requests the
   *  smallest useful page (size=1) and reads totalElements. Never fired for SUB_ADMIN: the
   *  backend endpoint itself is ADMIN-only. Isolated from the main forkJoin so a failure here
   *  never blocks Staff Attendance / student Pending Leave. */
  loadTeacherPendingLeaveCount(): void {
    this.teacherPendingLeaveLoading = true;
    this.teacherPendingLeaveFailed = false;
    this.teacherLeaveService.getLeaves(0, 1, 'PENDING')
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: response => {
          this.teacherPendingLeaveCount = response.totalElements;
          this.teacherPendingLeaveLoading = false;
          this.cdr.markForCheck();
        },
        error: e => {
          this.logger.error('Teacher pending leave count load error:', e);
          this.teacherPendingLeaveLoading = false;
          this.teacherPendingLeaveFailed = true;
          this.cdr.markForCheck();
        }
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
        error: e => {
          this.logger.error('Upcoming event load error:', e);
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
        error: e => {
          this.logger.error('Next-month event load error:', e);
          this.upcomingEventLoading = false;
          this.upcomingEventFailed = true;
          this.cdr.markForCheck();
        }
      });
  }

  /** Each of these four sources is independently retryable — a failure in one must never
   *  hide or block the others, and a Retry action must only re-request its own source. */
  loadStats(): void {
    this.statsLoading = true;
    this.statsFailed = false;
    this.analyticsService.getStats().pipe(takeUntil(this.destroy$)).subscribe({
      next: stats => {
        this.stats = { ...stats, feesCollectedThisMonth: stats.feesCollectedThisMonth / 100 };
        this.statsLoading = false;
        this.cdr.markForCheck();
      },
      error: e => {
        this.statsFailed = true;
        this.statsLoading = false;
        this.logger.error('Dashboard stats load error:', e);
        this.cdr.markForCheck();
      }
    });
  }

  loadStudentLeaves(): void {
    this.studentLeavesFailed = false;
    this.leaveService.getLeavesPaginated(0, 10).pipe(takeUntil(this.destroy$)).subscribe({
      next: page => { this.recentLeaves = page.content.filter(l => l.status === 'PENDING').slice(0, 5); this.cdr.markForCheck(); },
      error: e => { this.studentLeavesFailed = true; this.logger.error('Student leave preview load error:', e); this.cdr.markForCheck(); }
    });
  }

  loadEntitlement(): void {
    this.entitlementFailed = false;
    this.schoolService.getEntitlement().pipe(takeUntil(this.destroy$)).subscribe({
      next: entitlement => { this.entitlement = entitlement; this.cdr.markForCheck(); },
      error: e => { this.entitlementFailed = true; this.logger.error('Plan entitlement load error:', e); this.cdr.markForCheck(); }
    });
  }

  loadStaffAttendance(): void {
    this.staffAttendanceFailed = false;
    this.teacherCheckinService.getTodaySummary().pipe(takeUntil(this.destroy$)).subscribe({
      next: attendance => { this.staffAttendance = attendance; this.cdr.markForCheck(); },
      error: e => { this.staffAttendanceFailed = true; this.logger.error('Staff attendance summary load error:', e); this.cdr.markForCheck(); }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get greeting(): string {
    const h = this.today.getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  usagePct(current: number, max: number | null): number {
    if (!max || max <= 0) return 0;
    return Math.min(100, Math.round((current / max) * 100));
  }

  usagePctRaw(current: number, max: number | null): number {
    if (!max || max <= 0) return 0;
    return Math.round((current / max) * 100);
  }

  usageBarColor(pct: number, softPct: number | null, hardPct: number | null): string {
    const soft = softPct ?? 90;
    const hard = hardPct ?? 105;
    if (pct >= hard) return '#dc2626';
    if (pct >= soft) return '#d97706';
    return '#059669';
  }

  daysUntil(dateStr: string | null | undefined): number | null {
    if (!dateStr) return null;
    return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
  }

  countdownLabel(): string {
    if (!this.entitlement) return '';
    const s = this.entitlement.subscriptionStatus;
    if (s === 'EXPIRED') return 'Subscription expired';
    if (s === 'GRACE') {
      const d = this.daysUntil(this.entitlement.graceEndsAt);
      if (d === null) return 'Grace period active';
      return d <= 0 ? 'Grace period ended' : d === 1 ? '1 day left in grace' : `${d} days left in grace`;
    }
    if (s === 'TRIAL') {
      const d = this.daysUntil(this.entitlement.trialEndsAt);
      if (d === null || d > 14) return '';
      return d <= 0 ? 'Trial expired' : d === 1 ? '1 day left' : `${d} days left`;
    }
    if (s === 'ACTIVE') {
      const d = this.daysUntil(this.entitlement.expiresAt);
      if (d === null || d > 14) return '';
      return d <= 0 ? 'Expired' : d === 1 ? '1 day left' : `${d} days left`;
    }
    return '';
  }

  showUpgradeCta(): boolean {
    if (!this.entitlement) return false;
    const s = this.entitlement.subscriptionStatus;
    if (s === 'EXPIRED' || s === 'GRACE') return true;
    const d = s === 'TRIAL'
      ? this.daysUntil(this.entitlement.trialEndsAt)
      : this.daysUntil(this.entitlement.expiresAt);
    return d !== null && d <= 7;
  }

  countdownUrgency(): 'critical' | 'warn' | 'info' {
    if (!this.entitlement) return 'info';
    const s = this.entitlement.subscriptionStatus;
    if (s === 'EXPIRED' || s === 'GRACE') return 'critical';
    const d = s === 'TRIAL'
      ? this.daysUntil(this.entitlement.trialEndsAt)
      : this.daysUntil(this.entitlement.expiresAt);
    if (d === null) return 'info';
    if (d <= 3) return 'critical';
    if (d <= 7) return 'warn';
    return 'info';
  }

  get attendanceColor(): string {
    const r = this.stats?.todayAttendanceRate ?? 0;
    if (r >= 85) return '#059669';
    if (r >= 70) return '#d97706';
    return '#dc2626';
  }

  get attendanceGradient(): string {
    const r = this.stats?.todayAttendanceRate ?? 0;
    if (r >= 85) return '--c1:#059669;--c2:#34d399';
    if (r >= 70) return '--c1:#d97706;--c2:#fbbf24';
    return '--c1:#dc2626;--c2:#f87171';
  }

  /** "Not yet checked in" is never returned by the backend directly — today-summary only
   *  reports present/late/absent/half-day/on-leave, and ABSENT is never synthesized for
   *  today (see TeacherAttendanceService), so anyone not yet checked in simply isn't counted
   *  in any of those five buckets. totalTeachers (from /api/dashboard/stats, already fetched
   *  in the same load) is the count of ACTIVE teachers for this school, so the remainder is a
   *  safe, already-available client-side computation — never labelled "Absent". Clamped to 0
   *  defensively since stats and staffAttendance are fetched independently in the same forkJoin. */
  get notYetCheckedIn(): number {
    if (!this.stats || !this.staffAttendance) return 0;
    const accounted = this.staffAttendance.presentCount + this.staffAttendance.lateCount
      + this.staffAttendance.absentCount + this.staffAttendance.halfDayCount + this.staffAttendance.onLeaveCount;
    return Math.max(0, this.stats.totalTeachers - accounted);
  }

  hasFeature(featureKey: string): boolean {
    return this.authState.hasFeature(featureKey);
  }

  /** Same "HH:mm" → "h:mm AM/PM" formatting used across the app for LocalTime-shaped fields. */
  formatEventTime(value: string): string {
    const match = /^(\d{1,2}):(\d{2})/.exec(value);
    if (!match) return value;
    const hour = Number(match[1]);
    const suffix = hour >= 12 ? 'PM' : 'AM';
    return `${hour % 12 || 12}:${match[2]} ${suffix}`;
  }

  private static readonly REASON_TAG_CLASSES = ['tag-violet', 'tag-amber', 'tag-rose', 'tag-indigo', 'tag-emerald', 'tag-cyan'];

  /** Deterministically assigns one of a fixed set of existing Edunexify tag colors to a leave
   *  reason, purely from its text — same reason always renders the same color, and every color
   *  used is already present elsewhere on this dashboard (Quick Actions icon tiles), so no new
   *  palette is introduced. Purely cosmetic grouping, not a real category on the backend. */
  reasonTagClass(reason: string): string {
    let hash = 0;
    for (let i = 0; i < reason.length; i++) hash = (hash * 31 + reason.charCodeAt(i)) >>> 0;
    return AdminDashboardComponent.REASON_TAG_CLASSES[hash % AdminDashboardComponent.REASON_TAG_CLASSES.length];
  }
}
