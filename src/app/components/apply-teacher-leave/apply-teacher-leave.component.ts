import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, OnDestroy } from '@angular/core';
import { LoggerService } from '../../services/logger.service';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule, formatDate } from '@angular/common';
import { TeacherLeaveService } from '../../services/teacher-leave.service';
import { SchoolHolidayService } from '../../services/school-holiday.service';
import { SchoolHoliday } from '../../interfaces/school-holiday';
import { ToastService } from '../../services/toast.service';
import { TeacherLeave } from '../../interfaces/teacher-leave';
import { PaginatedResponse } from '../../services/payment-history.service';
import { Subject, takeUntil, forkJoin } from 'rxjs';

@Component({
  selector: 'app-apply-teacher-leave',
  templateUrl: './apply-teacher-leave.component.html',
  styleUrls: ['./apply-teacher-leave.component.css'],
  imports: [ReactiveFormsModule, CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ApplyTeacherLeaveComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  leaveForm: FormGroup;
  errorMessage: string = '';
  leaves: TeacherLeave[] = [];
  isLoading: boolean = true;
  cancellingIds: Set<number> = new Set();
  isSubmitting = false;
  calendarReady = false;
  private workingDays = new Set<string>();
  private holidays: SchoolHoliday[] = [];

  currentPage: number = 0;
  pageSize: number = 5;
  totalPages: number = 0;
  totalElements: number = 0;

  today: string = '';
  todayDate = new Date();

  constructor(
    private fb: FormBuilder,
    private teacherLeaveService: TeacherLeaveService,
    private holidayService: SchoolHolidayService,
    private logger: LoggerService,
    private cdr: ChangeDetectorRef,
    private toast: ToastService
  ) {
    this.leaveForm = this.fb.group({
      startDate: ['', Validators.required],
      endDate: ['', Validators.required],
      reason: ['', [Validators.required, Validators.maxLength(200)]],
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  ngOnInit(): void {
    this.today = formatDate(this.todayDate, 'yyyy-MM-dd', 'en');
    forkJoin({
      config: this.teacherLeaveService.getCalendarConfig(),
      holidays: this.holidayService.getHolidays()
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: ({ config, holidays }) => {
        this.workingDays = new Set(config.workingDays.split(',').map(day => day.trim().toUpperCase()).filter(Boolean));
        if (this.workingDays.size === 0) {
          this.errorMessage = 'School working days are not configured. Please contact the administrator.';
          this.cdr.markForCheck();
          return;
        }
        this.holidays = holidays;
        this.calendarReady = true;
        this.cdr.markForCheck();
      },
      error: error => {
        this.logger.error('Error loading school calendar:', error);
        this.errorMessage = 'Unable to load the school calendar. Leave applications are disabled until it is available.';
        this.cdr.markForCheck();
      }
    });
    this.loadMyLeaves();
  }

  loadMyLeaves(): void {
    this.isLoading = true;
    this.cdr.markForCheck();
    this.teacherLeaveService.getMyLeaves(this.currentPage, this.pageSize)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: PaginatedResponse<TeacherLeave>) => {
          this.leaves = response.content;
          this.totalPages = response.totalPages;
          this.totalElements = response.totalElements;
          this.isLoading = false;
          this.cdr.markForCheck();
        },
        error: (error) => {
          this.logger.error('Error fetching teacher leaves:', error);
          this.isLoading = false;
          this.cdr.markForCheck();
        }
      });
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages - 1) {
      this.currentPage++;
      this.loadMyLeaves();
    }
  }

  previousPage(): void {
    if (this.currentPage > 0) {
      this.currentPage--;
      this.loadMyLeaves();
    }
  }

  check(): void {
    if (this.leaveForm.get('startDate')?.hasError('required')) {
      this.errorMessage = 'Please choose a start date.';
    } else if (this.leaveForm.get('endDate')?.hasError('required')) {
      this.errorMessage = 'Please choose an end date.';
    } else if (this.leaveForm.get('reason')?.hasError('required')) {
      this.errorMessage = 'Please provide a reason.';
    } else if (this.leaveForm.get('reason')?.hasError('maxlength')) {
      this.errorMessage = 'Reason cannot be more than 200 characters.';
    } else {
      this.errorMessage = this.getCalendarValidationError(
        this.leaveForm.get('startDate')?.value,
        this.leaveForm.get('endDate')?.value
      );
    }
  }

  applyLeave(): void {
    if (this.leaveForm.invalid) {
      this.check();
      return;
    }

    const startDate = this.leaveForm.get('startDate')?.value;
    const endDate = this.leaveForm.get('endDate')?.value;
    const reason = this.leaveForm.get('reason')?.value;

    const calendarError = this.getCalendarValidationError(startDate, endDate);
    if (calendarError) {
      this.errorMessage = calendarError;
      return;
    }

    this.errorMessage = '';
    this.isSubmitting = true;

    this.teacherLeaveService.applyLeave({ startDate, endDate, reason }).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.isSubmitting = false;
        this.leaveForm.reset();
        this.toast.success('Leave Applied!', 'Your leave application has been submitted.');
        this.currentPage = 0;
        this.loadMyLeaves();
      },
      error: (error) => {
        this.isSubmitting = false;
        this.logger.error('Error applying leave:', error);
        this.errorMessage = error?.error?.message || 'Failed to apply leave. Please try again.';
        this.toast.error('Error!', this.errorMessage);
      }
    });
  }

  private getCalendarValidationError(startDate: string, endDate: string): string {
    if (!startDate || !endDate) return '';
    if (endDate < startDate) return 'End date cannot be before start date.';
    if (startDate < this.today) return 'Leave cannot be applied for a past date.';

    let workingDayCount = 0;
    const cursor = new Date(`${startDate}T00:00:00`);
    const last = new Date(`${endDate}T00:00:00`);
    while (cursor <= last) {
      const date = formatDate(cursor, 'yyyy-MM-dd', 'en');
      const weekday = formatDate(cursor, 'EEEE', 'en').toUpperCase();
      const isHoliday = this.holidays.some(holiday => date >= holiday.startDate && date <= holiday.endDate);
      if (this.workingDays.has(weekday) && !isHoliday) workingDayCount++;
      cursor.setDate(cursor.getDate() + 1);
    }
    return workingDayCount === 0
      ? 'The selected dates contain no working days. Leave cannot be applied on closed days or school holidays.'
      : '';
  }

  cancelLeave(leave: TeacherLeave): void {
    this.toast.confirm({
      title: 'Cancel Leave Request?',
      message: 'Your pending request will be withdrawn. It stays in your history as cancelled.',
      icon: 'warning',
      danger: true,
      confirmText: 'Yes, cancel it!',
      cancelText: 'No',
    }).then((confirmed) => {
      if (!confirmed) return;
      this.cancellingIds.add(leave.id);
      this.cdr.markForCheck();
      this.teacherLeaveService.cancelLeave(leave.id).pipe(takeUntil(this.destroy$)).subscribe({
        next: () => {
          this.cancellingIds.delete(leave.id);
          this.toast.success('Cancelled!', 'Your leave request has been cancelled.');
          this.loadMyLeaves();
        },
        error: (error) => {
          this.cancellingIds.delete(leave.id);
          this.logger.error('Error cancelling leave:', error);
          this.toast.error('Error!', error?.error?.message || 'Failed to cancel leave request.');
          this.cdr.markForCheck();
        }
      });
    });
  }

  trackByLeaveId(index: number, leave: TeacherLeave): number { return leave.id; }
}
