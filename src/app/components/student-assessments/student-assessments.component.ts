import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Inject, OnDestroy, OnInit, PLATFORM_ID } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { interval, Observable, Subject, takeUntil } from 'rxjs';
import {
  Assessment,
  assessmentClassLabel,
  assessmentTimeRange,
  assessmentTypeMeta,
  countdownLabel,
  countdownTone,
  dateParts,
  daysUntil,
} from '../../interfaces/assessment';
import { formatFileSize } from '../../interfaces/homework';
import { AssessmentService } from '../../services/assessment.service';
import { LoggerService } from '../../services/logger.service';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthStateService } from '../../auth/auth-state.service';
import { ChildAccess } from '../../interfaces/parent-portal';
import { ParentChildContextComponent } from '../parent-child-context/parent-child-context.component';

export type StudentAssessmentTab = 'upcoming' | 'month' | 'past';

interface TabState {
  loaded: boolean;
  loading: boolean;
  failed: boolean;
  items: Assessment[];
}

@Component({
  selector: 'app-student-assessments',
  standalone: true,
  imports: [CommonModule, MatIconModule, ParentChildContextComponent],
  templateUrl: './student-assessments.component.html',
  styleUrl: './student-assessments.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudentAssessmentsComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  readonly typeMeta = assessmentTypeMeta;
  readonly classLabel = assessmentClassLabel;
  readonly timeRange = assessmentTimeRange;
  readonly parts = dateParts;
  readonly fileSize = formatFileSize;
  readonly skeletons = [0, 1, 2];
  readonly tabs: { key: StudentAssessmentTab; label: string; icon: string }[] = [
    { key: 'upcoming', label: 'Upcoming', icon: 'event_upcoming' },
    { key: 'month', label: 'This month', icon: 'calendar_month' },
    { key: 'past', label: 'Past', icon: 'history' },
  ];

  active: StudentAssessmentTab = 'upcoming';
  state: Record<StudentAssessmentTab, TabState> = {
    upcoming: { loaded: false, loading: false, failed: false, items: [] },
    month: { loaded: false, loading: false, failed: false, items: [] },
    past: { loaded: false, loading: false, failed: false, items: [] },
  };
  /** The month shown in "This month" (first day, local). */
  month = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  /** Refreshed every minute so countdowns roll over at midnight. */
  now = new Date();
  /** A parent reads the same view for the linked child named in ?studentId= (the backend
   *  checks the link); the shared child switcher changes it. Nothing here can create or edit. */
  readonly isParent: boolean;
  studentId: string | null = null;
  /** The backend refused this child for this parent (unlinked, ended or revoked link): the
   *  switcher explains it and offers the linked children, so the page body stays hidden. */
  denied = false;

  constructor(
    private assessments: AssessmentService,
    private logger: LoggerService,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: object,
    private route: ActivatedRoute,
    private router: Router,
    authState: AuthStateService,
  ) {
    this.isParent = authState.getUserRole() === 'PARENT';
  }

  ngOnInit(): void {
    if (this.isParent) {
      this.route.queryParamMap.pipe(takeUntil(this.destroy$)).subscribe(q => {
        this.studentId = q.get('studentId');
        this.denied = false;
        for (const tab of this.tabs) this.state[tab.key] = { loaded: false, loading: false, failed: false, items: [] };
        // "Upcoming" also feeds the header counts, so it loads first, like the student view.
        if (this.studentId) { this.select('upcoming'); if (this.active !== 'upcoming') this.select(this.active); }
        this.cdr.markForCheck();
      });
    } else {
      this.select('upcoming');
    }
    if (isPlatformBrowser(this.platformId)) {
      interval(60_000).pipe(takeUntil(this.destroy$)).subscribe(() => {
        this.now = new Date();
        this.cdr.markForCheck();
      });
    }
  }

  select(tab: StudentAssessmentTab): void {
    this.active = tab;
    if (!this.state[tab].loaded && !this.state[tab].loading) this.load(tab);
  }

  load(tab: StudentAssessmentTab): void {
    const s = this.state[tab];
    s.loading = true;
    s.failed = false;
    this.cdr.markForCheck();
    this.source(tab).pipe(takeUntil(this.destroy$)).subscribe({
      next: items => {
        s.items = items;
        s.loaded = true;
        s.loading = false;
        this.cdr.markForCheck();
      },
      error: error => {
        this.logger.error(`Assessments (${tab}) load failed:`, error);
        if (this.isParent && error?.status === 403) this.denied = true;
        s.loading = false;
        s.failed = true;
        this.cdr.markForCheck();
      },
    });
  }

  private source(tab: StudentAssessmentTab): Observable<Assessment[]> {
    if (tab === 'month') return this.assessments.studentMonth(this.monthKey, this.studentId);
    if (tab === 'past') return this.assessments.studentPast(this.studentId);
    return this.assessments.studentUpcoming(undefined, this.studentId);
  }

  get monthKey(): string {
    return `${this.month.getFullYear()}-${String(this.month.getMonth() + 1).padStart(2, '0')}`;
  }

  get monthLabel(): string {
    return this.month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  }

  shiftMonth(delta: number): void {
    this.month = new Date(this.month.getFullYear(), this.month.getMonth() + delta, 1);
    this.load('month');
  }

  get tabIndex(): number {
    return this.tabs.findIndex(t => t.key === this.active);
  }

  get thisWeekCount(): number {
    return this.state.upcoming.items.filter(a => daysUntil(a.assessmentDate, this.now) <= 7).length;
  }

  countdown(item: Assessment): string {
    return countdownLabel(item.assessmentDate, this.now);
  }

  countdownTone(item: Assessment): string {
    return countdownTone(item.assessmentDate, this.now);
  }

  emptyText(tab: StudentAssessmentTab): string {
    if (tab === 'month') return `No assessments in ${this.monthLabel}.`;
    if (tab === 'past') return 'No past assessments yet.';
    return 'No upcoming assessments.';
  }

  trackById(_: number, item: Assessment): number {
    return item.id;
  }

  onChildSelected(child: ChildAccess): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: { studentId: child.studentId }, replaceUrl: true });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
