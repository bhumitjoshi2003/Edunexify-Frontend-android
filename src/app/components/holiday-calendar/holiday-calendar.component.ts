import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { SchoolHolidayService } from '../../services/school-holiday.service';
import { SchoolHoliday } from '../../interfaces/school-holiday';
import { AcademicSessionService } from '../../services/academic-session.service';
import { AuthStateService } from '../../auth/auth-state.service';
import { LoggerService } from '../../services/logger.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-holiday-calendar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './holiday-calendar.component.html',
  styleUrl: './holiday-calendar.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HolidayCalendarComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  holidays: SchoolHoliday[] = [];
  loading = false;
  saving = false;

  sessions: string[] = [];
  selectedSession = '';
  role = '';

  // Add/edit form
  showForm = false;
  editingId: number | null = null;
  form: SchoolHoliday = this.emptyForm();

  private readonly monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  readonly holidayTypes = [
    { value: 'NATIONAL', label: 'National Holiday' },
    { value: 'REGIONAL', label: 'Regional Holiday' },
    { value: 'SCHOOL', label: 'School Holiday' },
    { value: 'EXAM_BREAK', label: 'Exam Break' },
    { value: 'VACATION', label: 'Vacation' },
  ];

  constructor(
    private holidayService: SchoolHolidayService,
    private academicSessionService: AcademicSessionService,
    private authStateService: AuthStateService,
    private logger: LoggerService,
    private cdr: ChangeDetectorRef,
    private toast: ToastService
  ) {}

  ngOnInit(): void {
    this.role = this.authStateService.getUser()?.role ?? '';
    this.academicSessionService.getAllSessions().pipe(takeUntil(this.destroy$)).subscribe({
      next: sessions => {
        this.sessions = sessions.map(s => s.label);
        const current = sessions.find(s => s.current);
        this.selectedSession = current ? current.label : (this.sessions[0] ?? '');
        this.cdr.markForCheck();
        this.loadHolidays();
      },
      error: e => this.logger.error('Failed to load sessions', e)
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get isAdmin(): boolean {
    return this.role === 'ADMIN' || this.role === 'PRINCIPAL';
  }

  loadHolidays(): void {
    this.loading = true;
    this.holidayService.getHolidays(this.selectedSession).pipe(takeUntil(this.destroy$)).subscribe({
      next: holidays => {
        this.holidays = holidays;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: err => {
        this.logger.error('Failed to load holidays', err);
        this.loading = false;
        this.cdr.markForCheck();
      }
    });
  }

  onSessionChange(): void {
    this.loadHolidays();
  }

  openAddForm(): void {
    this.editingId = null;
    this.form = this.emptyForm();
    this.form.academicYear = this.selectedSession;
    this.showForm = true;
  }

  openEditForm(holiday: SchoolHoliday): void {
    this.editingId = holiday.id ?? null;
    this.form = { ...holiday };
    this.showForm = true;
  }

  cancelForm(): void {
    this.showForm = false;
    this.editingId = null;
  }

  saveHoliday(): void {
    if (!this.form.name || !this.form.startDate || !this.form.holidayType) {
      this.toast.warning('Missing Fields', 'Please fill in all required fields.');
      return;
    }

    // Default endDate to startDate if not set
    if (!this.form.endDate) {
      this.form.endDate = this.form.startDate;
    }

    if (this.form.endDate < this.form.startDate) {
      this.toast.warning('Invalid Dates', 'End date cannot be before start date.');
      return;
    }

    this.saving = true;
    const obs = this.editingId
      ? this.holidayService.updateHoliday(this.editingId, this.form)
      : this.holidayService.createHoliday(this.form);

    obs.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.toast.success('Saved', this.editingId ? 'Holiday updated.' : 'Holiday added.');
        this.showForm = false;
        this.editingId = null;
        this.saving = false;
        this.loadHolidays();
      },
      error: err => {
        this.logger.error('Failed to save holiday', err);
        this.toast.error('Error', err.error || 'Failed to save holiday.');
        this.saving = false;
        this.cdr.markForCheck();
      }
    });
  }

  deleteHoliday(holiday: SchoolHoliday): void {
    this.toast.confirm({
      title: 'Delete Holiday',
      message: `Are you sure you want to delete "${holiday.name}"?`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      danger: true,
    }).then(confirmed => {
      if (confirmed && holiday.id) {
        this.holidayService.deleteHoliday(holiday.id).pipe(takeUntil(this.destroy$)).subscribe({
          next: () => {
            this.toast.success('Deleted', 'Holiday removed.');
            this.loadHolidays();
          },
          error: err => {
            this.logger.error('Failed to delete holiday', err);
            this.toast.error('Error', 'Failed to delete holiday.');
          }
        });
      }
    });
  }

  get groupedHolidays(): { monthName: string; holidays: SchoolHoliday[] }[] {
    const groups = new Map<string, SchoolHoliday[]>();
    for (const h of this.holidays) {
      const d = new Date(h.startDate);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(h);
    }
    return Array.from(groups.entries()).map(([key, holidays]) => {
      const d = new Date(holidays[0].startDate);
      return { monthName: `${this.monthNames[d.getMonth()]} ${d.getFullYear()}`, holidays };
    });
  }

  isMultiDay(holiday: SchoolHoliday): boolean {
    return holiday.startDate !== holiday.endDate;
  }

  getDayCount(holiday: SchoolHoliday): number {
    const start = new Date(holiday.startDate);
    const end = new Date(holiday.endDate);
    return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  }

  getTypeLabel(type: string): string {
    return this.holidayTypes.find(t => t.value === type)?.label ?? type;
  }

  private emptyForm(): SchoolHoliday {
    return { startDate: '', endDate: '', name: '', holidayType: 'SCHOOL', affectsAll: true };
  }
}
