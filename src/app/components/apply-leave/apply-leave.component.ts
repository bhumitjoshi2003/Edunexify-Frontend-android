import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, OnDestroy } from '@angular/core';
import { LoggerService } from '../../services/logger.service';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { CommonModule, formatDate } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { LeaveService } from '../../services/leave.service';
import { StudentService } from '../../services/student.service';
import { ToastService } from '../../services/toast.service';
import { LeaveRequest } from '../../interfaces/leave-request';
import { AuthStateService } from '../../auth/auth-state.service';
import { PaginatedResponse } from '../../services/payment-history.service';
import { Subject, takeUntil } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { ParentPortalService } from '../../services/parent-portal.service';
import { ParentChildContextComponent } from '../parent-child-context/parent-child-context.component';
import { ChildAccess } from '../../interfaces/parent-portal';


@Component({
  selector: 'app-apply-leave',
  templateUrl: './apply-leave.component.html',
  styleUrls: ['./apply-leave.component.css'],
  imports: [ReactiveFormsModule, CommonModule, ParentChildContextComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ApplyLeaveComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  leaveForm: FormGroup;
  errorMessage: string = '';
  studentId: string = '';
  studentName: string = '';
  className = '';
  leaves: { id: number; originalLeaveDate: string; leaveDate: string; reason: string; status: string;
             decisionReason?: string | null; cancellationReason?: string | null }[] = [];
  isLoading: boolean = true;

  // Pagination
  currentPage: number = 0;
  pageSize: number = 5;
  totalPages: number = 0;
  totalElements: number = 0;

  today: string = '';
  todayDate = new Date();
  reasonOptions: string[] = [
    'Medical Leave',
    'Family Event',
    'Personal Work',
    'Travel',
    'Others',
  ];
  showOtherReasonInput: boolean = false;

  constructor(
    private fb: FormBuilder,
    private leaveService: LeaveService,
    private studentService: StudentService,
    private authStateService: AuthStateService,
    private logger: LoggerService,
    private cdr: ChangeDetectorRef,
    private toast: ToastService,
    private route: ActivatedRoute,
    private router: Router,
    private parentPortalService: ParentPortalService
  ) {
    this.leaveForm = this.fb.group({
      leaveDate: ['', Validators.required],
      reason: ['', Validators.required],
      otherReason: ['', Validators.maxLength(200)],
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  ngOnInit(): void {
    const today = new Date();
    this.today = formatDate(today, 'yyyy-MM-dd', 'en');
    this.getStudentId();
  }

  get reasonControl() {
    return this.leaveForm.get('reason');
  }

  get otherReasonControl() {
    return this.leaveForm.get('otherReason');
  }

  onReasonChange(): void {
    this.showOtherReasonInput = this.reasonControl?.value === 'Others';
    if (this.showOtherReasonInput) {
      this.otherReasonControl?.setValidators([Validators.required, Validators.maxLength(200)]);
    } else {
      this.otherReasonControl?.clearValidators();
    }
    this.otherReasonControl?.updateValueAndValidity();
  }

  getStudentId(): void {
    const user = this.authStateService.getUser();
    if (!user) {
      this.isLoading = false;
      this.cdr.markForCheck();
      return;
    }
    if (user.role === 'PARENT') {
      const requestedStudentId = this.route.snapshot.queryParamMap.get('studentId');
      if (!requestedStudentId) {
        this.isLoading = false;
        this.toast.error('No child selected', 'Open leave from the parent portal.');
        this.cdr.markForCheck();
        return;
      }
      this.parentPortalService.getMyProfile().pipe(takeUntil(this.destroy$)).subscribe({
        next: profile => {
          const child = profile.children.find(item => item.studentId === requestedStudentId && item.canManageLeave);
          if (!child) {
            this.isLoading = false;
            this.toast.error('Leave access unavailable', 'Please contact the school administrator.');
            this.cdr.markForCheck();
            return;
          }
          this.studentId = child.studentId;
          this.studentName = child.studentName;
          this.className = child.className;
          this.loadStudentLeaves();
        },
        error: () => {
          this.isLoading = false;
          this.toast.error('Could not load child details');
          this.cdr.markForCheck();
        }
      });
      return;
    }
    this.studentId = user.userId;
    this.studentService.getStudent(this.studentId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (student) => {
        this.studentName = student.name;
        this.className = student.className;
        this.cdr.markForCheck();
        this.loadStudentLeaves();
      },
      error: (error) => {
        this.logger.error('Error fetching student details:', error);
        this.isLoading = false;
        this.cdr.markForCheck();
      }
    });
  }

  loadStudentLeaves(): void {
    this.isLoading = true;
    this.cdr.markForCheck();
    this.leaveService.getLeavesByStudentId(this.studentId, this.currentPage, this.pageSize)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: PaginatedResponse<any>) => {
          this.leaves = response.content.map((leave: any) => ({
            id: leave.id,
            originalLeaveDate: leave.leaveDate,
            leaveDate: leave.leaveDate,
            reason: leave.reason,
            status: leave.status ?? 'PENDING',
            decisionReason: leave.decisionReason ?? null,
            cancellationReason: leave.cancellationReason ?? null,
          }));
          this.totalPages = response.totalPages;
          this.totalElements = response.totalElements;
          this.isLoading = false;
          this.cdr.markForCheck();
        },
        error: (error) => {
          this.logger.error('Error fetching student leaves:', error);
          this.isLoading = false;
          this.cdr.markForCheck();
        }
      });
  }

  onChildTabSelected(child: ChildAccess): void {
    if (!child.canManageLeave) {
      this.toast.error('Leave access unavailable', 'Please contact the school administrator.');
      return;
    }
    this.studentId = child.studentId;
    this.studentName = child.studentName;
    this.className = child.className;
    this.currentPage = 0;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { studentId: child.studentId },
      replaceUrl: true,
    });
    this.loadStudentLeaves();
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages - 1) {
      this.currentPage++;
      this.loadStudentLeaves();
    }
  }

  previousPage(): void {
    if (this.currentPage > 0) {
      this.currentPage--;
      this.loadStudentLeaves();
    }
  }

  deleteLeave(leaveDate: string): void {
    if (leaveDate) {
      this.toast.confirm({
        title: 'Cancel this leave request?',
        message: 'The request will be withdrawn. It stays in your history as cancelled.',
        confirmText: 'Yes, cancel it',
        cancelText: 'Keep it',
        danger: true,
      }).then((confirmed) => {
        if (confirmed) {
          const formattedLeaveDate = new Date(leaveDate).toISOString().split('T')[0];

          this.leaveService.deleteLeave(this.studentId, formattedLeaveDate).pipe(takeUntil(this.destroy$)).subscribe({
            next: () => {
              this.leaveForm.reset();
              this.reasonControl?.setValue('');
              this.showOtherReasonInput = false;
              this.toast.success('Cancelled', 'Your leave request has been cancelled.');
              this.currentPage = 0;
              this.loadStudentLeaves();
            },
            error: (error) => {
              this.logger.error('Error cancelling leave:', error);
              this.toast.error('Could not cancel', this.serverMessage(error) || 'Please try again.');
            },
          });
        }
      });
    }
  }

  trackByLeaveDate(index: number, leave: { id: number; originalLeaveDate: string }): string { return String(leave.id ?? leave.originalLeaveDate); }

  /** The server's own error message (e.g. a date rule), whether the body is JSON or text. */
  serverMessage(error: any): string | null {
    const body = error?.error;
    if (!body) return null;
    if (typeof body === 'string') {
      try { return JSON.parse(body)?.message ?? body; } catch { return body; }
    }
    return body.message ?? null;
  }
  trackByReason(index: number, reason: string): string { return reason; }

  check(): void {
    if (this.leaveForm.get('leaveDate')?.hasError('required')) {
      this.errorMessage = "Please choose a date.";
    } else if (this.reasonControl?.hasError('required')) {
      this.errorMessage = "Please select a reason.";
    } else if (this.showOtherReasonInput && this.otherReasonControl?.hasError('required')) {
      this.errorMessage = "Please provide a reason.";
    } else if (this.otherReasonControl?.hasError('maxlength')) {
      this.errorMessage = "Reason cannot be more than 200 characters.";
    } else {
      this.errorMessage = "";
    }
  }

  applyLeave(): void {
    if (this.leaveForm.invalid) {
      this.check();
      return;
    }

    if (this.leaveForm.valid) {
      const now = new Date();
      const leaveDate = new Date(this.leaveForm.get('leaveDate')?.value);
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const sixAMToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 6, 0, 0);

      this.errorMessage = '';

      if (leaveDate < today) {
        this.errorMessage = 'Leave cannot be applied for past dates!';
        return;
      }

      if (leaveDate.toDateString() === today.toDateString() && now >= sixAMToday) {
        this.errorMessage = 'Leave for today must be applied before 6:00 AM!';
        return;
      }

      if (leaveDate.getDay() === 0) {
        this.errorMessage = 'Sundays are non-working days. Please select a weekday.';
        return;
      }

      // Soft warning for leave applications more than 30 days in the future
      const daysAhead = Math.ceil((leaveDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (daysAhead > 30) {
        this.toast.warning('Long Advance Notice', `You are applying for leave ${daysAhead} days in advance. For extended leave, contact your school administration directly.`);
        // Don't return — just warn
      }

      const formattedLeaveDate = leaveDate.toISOString().split('T')[0];
      const selectedReason = this.reasonControl?.value;
      let finalReason = selectedReason;

      if (selectedReason === 'Others') {
        finalReason = this.otherReasonControl?.value;
      }

      const leaveExists = this.leaves.some(
        (leave) => leave.originalLeaveDate === formattedLeaveDate && (leave.status === 'PENDING' || leave.status === 'APPROVED')
      );

      if (leaveExists) {
        this.errorMessage = 'Leave already applied for this date!';
        return;
      }

      // Only the day and the reason — the server decides everything else.
      const leaveRequest: LeaveRequest = {
        leaveDate: formattedLeaveDate,
        reason: finalReason,
      };
      const parentStudentId = this.authStateService.getUserRole() === 'PARENT' ? this.studentId : undefined;
      this.leaveService.applyLeave(leaveRequest, parentStudentId).pipe(takeUntil(this.destroy$)).subscribe({
        next: (response) => {
          this.leaveForm.reset();
          this.reasonControl?.setValue('');
          this.leaveForm.get('leaveDate')?.setValue('');
          this.showOtherReasonInput = false;
          this.toast.success('Leave Applied!', response);
          this.currentPage = 0;
          this.loadStudentLeaves();
        },
        error: (error) => {
          this.logger.error('Error applying leave:', error);
          this.errorMessage = this.serverMessage(error) || (error.status === 404
            ? 'Failed to retrieve student information. Please try again.'
            : 'Failed to apply leave. Please try again.');
          this.toast.error('Error!', this.errorMessage);
        }
      });
    }
  }
}
