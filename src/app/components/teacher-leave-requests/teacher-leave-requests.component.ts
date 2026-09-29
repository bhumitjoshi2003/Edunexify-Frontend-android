import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, OnDestroy } from '@angular/core';
import { LoggerService } from '../../services/logger.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, debounceTime, distinctUntilChanged } from 'rxjs';
import { ToastService } from '../../services/toast.service';
import { TeacherLeaveService } from '../../services/teacher-leave.service';
import { TeacherLeave } from '../../interfaces/teacher-leave';
import { PaginatedResponse } from '../../services/payment-history.service';

@Component({
  selector: 'app-teacher-leave-requests',
  templateUrl: './teacher-leave-requests.component.html',
  styleUrls: ['./teacher-leave-requests.component.css'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
})
export class TeacherLeaveRequestsComponent implements OnInit, OnDestroy {
  leaves: TeacherLeave[] = [];
  isLoading: boolean = true;
  updatingIds: Set<number> = new Set();

  statusFilter: string = 'PENDING';
  teacherIdFilter: string = '';
  dateFilter: string = '';

  currentPage: number = 0;
  pageSize: number = 10;
  totalElements: number = 0;
  totalPages: number = 0;

  private teacherIdInputSubject = new Subject<string>();
  private ngUnsubscribe = new Subject<void>();

  constructor(
    private teacherLeaveService: TeacherLeaveService,
    private logger: LoggerService,
    private cdr: ChangeDetectorRef,
    private toast: ToastService
  ) { }

  ngOnInit(): void {
    this.fetchLeaves();

    this.teacherIdInputSubject.pipe(
      debounceTime(800),
      distinctUntilChanged(),
      takeUntil(this.ngUnsubscribe)
    ).subscribe(() => {
      this.currentPage = 0;
      this.fetchLeaves();
    });
  }

  ngOnDestroy(): void {
    this.ngUnsubscribe.next();
    this.ngUnsubscribe.complete();
    this.teacherIdInputSubject.complete();
  }

  fetchLeaves(): void {
    this.isLoading = true;
    this.cdr.markForCheck();

    const status = this.statusFilter === 'all' ? undefined : this.statusFilter;
    const teacherId = this.teacherIdFilter ? this.teacherIdFilter : undefined;

    const date = this.dateFilter || undefined;

    this.teacherLeaveService.getLeaves(this.currentPage, this.pageSize, status, teacherId, date)
      .pipe(takeUntil(this.ngUnsubscribe))
      .subscribe({
        next: (response: PaginatedResponse<TeacherLeave>) => {
          this.leaves = response.content;
          this.totalElements = response.totalElements;
          this.totalPages = response.totalPages;
          this.currentPage = response.number;
          this.isLoading = false;
          this.cdr.markForCheck();
        },
        error: (error: unknown) => {
          this.logger.error('Error loading teacher leave requests:', error);
          this.toast.error('Error!', 'Failed to load teacher leave requests.');
          this.leaves = [];
          this.totalElements = 0;
          this.totalPages = 0;
          this.isLoading = false;
          this.cdr.markForCheck();
        }
      });
  }

  onStatusSelect(status: string): void {
    this.statusFilter = status;
    this.currentPage = 0;
    this.fetchLeaves();
  }

  onTeacherIdInput(): void {
    this.teacherIdInputSubject.next(this.teacherIdFilter);
  }

  onDateChange(): void {
    this.currentPage = 0;
    this.fetchLeaves();
  }

  clearFilter(): void {
    this.statusFilter = 'PENDING';
    this.teacherIdFilter = '';
    this.dateFilter = '';
    this.currentPage = 0;
    this.fetchLeaves();
  }

  updateStatus(leave: TeacherLeave, status: 'APPROVED' | 'REJECTED'): void {
    const isApprove = status === 'APPROVED';
    this.toast.confirmWithReason({
      title: isApprove ? 'Approve Leave?' : 'Reject Leave?',
      html: `<strong>${this.escape(leave.teacherName)}</strong> &mdash; ${leave.startDate} to ${leave.endDate}`,
      icon: 'question',
      danger: !isApprove,
      confirmText: isApprove ? 'Yes, approve' : 'Yes, reject',
      cancelText: 'Cancel',
      reasonInput: isApprove
        ? { label: 'Note', placeholder: 'Optional note for the teacher' }
        : { label: 'Reason for rejecting', placeholder: 'Shown to the teacher' },
    }).then((reason) => {
      if (reason === null) return;
      this.updatingIds.add(leave.id);
      this.cdr.markForCheck();
      this.teacherLeaveService.updateStatus(leave.id, status, reason)
        .pipe(takeUntil(this.ngUnsubscribe))
        .subscribe({
          next: (updated) => {
            Object.assign(leave, updated);
            this.updatingIds.delete(leave.id);
            this.cdr.markForCheck();
            if (isApprove) {
              this.toast.success('Approved!', 'Leave has been approved.');
            } else {
              this.toast.info('Rejected!', 'Leave has been rejected.');
            }
          },
          error: (error) => {
            this.updatingIds.delete(leave.id);
            this.logger.error('Error updating teacher leave status:', error);
            this.toast.error('Error!', error?.error?.message || 'Failed to update leave status.');
            this.cdr.markForCheck();
          }
        });
    });
  }

  /** Changing a decision is an explicit reversal (APPROVED ↔ REJECTED) and needs a reason. */
  editStatus(leave: TeacherLeave): void {
    const newStatus = leave.status === 'APPROVED' ? 'REJECTED' : 'APPROVED';
    this.toast.confirmWithReason({
      title: 'Change decision?',
      html: `Change <strong>${this.escape(leave.teacherName)}</strong> (${leave.startDate} to ${leave.endDate}) to <strong>${newStatus}</strong>?`,
      icon: 'question',
      danger: newStatus === 'REJECTED',
      confirmText: `Yes, mark ${newStatus.toLowerCase()}`,
      cancelText: 'Cancel',
      reasonInput: { label: 'Reason for the change', required: true },
    }).then((reason) => {
      if (reason === null) return;
      this.updatingIds.add(leave.id);
      this.cdr.markForCheck();
      this.teacherLeaveService.reverseDecision(leave.id, reason).pipe(takeUntil(this.ngUnsubscribe)).subscribe({
        next: (updated) => {
          Object.assign(leave, updated);
          this.updatingIds.delete(leave.id);
          this.cdr.markForCheck();
          this.toast.success('Updated!', `Decision changed to ${updated.status}.`);
        },
        error: (error) => {
          this.updatingIds.delete(leave.id);
          this.logger.error('Error changing teacher leave decision:', error);
          this.toast.error('Error!', error?.error?.message || 'Failed to change the decision.');
          this.cdr.markForCheck();
        }
      });
    });
  }

  /** Cancels (kept as history). An approved leave needs a reason — it changes attendance and cover. */
  cancelLeave(leave: TeacherLeave): void {
    const approved = leave.status === 'APPROVED';
    this.toast.confirmWithReason({
      title: 'Cancel this leave request?',
      message: approved
        ? 'This leave is approved. Cancelling it removes it from staff attendance and substitution. It stays in the history as cancelled.'
        : 'The request stays in the history as cancelled.',
      icon: 'warning',
      danger: true,
      confirmText: 'Yes, cancel it',
      cancelText: 'Keep it',
      reasonInput: { label: 'Reason', required: approved },
    }).then((reason) => {
      if (reason === null) return;
      this.teacherLeaveService.cancelLeave(leave.id, reason).pipe(takeUntil(this.ngUnsubscribe)).subscribe({
        next: () => {
          this.toast.success('Cancelled', 'The leave request was cancelled.');
          this.fetchLeaves();
        },
        error: (error) => {
          this.logger.error('Error cancelling teacher leave:', error);
          this.toast.error('Error!', error?.error?.message || 'Failed to cancel the leave request.');
        }
      });
    });
  }

  private escape(text: string): string {
    return (text ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[ch]);
  }

  goToPage(page: number): void {
    if (page >= 0 && page < this.totalPages) {
      this.currentPage = page;
      this.fetchLeaves();
    }
  }

  nextPage(): void { this.goToPage(this.currentPage + 1); }
  prevPage(): void { this.goToPage(this.currentPage - 1); }

  trackByLeaveId(index: number, leave: TeacherLeave): number { return leave.id; }
}
