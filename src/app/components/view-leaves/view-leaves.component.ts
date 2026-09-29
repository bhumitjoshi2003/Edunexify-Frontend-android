import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, OnDestroy } from '@angular/core';
import { LoggerService } from '../../services/logger.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, debounceTime, distinctUntilChanged } from 'rxjs';
import { TeacherService } from '../../services/teacher.service';
import { Teacher } from '../../interfaces/teacher';
import { AuthStateService } from '../../auth/auth-state.service';
import { SchoolService } from '../../services/school.service';
import { ToastService } from '../../services/toast.service';
import { from, concatMap } from 'rxjs';
import { ActivatedRoute } from '@angular/router';
import { LeaveApplication, LeaveService, PaginatedResponse } from '../../services/leave.service';
import { getStoredSelectedClass, setStoredSelectedClass, clearStoredSelectedClass } from '../../utils/class-selection-storage.util';

@Component({
  selector: 'app-view-leaves',
  templateUrl: './view-leaves.component.html',
  styleUrls: ['./view-leaves.component.css'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule
  ],
})
export class ViewLeavesComponent implements OnInit, OnDestroy {
  loggedInUserRole: string = '';
  loggedInUserId: string = '';
  loggedInUserClass: string = '';
  filteredLeaves: LeaveApplication[] = [];
  isLoading: boolean = true;
  updatingLeaveIds: Set<number> = new Set();

  classList: string[] = [];
  selectedClass: string = 'all';
  selectedDate: Date | null = null;
  studentIdFilter: string = '';
  statusFilter: string = 'PENDING';

  currentPage: number = 0;
  pageSize: number = 10;
  totalElements: number = 0;
  totalPages: number = 0;
  pageSizes: number[] = [5, 10, 20, 50];

  private studentIdInputSubject = new Subject<string>();
  private ngUnsubscribe = new Subject<void>();
  private schoolSlug: string | null = null;

  constructor(
    private route: ActivatedRoute,
    private leaveService: LeaveService,
    private teacherService: TeacherService,
    private authStateService: AuthStateService,
    private logger: LoggerService,
    private cdr: ChangeDetectorRef,
    private toast: ToastService,
    private schoolService: SchoolService
  ) { }

  ngOnInit(): void {
    this.route.params.pipe(takeUntil(this.ngUnsubscribe)).subscribe(params => {
      const studentIdFromParams = params['studentId'];
      if (studentIdFromParams) {
        this.studentIdFilter = studentIdFromParams;
      }
    });
    this.loadInitialData();

    this.studentIdInputSubject.pipe(
      debounceTime(800),
      distinctUntilChanged(),
      takeUntil(this.ngUnsubscribe)
    ).subscribe(() => {
      this.currentPage = 0;
      this.fetchLeaves();
    });
  }

  loadInitialData(): void {
    const user = this.authStateService.getUser();
    if (user) {
      this.loggedInUserRole = user.role;
      this.loggedInUserId = user.userId;
      this.schoolSlug = user.schoolSlug;

      if (this.loggedInUserRole === 'ADMIN') {
        // Class list must be loaded before a stored selection can be validated against it —
        // otherwise a stale value from another school/session could slip through.
        this.schoolService.getClasses().pipe(takeUntil(this.ngUnsubscribe)).subscribe({
          next: classes => {
            this.classList = classes;
            this.selectedClass = getStoredSelectedClass(this.schoolSlug, classes, 'all');
            this.cdr.markForCheck();
            this.fetchLeaves();
          },
          error: err => {
            this.logger.error('Failed to load classes:', err);
            this.classList = [];
            this.selectedClass = 'all';
            this.fetchLeaves();
          }
        });
      } else if (this.loggedInUserRole === 'TEACHER') {
        this.getTeacherClassAndLoadLeaves();
      }
    }
  }

  ngOnDestroy(): void {
    this.ngUnsubscribe.next();
    this.ngUnsubscribe.complete();
    this.studentIdInputSubject.complete();
  }

  getTeacherClassAndLoadLeaves(): void {
    this.teacherService.getTeacher(this.loggedInUserId).pipe(
      takeUntil(this.ngUnsubscribe),
    ).subscribe({
      next: (teacher: Teacher) => {
        this.loggedInUserClass = teacher.classTeacher ?? '';
        this.selectedClass = teacher.classTeacher ?? '';
        this.fetchLeaves();
      },
      error: (error: unknown) => {
        this.logger.error('Error fetching teacher details:', error);
        this.toast.error('Error!', 'Failed to load teacher details or leave applications.');
      }
    });
  }

  fetchLeaves(): void {
    let classFilterToSend: string | undefined = undefined;

    if (this.loggedInUserRole === 'ADMIN') {
      classFilterToSend = this.selectedClass === 'all' ? undefined : this.selectedClass;
      if (this.selectedClass === 'all') {
        clearStoredSelectedClass(this.schoolSlug);
      } else {
        setStoredSelectedClass(this.schoolSlug, this.selectedClass);
      }
    } else if (this.loggedInUserRole === 'TEACHER') {
      classFilterToSend = this.loggedInUserClass;
    }

    const formattedDate = this.selectedDate ? this.formatDate(this.selectedDate) : undefined;
    const studentIdToFilter = this.studentIdFilter ? this.studentIdFilter : undefined;

    const leavesObservable = this.leaveService.getLeavesPaginated(
      this.currentPage,
      this.pageSize,
      classFilterToSend,
      studentIdToFilter,
      formattedDate,
      this.statusFilter === 'all' ? undefined : this.statusFilter,
      'leaveDate',
      'desc'
    );

    this.isLoading = true;
    this.cdr.markForCheck();

    leavesObservable.pipe(takeUntil(this.ngUnsubscribe))
      .subscribe({
        next: (response: PaginatedResponse<LeaveApplication>) => {
          this.filteredLeaves = response.content;
          this.totalElements = response.totalElements;
          this.totalPages = response.totalPages;
          this.currentPage = response.number;
          this.isLoading = false;
          this.cdr.markForCheck();
        },
        error: (error: unknown) => {
          this.logger.error('Error loading leave applications:', error);
          this.toast.error('Error!', 'Failed to load leave applications.');
          this.filteredLeaves = [];
          this.totalElements = 0;
          this.totalPages = 0;
          this.isLoading = false;
          this.cdr.markForCheck();
        }
      });
  }

  formatDate(date: Date): string {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  onClassSelect(className: string): void {
    this.selectedClass = className;
    this.currentPage = 0;
    if (this.loggedInUserRole === 'ADMIN' && className === 'all') {
      this.selectedDate = null;
      this.studentIdFilter = '';
    }
    this.fetchLeaves();
  }

  onDateSelect(): void {
    this.currentPage = 0;
    this.fetchLeaves();
  }

  onStatusSelect(status: string): void {
    this.statusFilter = status;
    this.currentPage = 0;
    this.fetchLeaves();
  }

  onStudentIdInput(): void {
    this.studentIdInputSubject.next(this.studentIdFilter);
  }

  clearFilter(): void {
    this.selectedDate = null;
    this.studentIdFilter = '';
    this.statusFilter = 'PENDING';
    this.currentPage = 0;

    if (this.loggedInUserRole === 'ADMIN') {
      this.selectedClass = getStoredSelectedClass(this.schoolSlug, this.classList, 'all');
    }
    this.fetchLeaves();
  }

  /** Cancels every PENDING request on this page (kept as CANCELLED history; decided ones are skipped). */
  deleteAllFilteredLeaves(): void {
    const cancellable = this.filteredLeaves.filter(l => l.status === 'PENDING');
    if (cancellable.length === 0) {
      this.toast.info('Nothing to cancel', 'Only pending requests on this page can be cancelled.');
      return;
    }

    this.toast.confirm({
      title: 'Cancel pending requests?',
      html: `This cancels <strong>${cancellable.length}</strong> pending leave request(s) on this page. They stay in the history as cancelled.`,
      icon: 'warning',
      danger: true,
      confirmText: 'Yes, cancel them',
      cancelText: 'Keep them',
    }).then((confirmed) => {
      if (!confirmed) return;
      from(cancellable).pipe(
        concatMap(leave => this.leaveService.deleteLeaveById(leave.id)),
        takeUntil(this.ngUnsubscribe)
      ).subscribe({
        next: () => { },
        complete: () => {
          this.toast.success('Cancelled', 'The pending requests on this page were cancelled.');
          this.fetchLeaves();
        },
        error: (error) => {
          this.logger.error('Error cancelling leaves:', error);
          this.toast.error('Error!', this.errorText(error, 'Failed to cancel one or more leave requests.'));
          this.fetchLeaves();
        }
      });
    });
  }

  /** Cancels one pending request (admin), with an optional reason; the request is kept as history. */
  deleteLeave(leaveId: number): void {
    this.toast.confirmWithReason({
      title: 'Cancel this leave request?',
      message: 'The request stays in the history as cancelled.',
      icon: 'warning',
      danger: true,
      confirmText: 'Yes, cancel it',
      cancelText: 'Keep it',
      reasonInput: { label: 'Reason', placeholder: 'e.g. Entered by mistake' },
    }).then((reason) => {
      if (reason === null) return;
      this.leaveService.deleteLeaveById(leaveId, reason).pipe(takeUntil(this.ngUnsubscribe)).subscribe({
        next: () => {
          this.toast.success('Cancelled', 'The leave request was cancelled.');
          this.fetchLeaves();
        },
        error: (error) => {
          this.logger.error('Error cancelling leave:', error);
          this.toast.error('Error!', this.errorText(error, 'Failed to cancel the leave request.'));
        }
      });
    });
  }

  get allApproved(): boolean {
    return !this.filteredLeaves.some(l => l.status === 'PENDING');
  }

  /** Changing a decision is an explicit reversal (APPROVED ↔ REJECTED) and needs a reason. */
  editLeaveStatus(leave: LeaveApplication): void {
    const newStatus = leave.status === 'APPROVED' ? 'REJECTED' : 'APPROVED';
    const isApprove = newStatus === 'APPROVED';
    this.toast.confirmWithReason({
      title: 'Change decision?',
      html: `Change <strong>${this.escape(leave.studentName)}</strong> (${leave.leaveDate}) to <strong>${newStatus}</strong>? `
        + `Attendance records stay as they are.`,
      icon: 'question',
      danger: !isApprove,
      confirmText: `Yes, mark ${newStatus.toLowerCase()}`,
      cancelText: 'Cancel',
      reasonInput: { label: 'Reason for the change', required: true, placeholder: 'Why is the decision changing?' },
    }).then((reason) => {
      if (reason === null) return;
      this.updatingLeaveIds.add(leave.id);
      this.cdr.markForCheck();
      this.leaveService.reverseLeaveDecision(leave.id, reason)
        .pipe(takeUntil(this.ngUnsubscribe))
        .subscribe({
          next: (updated) => {
            Object.assign(leave, updated);
            this.updatingLeaveIds.delete(leave.id);
            this.cdr.markForCheck();
            this.toast.success('Updated!', `Decision changed to ${updated.status}.`);
          },
          error: (error) => {
            this.updatingLeaveIds.delete(leave.id);
            this.logger.error('Error changing leave decision:', error);
            this.toast.error('Error!', this.errorText(error, 'Failed to change the decision.'));
            this.cdr.markForCheck();
          }
        });
    });
  }

  updateLeaveStatus(leave: LeaveApplication, status: 'APPROVED' | 'REJECTED'): void {
    const isApprove = status === 'APPROVED';
    this.toast.confirmWithReason({
      title: isApprove ? 'Approve Leave?' : 'Reject Leave?',
      html: `<strong>${this.escape(leave.studentName)}</strong> &mdash; ${leave.leaveDate}`,
      icon: 'question',
      danger: !isApprove,
      confirmText: isApprove ? 'Yes, approve' : 'Yes, reject',
      cancelText: 'Cancel',
      reasonInput: isApprove
        ? { label: 'Note', placeholder: 'Optional note for the student' }
        : { label: 'Reason for rejecting', placeholder: 'Shown to the student and parents' },
    }).then((reason) => {
      if (reason === null) return;
      this.updatingLeaveIds.add(leave.id);
      this.cdr.markForCheck();
      this.leaveService.updateLeaveStatus(leave.id, status, reason)
        .pipe(takeUntil(this.ngUnsubscribe))
        .subscribe({
          next: (updated) => {
            Object.assign(leave, updated);
            this.updatingLeaveIds.delete(leave.id);
            this.cdr.markForCheck();
            if (status === 'APPROVED') {
              this.toast.success('Approved!', `Leave has been approved.`);
            } else {
              this.toast.info('Rejected!', `Leave has been rejected.`);
            }
          },
          error: (error) => {
            this.updatingLeaveIds.delete(leave.id);
            this.logger.error('Error updating leave status:', error);
            this.toast.error('Error!', this.errorText(error, 'Failed to update leave status.'));
            this.cdr.markForCheck();
          }
        });
    });
  }

  private errorText(error: any, fallback: string): string {
    const body = error?.error;
    if (typeof body === 'string') {
      try { return JSON.parse(body)?.message ?? body; } catch { return body || fallback; }
    }
    return body?.message || fallback;
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

  nextPage(): void {
    this.goToPage(this.currentPage + 1);
  }

  prevPage(): void {
    this.goToPage(this.currentPage - 1);
  }

  onPageSizeChange(newPageSize: number): void {
    this.pageSize = newPageSize;
    this.currentPage = 0;
    this.fetchLeaves();
  }


  trackByLeaveId(index: number, leave: LeaveApplication): number { return leave.id; }
  trackByClass(index: number, className: string): string { return className; }
  trackByIndex(index: number): number { return index; }

  getPaginationDisplayPages(): (number | string)[] {
    const pages: (number | string)[] = [];
    const total = this.totalPages;
    const current = this.currentPage;
    const maxVisiblePages = 3;
    if (total <= 1) {
      return [];
    }

    let start = Math.max(0, current - Math.floor(maxVisiblePages / 2));
    let end = start + maxVisiblePages - 1;

    if (end >= total) {
      end = total - 1;
      start = Math.max(0, end - maxVisiblePages + 1);
    }

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    if (!pages.includes(0)) {
      pages.unshift('...');
      pages.unshift(0);
    }

    if (!pages.includes(total - 1)) {
      pages.push('...');
      pages.push(total - 1);
    }

    const cleanedPages: (number | string)[] = [];
    let lastAddedItem: number | string | null = null;
    for (const item of pages) {
      if (typeof item === 'number') {
        if (item !== lastAddedItem) {
          cleanedPages.push(item);
          lastAddedItem = item;
        }
      } else {
        if (lastAddedItem !== '...') {
          cleanedPages.push(item);
          lastAddedItem = item;
        }
      }
    }
    return cleanedPages;
  }
}
