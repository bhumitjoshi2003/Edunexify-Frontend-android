import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { optionalCoordinatorService } from '../../services/coordinator.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable, Subject, takeUntil, map } from 'rxjs';
import { TeacherCheckinService } from '../../services/teacher-checkin.service';
import { TeacherService } from '../../services/teacher.service';
import { TeacherAttendanceRecord, TeacherAttendanceSummary, TeacherAttendanceSessionSummary, SchoolTiming } from '../../interfaces/teacher-checkin';
import { Teacher } from '../../interfaces/teacher';
import { TenantService } from '../../services/tenant.service';
import { LoggerService } from '../../services/logger.service';
import { ToastService } from '../../services/toast.service';
import { AcademicSessionService } from '../../services/academic-session.service';
import { AuthStateService } from '../../auth/auth-state.service';
import { TeacherAttendanceCorrection } from '../../interfaces/teacher-checkin';

@Component({
  selector: 'app-staff-attendance',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './staff-attendance.component.html',
  styleUrl: './staff-attendance.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StaffAttendanceComponent implements OnInit, OnDestroy {
  private coordinators = optionalCoordinatorService();

  private destroy$ = new Subject<void>();

  selectedDate: string;
  records: TeacherAttendanceRecord[] = [];
  allTeachers: Teacher[] = [];
  isLoading = false;

  // Summary view
  viewMode: 'daily' | 'monthly' | 'individual' = 'daily';
  summaryMonth: number;
  summaryYear: number;
  monthlySummary: TeacherAttendanceSummary | null = null;
  loadingSummary = false;
  individualPeriod: 'month' | 'session' = 'month';
  selectedTeacherId = '';
  individualMonth: number;
  individualYear: number;
  selectedSession = '';
  sessionOptions: string[] = [];
  loadingSessions = false;
  individualSummary: TeacherAttendanceSummary | null = null;
  individualSessionSummary: TeacherAttendanceSessionSummary | null = null;
  loadingIndividual = false;

  // Admin mark dialog
  showMarkDialog = false;
  isEditMode = false;
  editingRecordId: number | null = null;
  markForm = { teacherId: '', date: '', status: 'ON_TIME', checkInTime: '', checkOutTime: '' };
  isMarking = false;
  formDirty = false;

  // School timing for auto-status
  schoolTiming: SchoolTiming | null = null;

  readonly statusOptions = [
    { value: 'ON_TIME', label: 'On Time' },
    { value: 'LATE', label: 'Late' },
    { value: 'ABSENT', label: 'Absent' },
    { value: 'HALF_DAY', label: 'Half Day' },
    { value: 'ON_LEAVE', label: 'On Leave' },
  ];

  readonly monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  constructor(
    private checkinService: TeacherCheckinService,
    private teacherService: TeacherService,
    public tenantService: TenantService,
    private logger: LoggerService,
    private toast: ToastService,
    private academicSessionService: AcademicSessionService,
    private cdr: ChangeDetectorRef,
    private authState: AuthStateService
  ) {
    const now = new Date();
    this.selectedDate = now.toISOString().slice(0, 10);
    this.summaryMonth = now.getMonth() + 1;
    this.summaryYear = now.getFullYear();
    this.individualMonth = now.getMonth() + 1;
    this.individualYear = now.getFullYear();
  }

  /** The Principal corrects with a reason, sees the history, and never edits their own record. */
  isPrincipal = false;
  ownTeacherIds = new Set<string>();
  /** The caller's own record plus, for a Coordinator, the Principal's and other Coordinators' (server-resolved). */
  protectedIds = new Set<string>();
  correctionReason = '';
  correctionHistory: TeacherAttendanceCorrection[] = [];
  historyLoading = false;

  ngOnInit(): void {
    // A Coordinator corrects like the Principal (reason, history, never their own record), in scope.
    this.isPrincipal = this.authState.getUserRole() === 'PRINCIPAL' || this.authState.isCoordinator();
    if (this.isPrincipal) this.loadOwnTeacherIds();
    this.loadDailyRecords();
    this.loadTeachers();
    this.loadSchoolTiming();
    this.loadSessionOptions();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadDailyRecords(): void {
    this.isLoading = true;
    this.cdr.markForCheck();
    this.checkinService.getByDate(this.selectedDate)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (records) => {
          this.records = records;
          this.isLoading = false;
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.logger.error('Failed to load attendance records', err);
          this.isLoading = false;
          this.cdr.markForCheck();
        }
      });
  }

  loadTeachers(): void {
    const teachers$ = this.authState.isCoordinator() && this.coordinators
      ? this.coordinators!.teachers().pipe(map(list => list.map(t => ({ teacherId: t.teacherId, name: t.name } as Teacher))))
      : this.teacherService.getAllTeachers();
    teachers$
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (teachers) => {
          // Deduplicate by teacherId
          const seen = new Set<string>();
          this.allTeachers = teachers.filter(t => {
            if (seen.has(t.teacherId)) return false;
            seen.add(t.teacherId);
            return true;
          });
          this.cdr.markForCheck();
        },
        error: (err) => this.logger.error('Failed to load teachers', err)
      });
  }

  private loadSchoolTiming(): void {
    this.checkinService.getSchoolTiming()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (timing) => {
          this.schoolTiming = timing;
          this.cdr.markForCheck();
        },
        error: () => {} // non-critical
      });
  }

  loadMonthlySummary(): void {
    this.loadingSummary = true;
    this.cdr.markForCheck();
    this.checkinService.getSummary(this.summaryMonth, this.summaryYear)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (summary) => {
          this.monthlySummary = summary;
          this.loadingSummary = false;
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.logger.error('Failed to load monthly summary', err);
          this.loadingSummary = false;
          this.cdr.markForCheck();
        }
      });
  }

  onDateChange(): void {
    this.loadDailyRecords();
  }

  switchToMonthly(): void {
    this.viewMode = 'monthly';
    this.loadMonthlySummary();
  }

  switchToDaily(): void {
    this.viewMode = 'daily';
    this.loadDailyRecords();
  }

  switchToIndividual(): void {
    this.viewMode = 'individual';
    if (this.selectedTeacherId) this.loadIndividualReport();
  }

  loadIndividualReport(): void {
    if (!this.selectedTeacherId) {
      this.individualSummary = null;
      this.individualSessionSummary = null;
      return;
    }
    this.loadingIndividual = true;
    this.cdr.markForCheck();
    const request$: Observable<TeacherAttendanceSummary | TeacherAttendanceSessionSummary> = this.individualPeriod === 'month'
      ? this.checkinService.getSummary(this.individualMonth, this.individualYear, this.selectedTeacherId)
      : this.checkinService.getTeacherSessionSummary(this.selectedTeacherId, this.selectedSession);
    request$.pipe(takeUntil(this.destroy$)).subscribe({
      next: (result) => {
        if (this.individualPeriod === 'month') {
          this.individualSummary = result as TeacherAttendanceSummary;
          this.individualSessionSummary = null;
        } else {
          this.individualSessionSummary = result as TeacherAttendanceSessionSummary;
          this.individualSummary = null;
        }
        this.loadingIndividual = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.logger.error('Failed to load individual teacher attendance', err);
        this.toast.error('Error', typeof err?.error === 'string' ? err.error : 'Failed to load teacher attendance report.');
        this.loadingIndividual = false;
        this.cdr.markForCheck();
      }
    });
  }

  openSessionMonth(month: number, year: number): void {
    this.individualPeriod = 'month';
    this.individualMonth = month;
    this.individualYear = year;
    this.loadIndividualReport();
  }

  get individualReportSummary(): TeacherAttendanceSummary | TeacherAttendanceSessionSummary | null {
    return this.individualPeriod === 'month' ? this.individualSummary : this.individualSessionSummary;
  }

  get individualGroupedRecords(): { date: string; displayDate: string; records: TeacherAttendanceRecord[] }[] {
    return this.groupRecords(this.individualSummary?.records ?? []);
  }

  /** Sources session choices from the backend's real AcademicSession records — never a
   *  locally-guessed "YYYY-YYYY" range — so the label sent to getTeacherSessionSummary
   *  always matches a session the backend actually recognizes. Defaults to whichever
   *  session the backend marks current; falls back to the most recent one if none is
   *  marked current, and to an empty selection if the school has no sessions configured. */
  private loadSessionOptions(): void {
    this.loadingSessions = true;
    this.cdr.markForCheck();
    this.academicSessionService.getAllSessions().pipe(takeUntil(this.destroy$)).subscribe({
      next: (sessions) => {
        this.sessionOptions = sessions.map(s => s.label);
        const current = sessions.find(s => s.current);
        this.selectedSession = current ? current.label : (this.sessionOptions[0] ?? '');
        this.loadingSessions = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.logger.error('Failed to load academic sessions', err);
        this.toast.error('Error', 'Failed to load academic sessions.');
        this.sessionOptions = [];
        this.selectedSession = '';
        this.loadingSessions = false;
        this.cdr.markForCheck();
      }
    });
  }

  goToPreviousMonth(): void {
    if (this.summaryMonth === 1) {
      this.summaryMonth = 12;
      this.summaryYear--;
    } else {
      this.summaryMonth--;
    }
    this.loadMonthlySummary();
  }

  goToNextMonth(): void {
    const now = new Date();
    if (this.summaryYear === now.getFullYear() && this.summaryMonth === now.getMonth() + 1) return;
    if (this.summaryMonth === 12) {
      this.summaryMonth = 1;
      this.summaryYear++;
    } else {
      this.summaryMonth++;
    }
    this.loadMonthlySummary();
  }

  openMarkDialog(): void {
    this.correctionReason = '';
    this.correctionHistory = [];
    this.isEditMode = false;
    this.editingRecordId = null;
    this.formDirty = false;
    this.markForm = { teacherId: '', date: this.selectedDate, status: 'ON_TIME', checkInTime: '', checkOutTime: '' };
    this.showMarkDialog = true;
  }

  openEditDialog(record: TeacherAttendanceRecord): void {
    if (!this.canCorrect(record)) return;
    this.correctionReason = '';
    this.loadCorrectionHistory(record.teacherId, record.date);
    this.isEditMode = true;
    this.editingRecordId = record.id;
    this.formDirty = false;
    this.markForm = {
      teacherId: record.teacherId,
      date: record.date, // CRITICAL: set from record, not from selectedDate
      status: record.status,
      checkInTime: record.checkInTime ? this.extractTime(record.checkInTime) : '',
      checkOutTime: record.checkOutTime ? this.extractTime(record.checkOutTime) : '',
    };
    this.showMarkDialog = true;
  }

  async closeMarkDialog(): Promise<void> {
    if (this.formDirty) {
      const discard = await this.toast.confirm({
        title: 'Unsaved Changes',
        message: 'You have unsaved changes. Are you sure you want to close?',
        confirmText: 'Discard',
        cancelText: 'Keep Editing',
        danger: true,
      });
      if (!discard) return;
    }
    this.showMarkDialog = false;
    this.isEditMode = false;
    this.editingRecordId = null;
    this.formDirty = false;
  }

  onCheckInTimeChange(): void {
    if (!this.markForm.checkInTime || !this.schoolTiming?.startTime) return;
    const status = this.calculateStatus(this.markForm.checkInTime);
    if (status) {
      this.markForm.status = status;
    }
  }

  private calculateStatus(checkInTime: string): string | null {
    if (!this.schoolTiming?.startTime) return null;
    const threshold = this.schoolTiming.lateThresholdMinutes ?? 5;
    const [startH, startM] = this.schoolTiming.startTime.split(':').map(Number);
    const [inH, inM] = checkInTime.split(':').map(Number);
    const startMinutes = startH * 60 + startM + threshold;
    const inMinutes = inH * 60 + inM;
    return inMinutes > startMinutes ? 'LATE' : 'ON_TIME';
  }

  async submitAdminMark(): Promise<void> {
    if (this.isPrincipal && this.protectedIds.has(this.markForm.teacherId)) {
      this.toast.warning('Not allowed', this.ownTeacherIds.has(this.markForm.teacherId)
        ? 'You cannot correct your own attendance.'
        : 'The attendance of the Principal or another Coordinator cannot be corrected here.');
      return;
    }
    if (this.isPrincipal && !this.correctionReason.trim()) {
      this.toast.warning('Reason required', 'Give a reason for this correction.');
      return;
    }
    if (!this.markForm.teacherId || !this.markForm.date || !this.markForm.status) {
      this.toast.warning('Validation', 'Please fill all required fields.');
      return;
    }

    if (['ON_TIME', 'LATE'].includes(this.markForm.status) && !this.markForm.checkInTime) {
      this.toast.warning('Required', 'Check-in time is required when status is On Time or Late.');
      return;
    }

    const selectedDate = new Date(this.markForm.date);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    if (selectedDate < thirtyDaysAgo) {
      const proceed = await this.toast.confirm({
        title: 'Old Date Selected',
        message: 'You are marking attendance for a date more than 30 days ago. Continue?',
        confirmText: 'Yes, Continue',
        cancelText: 'Cancel',
      });
      if (!proceed) return;
    }

    this.isMarking = true;
    this.cdr.markForCheck();

    const req: any = {
      teacherId: this.markForm.teacherId,
      date: this.markForm.date,
      status: this.markForm.status,
    };
    if (this.markForm.checkInTime) req.checkInTime = this.markForm.checkInTime;
    if (this.markForm.checkOutTime) req.checkOutTime = this.markForm.checkOutTime;

    const save$ = this.isPrincipal
      ? this.checkinService.principalCorrect({ ...req, reason: this.correctionReason.trim() })
      : this.checkinService.adminMark(req);
    save$
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.toast.success('Saved', this.isEditMode ? 'Attendance updated successfully.' : 'Teacher attendance marked successfully.');
          this.isMarking = false;
          this.showMarkDialog = false;
          this.isEditMode = false;
          this.editingRecordId = null;
          this.formDirty = false;
          this.loadDailyRecords();
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.isMarking = false;
          const msg = typeof err?.error === 'string' ? err.error : 'Failed to mark attendance.';
          this.toast.error('Error', msg);
          this.cdr.markForCheck();
        }
      });
  }

  // ── Principal corrections ──

  /** The Principal may correct any teacher of the school except their own teacher record. */
  canCorrect(record: TeacherAttendanceRecord): boolean {
    return !this.isPrincipal || !this.protectedIds.has(record.teacherId);
  }

  isOwnRecord(record: TeacherAttendanceRecord): boolean {
    return this.isPrincipal && this.ownTeacherIds.has(record.teacherId);
  }

  /** Protected from correction by someone else's authority: the Principal or another Coordinator. */
  isProtectedRecord(record: TeacherAttendanceRecord): boolean {
    return this.isPrincipal && this.protectedIds.has(record.teacherId) && !this.ownTeacherIds.has(record.teacherId);
  }

  private loadOwnTeacherIds(): void {
    this.checkinService.getOwnTeacherIds()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (self) => {
          this.ownTeacherIds = new Set(self?.teacherIds ?? []);
          this.protectedIds = new Set(self?.protectedTeacherIds ?? self?.teacherIds ?? []);
          this.cdr.markForCheck();
        },
        error: (err) => this.logger.error('Failed to load own teacher record', err)
      });
  }

  private loadCorrectionHistory(teacherId: string, date: string): void {
    this.correctionHistory = [];
    if (!this.isPrincipal) return;
    this.historyLoading = true;
    this.checkinService.getCorrectionHistory(teacherId, date)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (history) => { this.correctionHistory = history; this.historyLoading = false; this.cdr.markForCheck(); },
        error: (err) => { this.logger.error('Failed to load correction history', err); this.historyLoading = false; this.cdr.markForCheck(); }
      });
  }

  // ── Helpers ──

  get todayStr(): string {
    return new Date().toISOString().split('T')[0];
  }

  /** Get unique teachers not already having a record for the selected date */
  get availableTeachers(): Teacher[] {
    if (this.isEditMode) return this.allTeachers;
    const recordedIds = new Set(this.records.map(r => r.teacherId));
    return this.allTeachers.filter(t => !recordedIds.has(t.teacherId));
  }

  private extractTime(isoTime: string): string {
    const d = new Date(isoTime);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  get presentCount(): number { return this.records.filter(r => r.status === 'ON_TIME' || r.status === 'LATE').length; }
  get lateCount(): number { return this.records.filter(r => r.status === 'LATE').length; }
  get absentCount(): number { return this.records.filter(r => r.status === 'ABSENT').length; }
  get halfDayCount(): number { return this.records.filter(r => r.status === 'HALF_DAY').length; }
  get onLeaveCount(): number { return this.records.filter(r => r.status === 'ON_LEAVE').length; }

  getStatusClass(status: string): string {
    switch (status) {
      case 'ON_TIME': return 'sa-badge-ontime';
      case 'LATE': return 'sa-badge-late';
      case 'ABSENT': return 'sa-badge-absent';
      case 'ON_LEAVE': return 'sa-badge-leave';
      case 'HALF_DAY': return 'sa-badge-halfday';
      default: return '';
    }
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'ON_TIME': return 'On Time';
      case 'LATE': return 'Late';
      case 'ABSENT': return 'Absent';
      case 'ON_LEAVE': return 'On Leave';
      case 'HALF_DAY': return 'Half Day';
      default: return status;
    }
  }

  formatTime(isoTime: string | null): string {
    if (!isoTime) return '—';
    const d = new Date(isoTime);
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  }

  getPhotoUrl(record: TeacherAttendanceRecord): string | null {
    const teacher = this.allTeachers.find(t => t.teacherId === record.teacherId);
    return teacher?.photoUrl ? this.tenantService.getLogoUrl(teacher.photoUrl!) : null;
  }

  getTeacherInitials(name: string): string {
    return name.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase();
  }

  formatDistance(meters: number | null | undefined): string {
    if (meters == null) return '—';
    if (meters >= 1000) return (meters / 1000).toFixed(1) + ' km';
    return meters.toFixed(0) + ' m';
  }

  get groupedRecords(): { date: string; displayDate: string; records: TeacherAttendanceRecord[] }[] {
    return this.groupRecords(this.monthlySummary?.records ?? []);
  }

  private groupRecords(source: TeacherAttendanceRecord[]): { date: string; displayDate: string; records: TeacherAttendanceRecord[] }[] {
    if (!source.length) return [];
    const map = new Map<string, TeacherAttendanceRecord[]>();
    for (const r of source) {
      const list = map.get(r.date) ?? [];
      list.push(r);
      map.set(r.date, list);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, records]) => ({
        date,
        displayDate: new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }),
        records
      }));
  }

  trackByDate(_: number, group: { date: string }): string { return group.date; }
  trackByRecordId(_: number, record: TeacherAttendanceRecord): number { return record.id; }

  getBorderClass(status: string): string {
    switch (status) {
      case 'LATE': return 'sa-card-late';
      case 'ABSENT': return 'sa-card-absent';
      case 'ON_LEAVE': return 'sa-card-leave';
      case 'HALF_DAY': return 'sa-card-halfday';
      default: return '';
    }
  }
}
