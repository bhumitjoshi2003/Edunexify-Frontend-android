import { WisdomCardsComponent } from '../wisdom/wisdom-cards.component';
import { PageHeaderComponent } from '../ui/page-header/page-header.component';
import {
  ChangeDetectionStrategy, ChangeDetectorRef,
  Component, OnDestroy, OnInit
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { Subject, forkJoin, takeUntil } from 'rxjs';

import { AuthStateService } from '../../auth/auth-state.service';
import { StudentService } from '../../services/student.service';
import { AttendanceService } from '../../services/attendance.service';
import { LeaveService, LeaveApplication } from '../../services/leave.service';
import { LoggerService } from '../../services/logger.service';
import { HomeworkService } from '../../services/homework.service';
import { HomeworkClasswork, dueLabel, homeworkKind } from '../../interfaces/homework';
import { ClassUpdateService } from '../../services/class-update.service';
import { ClassUpdate } from '../../interfaces/class-update';
import { AssessmentService } from '../../services/assessment.service';
import { Assessment, countdownLabel, countdownTone, dateParts } from '../../interfaces/assessment';

@Component({
  selector: 'app-student-dashboard',
  standalone: true,
  imports: [WisdomCardsComponent, PageHeaderComponent, CommonModule, RouterLink, MatIconModule],
  templateUrl: './student-dashboard.component.html',
  styleUrl: './student-dashboard.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudentDashboardComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  studentId = '';
  studentName = '';
  className = '';
  isLoading = true;
  today = new Date();

  attendancePercentage = 0;
  daysPresent = 0;
  daysAbsent = 0;
  totalWorkingDays = 0;
  lowAttendance = false;
  lowAttendanceThreshold = 75;
  pendingLeavesCount = 0;
  recentLeaves: LeaveApplication[] = [];

  /** Isolated from the main dashboard load: a homework outage never blocks the rest. */
  todayHomework: HomeworkClasswork[] = [];
  homeworkLoading = true;
  homeworkFailed = false;
  readonly homeworkPreviewLimit = 3;
  readonly homeworkKind = homeworkKind;
  readonly dueLabel = dueLabel;

  /** Recent active class updates — isolated like homework: an outage never blocks the rest. */
  classUpdates: ClassUpdate[] = [];
  classUpdatesLoading = true;
  classUpdatesFailed = false;
  readonly classUpdatesPreviewLimit = 3;

  /** Next few assessments — isolated like homework: an outage never blocks the rest. */
  upcomingAssessments: Assessment[] = [];
  assessmentsLoading = true;
  assessmentsFailed = false;
  readonly assessmentsPreviewLimit = 3;
  readonly assessmentCountdown = (date: string) => countdownLabel(date);
  readonly assessmentCountdownTone = (date: string) => countdownTone(date);
  readonly assessmentParts = dateParts;

  constructor(
    private authState: AuthStateService,
    private studentService: StudentService,
    private attendanceService: AttendanceService,
    private leaveService: LeaveService,
    private cdr: ChangeDetectorRef,
    private logger: LoggerService,
    private homework: HomeworkService,
    private classUpdateService: ClassUpdateService,
    private assessmentService: AssessmentService,
  ) {}

  ngOnInit(): void {
    const user = this.authState.getUser();
    if (!user?.userId) { this.isLoading = false; return; }
    this.studentId = user.userId;

    this.studentService.getStudent(this.studentId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: student => {
          this.studentName = student.name;
          this.className = student.className;
          this.loadDashboardData();
        },
        error: e => {
          this.logger.error('Student fetch error:', e);
          this.isLoading = false;
          this.cdr.markForCheck();
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadTodayHomework(): void {
    this.homeworkLoading = true;
    this.homeworkFailed = false;
    this.cdr.markForCheck();
    this.homework.studentOn().pipe(takeUntil(this.destroy$)).subscribe({
      next: items => {
        this.todayHomework = items;
        this.homeworkLoading = false;
        this.cdr.markForCheck();
      },
      error: err => {
        this.logger.error('Today\'s homework load failed (isolated):', err);
        this.homeworkLoading = false;
        this.homeworkFailed = true;
        this.cdr.markForCheck();
      },
    });
  }

  loadClassUpdates(): void {
    this.classUpdatesLoading = true;
    this.classUpdatesFailed = false;
    this.cdr.markForCheck();
    this.classUpdateService.studentActive(this.classUpdatesPreviewLimit).pipe(takeUntil(this.destroy$)).subscribe({
      next: items => {
        this.classUpdates = items.slice(0, this.classUpdatesPreviewLimit);
        this.classUpdatesLoading = false;
        this.cdr.markForCheck();
      },
      error: err => {
        this.logger.error('Class updates load failed (isolated):', err);
        this.classUpdatesLoading = false;
        this.classUpdatesFailed = true;
        this.cdr.markForCheck();
      },
    });
  }

  loadUpcomingAssessments(): void {
    this.assessmentsLoading = true;
    this.assessmentsFailed = false;
    this.cdr.markForCheck();
    this.assessmentService.studentUpcoming(this.assessmentsPreviewLimit).pipe(takeUntil(this.destroy$)).subscribe({
      next: items => {
        this.upcomingAssessments = items.slice(0, this.assessmentsPreviewLimit);
        this.assessmentsLoading = false;
        this.cdr.markForCheck();
      },
      error: err => {
        this.logger.error('Upcoming assessments load failed (isolated):', err);
        this.assessmentsLoading = false;
        this.assessmentsFailed = true;
        this.cdr.markForCheck();
      },
    });
  }

  private loadDashboardData(): void {
    this.loadTodayHomework();
    this.loadClassUpdates();
    this.loadUpcomingAssessments();

    forkJoin([
      // Current-session Attendance Insights (the full breakdown lives on the Attendance page).
      this.attendanceService.getMyInsights(),
      this.leaveService.getLeavesByStudentId(this.studentId, 0, 10),
    ]).pipe(takeUntil(this.destroy$)).subscribe({
      next: ([summary, leavesPage]) => {
        this.attendancePercentage = summary.percentage;
        this.daysPresent = summary.present;
        this.daysAbsent = summary.absent;
        this.totalWorkingDays = summary.submittedDays;
        this.lowAttendance = summary.lowAttendance;
        this.lowAttendanceThreshold = summary.lowAttendanceThreshold;

        const leaves = leavesPage.content
          .slice()
          .sort((a, b) => b.leaveDate.localeCompare(a.leaveDate));
        this.pendingLeavesCount = leaves.filter(l => l.status === 'PENDING').length;
        this.recentLeaves = leaves.slice(0, 5);

        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: e => {
        this.logger.error('Student dashboard data error:', e);
        this.isLoading = false;
        this.cdr.markForCheck();
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
    // Attendance Insights rule: at or above the threshold (75%) is healthy.
    if (this.totalWorkingDays === 0) return '#94a3b8';
    return this.lowAttendance ? '#dc2626' : '#059669';
  }

  getLeaveStatusClass(status: string): string {
    switch (status) {
      case 'APPROVED': return 'sd-status--approved';
      case 'REJECTED': return 'sd-status--rejected';
      default:         return 'sd-status--pending';
    }
  }

  getLeaveStatusLabel(status: string): string {
    switch (status) {
      case 'APPROVED': return 'Approved';
      case 'REJECTED': return 'Rejected';
      default:         return 'Pending';
    }
  }

  hasFeature(featureKey: string): boolean {
    return this.authState.hasFeature(featureKey);
  }
}
