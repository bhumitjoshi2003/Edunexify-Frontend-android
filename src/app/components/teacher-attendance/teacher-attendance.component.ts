import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, OnDestroy, inject } from '@angular/core';
import { optionalCoordinatorService } from '../../services/coordinator.service';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule, formatDate } from '@angular/common';
import { Router } from '@angular/router';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatInputModule } from '@angular/material/input';
import { MatNativeDateModule } from '@angular/material/core';
import { Subject, of } from 'rxjs';
import { catchError, map, switchMap, takeUntil } from 'rxjs/operators';
import { LoggerService } from '../../services/logger.service';
import { SchoolService, SchoolClass } from '../../services/school.service';
import { SectionService } from '../../services/section.service';
import { Section } from '../../interfaces/section';
import { ToastService } from '../../services/toast.service';
import { AttendanceService } from '../../services/attendance.service';
import { AttendanceSheet, AttendanceStatus } from '../../interfaces/attendance-sheet';
import { AuthStateService } from '../../auth/auth-state.service';
import { getStoredSelectedClass, setStoredSelectedClass } from '../../utils/class-selection-storage.util';

/** One roster row being marked. Everyone starts PRESENT; APPROVED leave starts ABSENT. */
interface MarkRow {
  studentId: string;
  name: string;
  status: AttendanceStatus;
  approvedLeave: boolean;
}

/** Teachers may edit today and the previous three days (admins: any markable date). */
const TEACHER_EDIT_WINDOW_DAYS = 3;

@Component({
  selector: 'app-teacher-attendance',
  imports: [
    FormsModule,
    CommonModule,
    MatDatepickerModule,
    MatInputModule,
    MatNativeDateModule,
  ],
  templateUrl: './teacher-attendance.component.html',
  styleUrl: './teacher-attendance.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeacherAttendanceComponent implements OnInit, OnDestroy {
  private coordinators = optionalCoordinatorService();
  /** Read only for the coordinator-attendance route; absent when the screen is built outside a router. */
  private route: ActivatedRoute | null = (() => {
    try { return inject(ActivatedRoute, { optional: true }); } catch { return null; }
  })();

  private destroy$ = new Subject<void>();
  private reload$ = new Subject<void>();

  isAdmin = false;
  coordinatorMode = false;
  correctionReason = '';
  private coordinatorUnits: { classId: number; sectionId: number | null }[] = [];
  attendanceDate: Date = this.getTodayDateWithoutTime();
  private dateChosen = false;

  classes: SchoolClass[] = [];
  selectedClassId: number | null = null;
  sections: Section[] = [];
  selectedSectionId: number | null = null;
  private schoolSlug: string | null = null;
  private workingDays = new Set<string>();

  sheet: AttendanceSheet | null = null;
  rows: MarkRow[] = [];
  loading = false;
  loadError: string | null = null;
  isSaving = false;
  isDeleting = false;

  constructor(
    private attendanceService: AttendanceService,
    private authStateService: AuthStateService,
    private logger: LoggerService,
    private cdr: ChangeDetectorRef,
    private toast: ToastService,
    private schoolService: SchoolService,
    private sectionService: SectionService,
    private router: Router
  ) { }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  ngOnInit(): void {
    const user = this.authStateService.getUser();
    const role = this.authStateService.getUserRole?.() ?? user?.role;
    if (!['ADMIN', 'TEACHER'].includes(role ?? '')) {
      this.router.navigate(['/dashboard']);
      return;
    }
    // The coordinator-attendance route: a Coordinator picks any section they cover and corrects it
    // with a reason. Their own class stays on the ordinary teacher route.
    this.coordinatorMode = this.route?.snapshot?.data?.['coordinatorMode'] === true && this.authStateService.isCoordinator() && !!this.coordinators;
    this.isAdmin = role === 'ADMIN' || this.coordinatorMode;
    this.schoolSlug = user?.schoolSlug ?? null;

    // Latest request wins: switching class/section/date cancels an in-flight roster load.
    this.reload$.pipe(
      switchMap(() => {
        const date = this.dateChosen ? formatDate(this.attendanceDate, 'yyyy-MM-dd', 'en') : null;
        return this.attendanceService.getSheet(date, this.selectedClassId, this.selectedSectionId).pipe(
          map(sheet => ({ sheet, error: null as string | null })),
          catchError(err => {
            this.logger.error('Error loading attendance sheet:', err);
            const message = err?.status === 403
              ? 'Attendance can only be marked by the class teacher of this class, or a school admin.'
              : this.errorMessage(err, 'Failed to load the class roster.');
            return of({ sheet: null, error: message });
          })
        );
      }),
      takeUntil(this.destroy$)
    ).subscribe(({ sheet, error }) => {
      this.loading = false;
      this.loadError = error;
      this.applySheet(sheet);
    });

    // The working-day calendar only greys out datepicker days; the server enforces every date rule.
    this.attendanceService.getCalendarConfig().pipe(takeUntil(this.destroy$)).subscribe({
      next: config => {
        this.workingDays = new Set(config.workingDays.split(',').map(d => d.trim().toUpperCase()).filter(Boolean));
        this.cdr.markForCheck();
      },
      error: err => this.logger.error('Error loading school calendar:', err)
    });

    if (this.coordinatorMode) {
      this.coordinators!.units().pipe(takeUntil(this.destroy$)).subscribe({
        next: units => { this.coordinatorUnits = units; this.loadAdminClasses(); },
        error: err => { this.loadError = this.errorMessage(err, 'Your coordination scope could not be loaded.'); this.cdr.markForCheck(); }
      });
    } else if (this.isAdmin) {
      this.loadAdminClasses();
    } else {
      this.reload();
    }
  }

  // ─── Scope selection ──────────────────────────────────────────────

  private loadAdminClasses(): void {
    this.schoolService.getManagedClasses().pipe(takeUntil(this.destroy$)).subscribe({
      next: classes => {
        this.classes = classes.filter(c => c.active
          && (!this.coordinatorMode || this.coordinatorUnits.some(u => u.classId === c.id)));
        const stored = getStoredSelectedClass(this.schoolSlug, this.classes.map(c => c.name), '');
        const initial = this.classes.find(c => c.name === stored) ?? null;
        this.cdr.markForCheck();
        if (initial) this.onClassSelect(initial);
      },
      error: err => {
        this.logger.error('Failed to load classes:', err);
        this.toast.error('Error', 'Failed to load class list.');
      }
    });
  }

  onClassSelect(cls: SchoolClass): void {
    this.selectedClassId = cls.id;
    this.selectedSectionId = null;
    this.sections = [];
    this.applySheet(null);
    setStoredSelectedClass(this.schoolSlug, cls.name);
    this.sectionService.getSectionsForClass(cls.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: sections => {
        if (this.selectedClassId !== cls.id) return;
        this.sections = sections.filter(s => s.active && s.id != null && (!this.coordinatorMode
          || this.coordinatorUnits.some(u => u.classId === cls.id && (u.sectionId == null || u.sectionId === s.id))));
        // Attendance is marked per section: start on the first one.
        this.selectedSectionId = this.sections.length > 0 ? this.sections[0].id! : null;
        this.reload();
      },
      error: err => {
        this.logger.error('Failed to load sections', err);
        this.toast.error('Error', 'Failed to load sections for this class.');
      }
    });
  }

  onSectionSelect(sectionId: number): void {
    if (this.selectedSectionId === sectionId) return;
    this.selectedSectionId = sectionId;
    this.reload();
  }

  onDateChange(event: { value: Date | null }): void {
    if (!event.value) return;
    const date = new Date(event.value);
    date.setHours(0, 0, 0, 0);
    this.attendanceDate = date;
    this.dateChosen = true;
    this.reload();
  }

  private reload(): void {
    if (this.isAdmin && this.selectedClassId == null) return;
    this.loading = true;
    this.loadError = null;
    this.cdr.markForCheck();
    this.reload$.next();
  }

  private applySheet(sheet: AttendanceSheet | null): void {
    this.sheet = sheet;
    this.rows = (sheet?.students ?? []).map(s => ({
      studentId: s.studentId,
      name: s.name,
      status: s.status ?? (s.approvedLeave ? 'ABSENT' : 'PRESENT'),
      approvedLeave: s.approvedLeave,
    }));
    if (sheet && !this.dateChosen) {
      // First load: the server picked the school's own "today".
      const [y, m, d] = sheet.date.split('-').map(Number);
      this.attendanceDate = new Date(y, m - 1, d);
    }
    this.cdr.markForCheck();
  }

  // ─── Marking ──────────────────────────────────────────────────────

  toggle(row: MarkRow): void {
    if (!this.canEdit) return;
    row.status = row.status === 'PRESENT' ? 'ABSENT' : 'PRESENT';
  }

  setStatus(row: MarkRow, status: AttendanceStatus): void {
    if (!this.canEdit) return;
    row.status = status;
  }

  markAllPresent(): void {
    if (!this.canEdit) return;
    this.rows.forEach(r => r.status = 'PRESENT');
  }

  get presentCount(): number { return this.rows.filter(r => r.status === 'PRESENT').length; }
  get absentCount(): number { return this.rows.filter(r => r.status === 'ABSENT').length; }
  get approvedLeaveCount(): number { return this.rows.filter(r => r.approvedLeave).length; }

  get isWithinTeacherWindow(): boolean {
    if (this.isAdmin) return true;
    const today = this.getTodayDateWithoutTime();
    const earliest = new Date(today);
    earliest.setDate(today.getDate() - TEACHER_EDIT_WINDOW_DAYS);
    return this.attendanceDate >= earliest && this.attendanceDate <= today;
  }

  get canEdit(): boolean {
    return !!this.sheet && this.sheet.markable && this.isWithinTeacherWindow && !this.isSaving && !this.isDeleting;
  }

  async saveAttendance(): Promise<void> {
    const sheet = this.sheet;
    if (!sheet || !this.canEdit || this.rows.length === 0) return;
    if (this.coordinatorMode && !this.correctionReason.trim()) {
      this.toast.warning('Reason required', 'Give a reason for correcting this class\'s attendance.');
      return;
    }

    const absent = this.absentCount;
    const confirmed = await this.toast.confirm({
      title: sheet.submitted ? 'Update Attendance' : 'Submit Attendance',
      message: `${this.presentCount} present and ${absent} absent out of ${this.rows.length} students`
        + ` for ${this.displayScope} on ${formatDate(sheet.date, 'd MMM y', 'en')}.`
        + (sheet.submitted ? ' This replaces the attendance already saved for this day.' : ''),
      icon: 'question',
      confirmText: sheet.submitted ? 'Yes, Update' : 'Yes, Submit',
      cancelText: 'Cancel',
      danger: false,
    });
    // Re-check after the dialog: a double-click or a scope change while it was open must not resubmit.
    if (!confirmed || this.isSaving || this.sheet !== sheet) return;

    this.isSaving = true;
    this.cdr.markForCheck();
    this.attendanceService.submitSheet({
      classId: this.isAdmin ? sheet.classId : null,
      sectionId: this.isAdmin ? sheet.sectionId : null,
      date: sheet.date,
      students: this.rows.map(r => ({ studentId: r.studentId, status: r.status })),
      ...(this.coordinatorMode ? { correctionReason: this.correctionReason.trim() } : {}),
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: saved => {
        this.isSaving = false;
        this.correctionReason = '';
        this.applySheet(saved);
        this.toast.success(sheet.submitted ? 'Attendance Updated' : 'Attendance Submitted',
          `${this.presentCount} present, ${this.absentCount} absent.`);
      },
      error: err => {
        this.isSaving = false;
        this.logger.error('Error saving attendance:', err);
        this.toast.error('Could not save attendance', this.errorMessage(err, 'Please reload the roster and try again.'));
        this.cdr.markForCheck();
      },
    });
  }

  async deleteAttendance(): Promise<void> {
    const sheet = this.sheet;
    if (!sheet?.submitted || !this.canEdit) return;
    const confirmed = await this.toast.confirm({
      title: 'Delete Attendance',
      message: `Delete the saved attendance for ${this.displayScope} on ${formatDate(sheet.date, 'd MMM y', 'en')}?`
        + ' Students will have no attendance recorded for this day.',
      confirmText: 'Yes, Delete',
      cancelText: 'Cancel',
      danger: true,
    });
    if (!confirmed || this.isDeleting || this.sheet !== sheet) return;

    this.isDeleting = true;
    this.cdr.markForCheck();
    this.attendanceService.deleteSheet(sheet.date, this.isAdmin ? sheet.classId : null, this.isAdmin ? sheet.sectionId : null)
      .pipe(takeUntil(this.destroy$)).subscribe({
        next: () => {
          this.isDeleting = false;
          this.toast.success('Deleted', 'Attendance for this day has been removed.');
          this.reload();
        },
        error: err => {
          this.isDeleting = false;
          this.logger.error('Error deleting attendance:', err);
          this.toast.error('Could not delete attendance', this.errorMessage(err, 'Please try again.'));
          this.cdr.markForCheck();
        },
      });
  }

  // ─── View helpers ─────────────────────────────────────────────────

  get displayScope(): string {
    if (!this.sheet) return '';
    return this.sheet.sectionName ? `Class ${this.sheet.className} – ${this.sheet.sectionName}` : `Class ${this.sheet.className}`;
  }

  /** The server stores submission times in UTC without an offset. */
  get lastSavedAt(): Date | null {
    const at = this.sheet?.submitted ? this.sheet.updatedAt : null;
    if (!at) return null;
    return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(at) ? at : at + 'Z');
  }

  /** Datepicker: no future days, and only configured working weekdays once the calendar has loaded. */
  dateFilter = (date: Date | null): boolean => {
    if (!date) return false;
    if (date > this.getTodayDateWithoutTime()) return false;
    if (this.workingDays.size === 0) return true;
    const dayNames = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    return this.workingDays.has(dayNames[date.getDay()]);
  };

  getRelativeDate(offset: number): string {
    const date = this.getTodayDateWithoutTime();
    date.setDate(date.getDate() + offset);
    return formatDate(date, 'd MMM', 'en');
  }

  get editWindowStart(): string { return this.getRelativeDate(-TEACHER_EDIT_WINDOW_DAYS); }

  trackByStudentId(_: number, row: MarkRow): string { return row.studentId; }
  trackByClassId(_: number, cls: SchoolClass): number { return cls.id; }
  trackBySectionId(_: number, section: Section): number | undefined { return section.id; }

  private getTodayDateWithoutTime(): Date {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }

  private errorMessage(err: any, fallback: string): string {
    const body = err?.error;
    if (typeof body === 'string' && body.trim()) return body;
    return body?.message || fallback;
  }
}
