import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { Observable, Subject, takeUntil } from 'rxjs';
import { AuthStateService } from '../../auth/auth-state.service';
import { CoordinatorMyTeachingComponent } from '../coordinator-my-teaching/coordinator-my-teaching.component';
import { CoordinatorService } from '../../services/coordinator.service';
import {
  CoordinatorMarksCompletion, CoordinatorOverview, CoordinatorReportCardProgress, MyCoordinatorAppointment,
  coordinatorScopeLabel, coordinatorUnitLabel
} from '../../interfaces/coordinator';

/** One independently loaded panel: its data, loading flag and failure. */
interface Panel<T> { data: T | null; loading: boolean; failed: boolean; }

/**
 * Academic Coordinator home — the one dashboard of a coordinating teacher, laid out like the Principal's:
 * today's tiles, what needs attention, attendance by section, report-card and marks completion and
 * upcoming work, with a "My teaching" panel for their own classes, check-in and leave. Every figure
 * is computed by the server within the Coordinator's scope.
 */
@Component({
  selector: 'app-coordinator-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, CoordinatorMyTeachingComponent],
  templateUrl: './coordinator-dashboard.component.html',
  // Same visual language as the Principal dashboard; the local sheet only adds what is Coordinator-specific.
  styleUrls: ['../principal-dashboard/principal-dashboard.component.css', './coordinator-dashboard.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CoordinatorDashboardComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  name = '';
  greeting = 'Welcome';
  appointment: Panel<MyCoordinatorAppointment> = { data: null, loading: true, failed: false };
  overview: Panel<CoordinatorOverview> = { data: null, loading: true, failed: false };
  reportCards: Panel<CoordinatorReportCardProgress[]> = { data: null, loading: true, failed: false };
  marks: Panel<CoordinatorMarksCompletion[]> = { data: null, loading: true, failed: false };

  readonly scopeLabel = coordinatorScopeLabel;
  readonly unitLabel = coordinatorUnitLabel;

  constructor(
    private coordinators: CoordinatorService,
    private authState: AuthStateService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.name = this.authState.getUser()?.name ?? '';
    const hour = new Date().getHours();
    this.greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(): void {
    this.fill(this.appointment, this.coordinators.mine(), m => !!m);
    this.fill(this.overview, this.coordinators.overview());
    this.fill(this.reportCards, this.coordinators.reportCards());
    this.fill(this.marks, this.coordinators.marksCompletion());
  }

  private fill<T>(panel: Panel<T>, source: Observable<T | null>, valid: (v: T | null) => boolean = v => v !== null): void {
    panel.loading = true;
    panel.failed = false;
    source.pipe(takeUntil(this.destroy$)).subscribe({
      next: value => {
        panel.data = valid(value) ? value : null;
        panel.failed = !valid(value);
        panel.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        panel.loading = false;
        panel.failed = true;
        this.cdr.markForCheck();
      }
    });
  }

  get classroomEnabled(): boolean { return this.authState.hasFeature('CLASSROOM'); }
  get examsEnabled(): boolean { return this.authState.hasFeature('EXAMS_RESULTS'); }
  get reportCardsEnabled(): boolean { return this.authState.hasFeature('REPORT_CARDS'); }

  get submittedSections(): number {
    return this.overview.data?.attendance.filter(a => a.submitted).length ?? 0;
  }

  get presentToday(): number {
    return this.overview.data?.attendance.reduce((sum, a) => sum + a.present, 0) ?? 0;
  }

  get markedToday(): number {
    return this.overview.data?.attendance.reduce((sum, a) => sum + a.present + a.absent, 0) ?? 0;
  }

  /** Report-card sections that still need work (incomplete marks, no result or missing remarks). */
  get reportCardsNeedingWork(): CoordinatorReportCardProgress[] {
    return (this.reportCards.data ?? []).filter(r => r.incomplete > 0 || r.missingTeacherRemarks > 0 || r.noResult > 0);
  }

  completion(done: number, total: number): number {
    return total > 0 ? Math.round((done / total) * 100) : 0;
  }

  /** Marks still missing, worst first (published exams are settled and left out). */
  get openMarks(): CoordinatorMarksCompletion[] {
    return (this.marks.data ?? []).filter(m => !m.published && m.missing > 0)
      .sort((a, b) => b.missing - a.missing).slice(0, 6);
  }

  approvalLabel(status: string): string {
    switch (status) {
      case 'NOT_REQUIRED': return 'No approval step';
      case 'PENDING_TEACHER': return 'Awaiting class teacher';
      case 'TEACHER_APPROVED': return 'Awaiting Principal';
      case 'PRINCIPAL_APPROVED': return 'Approved';
      case 'RETURNED': return 'Returned for correction';
      case 'STALE': return 'Changed since review';
      default: return status;
    }
  }

  /** One list for "Needs your attention": the server's items first, then report cards and marks that still need work. */
  get attentionItems(): { severity: string; title: string; detail: string; route: string | null; icon: string }[] {
    const items = (this.overview.data?.attention ?? []).map(a => ({
      severity: a.severity === 'danger' ? 'urgent' : a.severity === 'warning' ? 'warning' : 'action',
      title: a.title, detail: a.detail, route: a.route,
      icon: a.severity === 'danger' ? 'event_busy' : a.severity === 'warning' ? 'schedule' : 'info'
    }));
    if (this.reportCardsEnabled) {
      for (const r of this.reportCardsNeedingWork.slice(0, 3)) {
        items.push({ severity: 'warning', title: `${r.setupName} · ${this.unitLabel(r)}`,
          detail: `${r.incomplete} incomplete · ${r.missingTeacherRemarks} without teacher remarks`,
          route: '/dashboard/report-card-review', icon: 'fact_check' });
      }
    }
    return items;
  }

  get attentionLoading(): boolean { return this.overview.loading || this.reportCards.loading; }
  get attentionIncomplete(): boolean { return !this.attentionLoading && (this.overview.failed || (this.reportCardsEnabled && this.reportCards.failed)); }

  trackByIndex(i: number): number { return i; }

  gapSummary(m: CoordinatorMarksCompletion): string {
    return m.gaps.slice(0, 3).map(g => `${g.subjectName} (${g.missing})`).join(', ');
  }
}
