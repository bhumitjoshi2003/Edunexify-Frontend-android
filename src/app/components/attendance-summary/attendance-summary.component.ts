import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil, switchMap, forkJoin } from 'rxjs';
import { AttendanceService } from '../../services/attendance.service';
import { SchoolHolidayService } from '../../services/school-holiday.service';
import { SchoolHoliday } from '../../interfaces/school-holiday';
import { StudentService } from '../../services/student.service';
import { AuthStateService } from '../../auth/auth-state.service';
import { LoggerService } from '../../services/logger.service';
import { SchoolService, SchoolClass } from '../../services/school.service';
import { SectionService } from '../../services/section.service';
import { Section } from '../../interfaces/section';
import { AcademicSessionService } from '../../services/academic-session.service';
import {
  StudentAttendanceSummary, ClassAttendanceSummary, MonthlyBreakdown,
  DailyDetail, CalendarCell, CellStatus
} from '../../interfaces/attendance-summary';
import { ParentChildContextComponent } from '../parent-child-context/parent-child-context.component';
import { ChildAccess } from '../../interfaces/parent-portal';
import { attendanceHealth } from '../../interfaces/attendance-insights';
import { StudentAttendanceInsightsComponent } from '../attendance-insights/student-attendance-insights.component';
import { ClassAttendanceInsightsComponent } from '../attendance-insights/class-attendance-insights.component';

@Component({
  selector: 'app-attendance-summary',
  standalone: true,
  imports: [CommonModule, FormsModule, ParentChildContextComponent, StudentAttendanceInsightsComponent, ClassAttendanceInsightsComponent],
  templateUrl: './attendance-summary.component.html',
  styleUrl: './attendance-summary.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AttendanceSummaryComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  /** Cancels in-flight summary/calendar requests whenever the report is reset — e.g. a parent
   *  switching child — so a late answer for the previous student never lands on this one. */
  private readonly cancelReportRequests$ = new Subject<void>();
  private loadStudentList$ = new Subject<{ className: string; sectionId: number | undefined }>();

  role = '';
  userId = '';
  userClassName = '';

  viewMode: 'student' | 'class' = 'student';
  periodType: 'month' | 'year' = 'month';
  selectedMonth: number = new Date().getMonth() + 1;
  selectedYear: number = new Date().getFullYear();
  selectedSession: string = '';
  selectedClass: string = '';
  selectedStudentId: string = '';

  studentList: { studentId: string; name: string }[] = [];
  studentSummary: StudentAttendanceSummary | null = null;
  classSummary: ClassAttendanceSummary[] = [];

  isLoading = false;
  error: string | null = null;

  // ── Calendar state ──────────────────────────────────────────────
  readonly DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  /** @deprecated Use DAY_LABELS — kept for template compatibility */
  readonly dayNames = this.DAY_LABELS;

  /** Month view: single calendar toggle */
  calendarExpanded = false;
  calendarLoading = false;
  currentCalendarWeeks: CalendarCell[][] = [];

  /** Year view: per-row expand state */
  expandedRowKeys = new Set<string>();
  rowCalendarWeeks = new Map<string, CalendarCell[][]>();
  rowCalendarLoading = new Set<string>();
  expandAllActive = false;

  /** Shared cache so we don't re-fetch on re-expand */
  private dailyDetailCache = new Map<string, DailyDetail>();
  private holidayCache = new Map<string, Map<string, string>>();

  classList: string[] = [];
  managedClasses: SchoolClass[] = [];
  sections: Section[] = [];
  selectedSectionId: number | null = null;
  readonly months = [
    { value: 1, label: 'January' }, { value: 2, label: 'February' }, { value: 3, label: 'March' },
    { value: 4, label: 'April' }, { value: 5, label: 'May' }, { value: 6, label: 'June' },
    { value: 7, label: 'July' }, { value: 8, label: 'August' }, { value: 9, label: 'September' },
    { value: 10, label: 'October' }, { value: 11, label: 'November' }, { value: 12, label: 'December' }
  ];
  sessions: string[] = [];
  years: number[] = [];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private attendanceService: AttendanceService,
    private studentService: StudentService,
    private authStateService: AuthStateService,
    private logger: LoggerService,
    private cdr: ChangeDetectorRef,
    private schoolService: SchoolService,
    private academicSessionService: AcademicSessionService,
    private sectionService: SectionService,
    private holidayService: SchoolHolidayService
  ) {}

  ngOnInit(): void {
    const user = this.authStateService.getUser();
    this.role = user?.role ?? '';
    this.userId = user?.userId ?? '';
    this.userClassName = user?.className ?? '';

    if (this.role !== 'PARENT') {
      this.schoolService.getClasses().pipe(takeUntil(this.destroy$)).subscribe({
        next: classes => { this.classList = classes; this.cdr.markForCheck(); },
        error: (err) => this.logger.error('Failed to load classes', err)
      });
      this.schoolService.getManagedClasses().pipe(takeUntil(this.destroy$)).subscribe({
        next: classes => { this.managedClasses = classes; },
        error: (err) => this.logger.error('Failed to load managed classes', err)
      });
    }

    this.academicSessionService.getAllSessions().pipe(takeUntil(this.destroy$)).subscribe({
      next: sessions => {
        this.sessions = sessions.map(s => s.label);
        const current = sessions.find(s => s.current);
        this.selectedSession = current ? current.label : (this.sessions[0] ?? '');
        this.initYears();
        this.cdr.markForCheck();
      },
      error: () => {
        this.initYears();
        this.cdr.markForCheck();
      }
    });

    // switchMap cancels any in-flight student-list request when section/class changes
    this.loadStudentList$.pipe(
      takeUntil(this.destroy$),
      switchMap(({ className, sectionId }) =>
        this.studentService.getActiveStudentsByClass(className, sectionId)
      )
    ).subscribe({
      next: (students) => { this.studentList = students; this.cdr.markForCheck(); },
      error: (err) => this.logger.error('Failed to load students:', err)
    });

    if (this.role === 'STUDENT') {
      this.selectedStudentId = this.userId;
      this.loadReport();
      return;
    }

    if (this.role === 'TEACHER' && this.userClassName) {
      this.selectedClass = this.userClassName;
      this.loadSectionsForClass(this.selectedClass);
      this.loadStudentList();
    }

    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(params => {
      if (params['studentId']) {
        this.selectedStudentId = params['studentId'];
        if (params['className']) {
          this.selectedClass = params['className'];
          this.loadStudentList();
        }
        this.loadReport();
        this.cdr.markForCheck();
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initYears(): void {
    const yearSet = new Set<number>();
    for (const label of this.sessions) {
      label.split('-').map(Number).forEach(y => { if (y) yearSet.add(y); });
    }
    this.years = [...yearSet].sort((a, b) => b - a);
    if (this.years.length === 0) {
      this.years.push(new Date().getFullYear());
    }
  }

  setViewMode(mode: 'student' | 'class'): void {
    this.viewMode = mode;
    this.studentSummary = null;
    this.classSummary = [];
    this.error = null;
    this.resetCalendarState();
    this.cdr.markForCheck();
  }

  setPeriodType(type: 'month' | 'year'): void {
    this.periodType = type;
    this.studentSummary = null;
    this.classSummary = [];
    this.error = null;
    this.resetCalendarState();
    this.cdr.markForCheck();
  }

  onClassChange(): void {
    this.selectedStudentId = '';
    this.studentSummary = null;
    this.classSummary = [];
    this.studentList = [];
    this.selectedSectionId = null;
    this.sections = [];
    this.resetCalendarState();
    if (this.selectedClass) this.loadSectionsForClass(this.selectedClass);
    if (this.viewMode === 'student' && this.selectedClass) this.loadStudentList();
    this.cdr.markForCheck();
  }

  loadSectionsForClass(className: string): void {
    const cls = this.managedClasses.find(c => c.name === className);
    if (!cls) return;
    this.sectionService.getSectionsForClass(cls.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: sections => { this.sections = sections; this.cdr.markForCheck(); },
      error: (err) => this.logger.error('Failed to load sections', err)
    });
  }

  onSectionSelect(sectionId: number | null): void {
    this.selectedSectionId = sectionId;
    this.selectedStudentId = '';
    this.studentSummary = null;
    this.classSummary = [];
    this.studentList = [];
    this.resetCalendarState();
    if (this.viewMode === 'student' && this.selectedClass) this.loadStudentList();
    this.cdr.markForCheck();
  }

  private resetCalendarState(): void {
    this.cancelReportRequests$.next();
    this.calendarExpanded = false;
    this.calendarLoading = false;
    this.currentCalendarWeeks = [];
    this.expandedRowKeys.clear();
    this.rowCalendarWeeks.clear();
    this.rowCalendarLoading.clear();
    this.expandAllActive = false;
    this.dailyDetailCache.clear();
    this.holidayCache.clear();
  }

  loadStudentList(): void {
    if (!this.selectedClass) return;
    this.loadStudentList$.next({
      className: this.selectedClass,
      sectionId: this.selectedSectionId ?? undefined,
    });
  }

  loadReport(): void {
    this.error = null;
    this.resetCalendarState();
    if (this.viewMode === 'student') {
      if (!this.selectedStudentId) { this.error = 'Please select a student.'; this.cdr.markForCheck(); return; }
      this.loadStudentSummary();
    } else {
      if (!this.selectedClass) { this.error = 'Please select a class.'; this.cdr.markForCheck(); return; }
      this.loadClassSummary();
    }
  }

  private buildParams(): Record<string, string | number> {
    if (this.periodType === 'month') return { type: 'month', month: this.selectedMonth, year: this.selectedYear };
    return { type: 'year', session: this.selectedSession };
  }

  private loadStudentSummary(): void {
    this.isLoading = true;
    this.studentSummary = null;
    this.cdr.markForCheck();

    this.attendanceService.getStudentSummary(this.selectedStudentId, this.buildParams())
      .pipe(takeUntil(this.destroy$), takeUntil(this.cancelReportRequests$)).subscribe({
        next: (data) => { this.studentSummary = data; this.isLoading = false; this.cdr.markForCheck(); },
        error: (err) => {
          this.logger.error('Failed to load student summary:', err);
          this.error = 'Failed to load attendance summary. Please try again.';
          this.isLoading = false;
          this.cdr.markForCheck();
        }
      });
  }

  private loadClassSummary(): void {
    this.isLoading = true;
    this.classSummary = [];
    this.cdr.markForCheck();

    this.attendanceService.getClassSummary(this.selectedClass, this.buildParams(), this.selectedSectionId)
      .pipe(takeUntil(this.destroy$), takeUntil(this.cancelReportRequests$)).subscribe({
        next: (data) => { this.classSummary = data; this.isLoading = false; this.cdr.markForCheck(); },
        error: (err) => {
          this.logger.error('Failed to load class summary:', err);
          this.error = 'Failed to load class attendance summary. Please try again.';
          this.isLoading = false;
          this.cdr.markForCheck();
        }
      });
  }

  // ── Calendar: Month View ─────────────────────────────────────────

  toggleMonthCalendar(): void {
    this.calendarExpanded = !this.calendarExpanded;
    if (!this.calendarExpanded) {
      this.cdr.markForCheck();
      return;
    }
    const key = `${this.selectedMonth}-${this.selectedYear}`;
    if (this.dailyDetailCache.has(key) && this.holidayCache.has(key)) {
      this.currentCalendarWeeks = this.buildCalendarCells(this.selectedYear, this.selectedMonth, this.dailyDetailCache.get(key)!, this.holidayCache.get(key)!);
      this.cdr.markForCheck();
    } else {
      this.calendarLoading = true;
      this.currentCalendarWeeks = [];
      this.cdr.markForCheck();

      const start = `${this.selectedYear}-${String(this.selectedMonth).padStart(2, '0')}-01`;
      const daysInMonth = new Date(this.selectedYear, this.selectedMonth, 0).getDate();
      const end = `${this.selectedYear}-${String(this.selectedMonth).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

      forkJoin([
        this.attendanceService.getStudentDailyDetail(this.selectedStudentId, this.selectedMonth, this.selectedYear),
        this.holidayService.getHolidaysByRange(start, end)
      ]).pipe(takeUntil(this.destroy$), takeUntil(this.cancelReportRequests$)).subscribe({
          next: ([detail, holidays]) => {
            this.dailyDetailCache.set(key, detail);
            const hMap = new Map<string, string>();
            holidays.forEach(h => {
              const d = new Date(h.startDate);
              const end = new Date(h.endDate);
              while (d <= end) {
                hMap.set(d.toISOString().slice(0, 10), h.name);
                d.setDate(d.getDate() + 1);
              }
            });
            this.holidayCache.set(key, hMap);
            this.currentCalendarWeeks = this.buildCalendarCells(this.selectedYear, this.selectedMonth, detail, hMap);
            this.calendarLoading = false;
            this.cdr.markForCheck();
          },
          error: (err) => {
            this.logger.error('Failed to load daily detail:', err);
            this.calendarLoading = false;
            this.cdr.markForCheck();
          }
        });
    }
  }

  // ── Calendar: Year View rows ─────────────────────────────────────

  getRowKey(row: MonthlyBreakdown): string {
    return `${row.month}-${row.year}`;
  }

  isRowExpanded(row: MonthlyBreakdown): boolean {
    return this.expandedRowKeys.has(this.getRowKey(row));
  }

  isRowLoading(row: MonthlyBreakdown): boolean {
    return this.rowCalendarLoading.has(this.getRowKey(row));
  }

  getRowCalendar(row: MonthlyBreakdown): CalendarCell[][] {
    return this.rowCalendarWeeks.get(this.getRowKey(row)) ?? [];
  }

  toggleRowCalendar(row: MonthlyBreakdown): void {
    const key = this.getRowKey(row);
    if (this.expandedRowKeys.has(key)) {
      this.expandedRowKeys.delete(key);
      if (this.expandedRowKeys.size === 0) this.expandAllActive = false;
      this.cdr.markForCheck();
      return;
    }
    this.expandedRowKeys.add(key);
    this.loadRowDetailIfNeeded(row, key);
    this.cdr.markForCheck();
  }

  private loadRowDetailIfNeeded(row: MonthlyBreakdown, key: string): void {
    if (this.dailyDetailCache.has(key) && this.holidayCache.has(key)) {
      const detail = this.dailyDetailCache.get(key)!;
      const monthNum = this.getMonthNumber(row.month);
      this.rowCalendarWeeks.set(key, this.buildCalendarCells(row.year, monthNum, detail, this.holidayCache.get(key)!));
      this.cdr.markForCheck();
      return;
    }
    const monthNum = this.getMonthNumber(row.month);
    this.rowCalendarLoading.add(key);
    this.cdr.markForCheck();

    const start = `${row.year}-${String(monthNum).padStart(2, '0')}-01`;
    const daysInMonth = new Date(row.year, monthNum, 0).getDate();
    const end = `${row.year}-${String(monthNum).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

    forkJoin([
      this.attendanceService.getStudentDailyDetail(this.selectedStudentId, monthNum, row.year),
      this.holidayService.getHolidaysByRange(start, end)
    ]).pipe(takeUntil(this.destroy$), takeUntil(this.cancelReportRequests$)).subscribe({
        next: ([detail, holidays]) => {
          this.dailyDetailCache.set(key, detail);
          const hMap = new Map<string, string>();
          holidays.forEach(h => {
            const d = new Date(h.startDate);
            const end = new Date(h.endDate);
            while (d <= end) {
              hMap.set(d.toISOString().slice(0, 10), h.name);
              d.setDate(d.getDate() + 1);
            }
          });
          this.holidayCache.set(key, hMap);
          this.rowCalendarWeeks.set(key, this.buildCalendarCells(row.year, monthNum, detail, hMap));
          this.rowCalendarLoading.delete(key);
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.logger.error('Failed to load daily detail for row:', err);
          this.rowCalendarLoading.delete(key);
          this.cdr.markForCheck();
        }
      });
  }

  expandAll(): void {
    this.expandAllActive = true;
    const breakdown = this.studentSummary?.monthlyBreakdown ?? [];
    breakdown.forEach(row => {
      const key = this.getRowKey(row);
      this.expandedRowKeys.add(key);
      this.loadRowDetailIfNeeded(row, key);
    });
    this.cdr.markForCheck();
  }

  collapseAll(): void {
    this.expandAllActive = false;
    this.expandedRowKeys.clear();
    this.cdr.markForCheck();
  }

  // ── Calendar builder ─────────────────────────────────────────────

  private buildCalendarCells(year: number, month: number, detail: DailyDetail, holidays: Map<string, string> = new Map()): CalendarCell[][] {
    const schoolDaySet = new Set(detail.schoolDays);
    const absentDaySet = new Set(detail.absentDays);
    const approvedLeaveSet = new Set(detail.approvedLeaveDays ?? []);
    const nonWorkingDaySet = new Set(detail.nonWorkingDays ?? []);
    const explicitStatuses = detail.statuses ?? {};

    // Monday-first: map getDay() (0=Sun,1=Mon,...,6=Sat) → (0=Mon,...,6=Sun)
    const firstDow = (new Date(year, month - 1, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month, 0).getDate();

    const cells: CalendarCell[] = [];

    for (let i = 0; i < firstDow; i++) {
      cells.push({ date: null, day: null, status: 'empty' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const cellDate = new Date(year, month - 1, d);
      let status: CellStatus;
      let holidayName: string | undefined;

      if (cellDate > today) {
        // Future date — not yet reachable
        status = 'future';
      } else if (schoolDaySet.has(dateStr)) {
        // Attendance was recorded for the student — P/A wins (the class met even on a holiday)
        const absent = explicitStatuses[dateStr] === 'ABSENT' || absentDaySet.has(dateStr);
        status = !absent ? 'present' : approvedLeaveSet.has(dateStr) ? 'leave' : 'absent';
      } else if (holidays.has(dateStr)) {
        // No attendance marked and it's a holiday
        status = 'holiday';
        holidayName = holidays.get(dateStr);
      } else if (nonWorkingDaySet.has(dateStr)) {
        status = 'closed';
      } else {
        // Past school day with no attendance data yet
        status = 'unmarked';
      }
      cells.push({ date: dateStr, day: d, status, holidayName });
    }

    const weeks: CalendarCell[][] = [];
    for (let i = 0; i < cells.length; i += 7) {
      weeks.push(cells.slice(i, i + 7));
    }
    return weeks;
  }

  // ── Helpers ──────────────────────────────────────────────────────

  getMonthNumber(monthName: string): number {
    return this.months.find(m => m.label === monthName)?.value ?? 1;
  }

  /** Same 75% rule and wording as the Session attendance overview. */
  getAttendanceClass(pct: number, recordedDays: number): string {
    const health = attendanceHealth(pct, recordedDays);
    return health === 'healthy' ? 'status-green' : health === 'low' ? 'status-red' : 'status-none';
  }

  getAttendanceLabel(pct: number, recordedDays: number): string {
    const health = attendanceHealth(pct, recordedDays);
    return health === 'healthy' ? 'Healthy' : health === 'low' ? 'Low Attendance' : 'No Records';
  }

  getPeriodLabel(): string {
    if (this.periodType === 'month') {
      return `${this.months.find(m => m.value === this.selectedMonth)?.label} ${this.selectedYear}`;
    }
    return `Academic Year ${this.selectedSession}`;
  }

  canShowViewToggle(): boolean {
    return this.role === 'ADMIN' || this.role === 'SUB_ADMIN' || this.role === 'SUPER_ADMIN' || this.role === 'TEACHER';
  }

  canChangeClass(): boolean {
    return this.role === 'ADMIN' || this.role === 'SUB_ADMIN' || this.role === 'SUPER_ADMIN';
  }

  /** The admin's selected class as an id (the class selector works with names). */
  get selectedClassId(): number | null {
    if (!this.selectedClass) return null;
    return this.managedClasses.find(c => c.name === this.selectedClass)?.id ?? null;
  }

  isSelfServiceView(): boolean {
    return this.role === 'STUDENT' || this.role === 'PARENT';
  }

  printReport(): void {
    window.print();
  }

  goBack(): void {
    this.router.navigate(['/dashboard/student-list']);
  }

  onChildTabSelected(child: ChildAccess): void {
    if (!child.canViewAttendance) {
      this.error = "You do not have permission to view this child's attendance.";
      this.cdr.markForCheck();
      return;
    }
    this.selectedStudentId = child.studentId;
    this.selectedClass = child.className;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { studentId: child.studentId, className: child.className },
      replaceUrl: true,
    });
    this.loadReport();
  }

  trackByMonth(_: number, row: MonthlyBreakdown): string { return `${row.month}-${row.year}`; }
  trackByStudentId(_: number, row: ClassAttendanceSummary): string { return row.studentId; }
  trackByIndex(i: number): number { return i; }
}
