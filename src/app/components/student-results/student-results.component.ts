import {
  AfterViewChecked, ChangeDetectionStrategy, ChangeDetectorRef,
  Component, ElementRef, Inject, OnDestroy, OnInit, PLATFORM_ID, QueryList, ViewChild, ViewChildren
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import Chart from 'chart.js/auto';
import { MarksService, ExamResult } from '../../services/marks.service';
import { AuthStateService } from '../../auth/auth-state.service';
import { LoggerService } from '../../services/logger.service';
import { AcademicSessionService } from '../../services/academic-session.service';
import { ParentPortalService } from '../../services/parent-portal.service';
import { ChildAccess } from '../../interfaces/parent-portal';
import { ToastService } from '../../services/toast.service';
import { ParentChildContextComponent } from '../parent-child-context/parent-child-context.component';

@Component({
  selector: 'app-student-results',
  standalone: true,
  imports: [CommonModule, FormsModule, ParentChildContextComponent],
  templateUrl: './student-results.component.html',
  styleUrl: './student-results.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudentResultsComponent implements OnInit, OnDestroy, AfterViewChecked {
  private destroy$ = new Subject<void>();
  private charts: Map<number, Chart> = new Map();
  private chartsNeedRender = false;
  private progressChart: Chart | null = null;
  private progressNeedsRender = false;

  @ViewChildren('barCanvas') barCanvases!: QueryList<ElementRef>;
  @ViewChild('progressCanvas') progressCanvas!: ElementRef;

  sessions: string[] = [];
  selectedSession = '';
  studentId = '';
  results: ExamResult[] = [];
  expandedExamId: number | null = null;
  loading = false;
  showProgress = false;

  constructor(
    private marksService: MarksService,
    private authState: AuthStateService,
    private academicSessionService: AcademicSessionService,
    private parentPortalService: ParentPortalService,
    private route: ActivatedRoute,
    private toast: ToastService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private logger: LoggerService,
    @Inject(PLATFORM_ID) private platformId: object
  ) { }

  ngOnInit(): void {
    const requestedStudentId = this.route.snapshot.queryParamMap.get('studentId');
    if (this.authState.getUserRole() === 'PARENT') {
      if (!requestedStudentId) {
        this.toast.error('No child selected', 'Open results from the parent portal.');
        return;
      }
      this.studentId = requestedStudentId;
      this.parentPortalService.getMyProfile().pipe(takeUntil(this.destroy$)).subscribe({
        next: profile => {
          const allowed = profile.children.some(child => child.studentId === this.studentId && child.canViewResults);
          if (!allowed) {
            this.studentId = '';
            this.toast.error('Results access unavailable', 'Please contact the school administrator.');
            this.cdr.markForCheck();
          }
        },
        error: () => this.toast.error('Could not verify results access')
      });
    } else {
      this.studentId = this.authState.getUserId();
    }
    this.academicSessionService.getAllSessions().pipe(takeUntil(this.destroy$)).subscribe({
      next: sessions => {
        this.sessions = sessions.map(s => s.label);
        const current = sessions.find(s => s.current);
        this.selectedSession = current ? current.label : (this.sessions[0] ?? '');
        this.cdr.markForCheck();
        this.loadResults();
      },
      error: (e) => this.logger.error('Failed to load sessions', e)
    });
  }

  ngOnDestroy(): void {
    this.charts.forEach(c => c.destroy());
    if (this.progressChart) { this.progressChart.destroy(); }
    this.destroy$.next();
    this.destroy$.complete();
  }

  ngAfterViewChecked(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (this.chartsNeedRender) {
      this.chartsNeedRender = false;
      this.renderCharts();
    }
    if (this.progressNeedsRender) {
      this.progressNeedsRender = false;
      this.renderProgressChart();
    }
  }

  loadResults(): void {
    this.loading = true;
    this.results = [];
    this.expandedExamId = null;
    this.charts.forEach(c => c.destroy());
    this.charts.clear();
    if (this.progressChart) { this.progressChart.destroy(); this.progressChart = null; }

    this.marksService.getStudentResults(this.studentId, this.selectedSession)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.results = data;
          this.loading = false;
          if (this.showProgress && this.results.length > 0) {
            this.progressNeedsRender = true;
          }
          this.cdr.markForCheck();
        },
        error: (e) => {
          this.logger.error('Error loading results:', e);
          this.loading = false;
          this.cdr.markForCheck();
        },
      });
  }

  onChildTabSelected(child: ChildAccess): void {
    if (!child.canViewResults) {
      this.toast.error('Results access unavailable', 'Please contact the school administrator.');
      return;
    }
    this.studentId = child.studentId;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { studentId: child.studentId },
      replaceUrl: true,
    });
    this.loadResults();
  }

  toggleProgress(): void {
    this.showProgress = !this.showProgress;
    if (this.showProgress && this.results.length > 0) {
      this.progressNeedsRender = true;
    } else if (!this.showProgress && this.progressChart) {
      this.progressChart.destroy();
      this.progressChart = null;
    }
    this.cdr.markForCheck();
  }

  // ── Progress Tracker computed values ────────────────────────────

  /** Exams with a final result (every mark entered); incomplete ones have no percentage yet. */
  get completeResults(): (ExamResult & { percentage: number })[] {
    return this.results.filter((r): r is ExamResult & { percentage: number } => r.percentage !== null);
  }

  get bestExam(): ExamResult | null {
    const done = this.completeResults;
    if (!done.length) return null;
    return done.reduce((best, r) => r.percentage > best.percentage ? r : best);
  }

  get averagePercentage(): number {
    const done = this.completeResults;
    if (!done.length) return 0;
    return done.reduce((sum, r) => sum + r.percentage, 0) / done.length;
  }

  get trend(): string {
    const done = this.completeResults;
    if (done.length < 2) return '—';
    const last = done[done.length - 1].percentage;
    const prev = done[done.length - 2].percentage;
    if (last > prev + 1) return '↑';
    if (last < prev - 1) return '↓';
    return '→';
  }

  get trendClass(): string {
    const t = this.trend;
    if (t === '↑') return 'trend-up';
    if (t === '↓') return 'trend-down';
    return 'trend-flat';
  }

  get uniqueSubjects(): string[] {
    const seen = new Set<string>();
    this.results.forEach(r => r.subjects.forEach(s => seen.add(s.subjectName)));
    return Array.from(seen);
  }

  getSubjectMarks(exam: ExamResult, subjectName: string): { obtained: number | null; max: number } | null {
    const s = exam.subjects.find(sub => sub.subjectName === subjectName);
    return s ? { obtained: s.marksObtained, max: s.maxMarks } : null;
  }

  getSubjectTrend(subjectName: string): string {
    const entries = this.results
      .map(r => r.subjects.find(s => s.subjectName === subjectName))
      .filter((s): s is NonNullable<typeof s> => !!s && s.marksObtained !== null);
    if (entries.length < 2) return '—';
    const firstPct = (entries[0].marksObtained! / entries[0].maxMarks) * 100;
    const lastPct  = (entries[entries.length - 1].marksObtained! / entries[entries.length - 1].maxMarks) * 100;
    if (lastPct > firstPct + 2) return '↑';
    if (lastPct < firstPct - 2) return '↓';
    return '→';
  }

  getSubjectTrendClass(subjectName: string): string {
    const t = this.getSubjectTrend(subjectName);
    if (t === '↑') return 'trend-up';
    if (t === '↓') return 'trend-down';
    return 'trend-flat';
  }

  private renderProgressChart(): void {
    if (!this.progressCanvas) return;
    const canvas = this.progressCanvas.nativeElement;
    if (this.progressChart) { this.progressChart.destroy(); this.progressChart = null; }

    const done = this.completeResults;
    const labels = done.map(r => r.examName);
    const studentData = done.map(r => parseFloat(r.percentage.toFixed(1)));
    const classAvgData = done.map(r => {
      const totalMax = r.subjects.reduce((sum, s) => sum + s.maxMarks, 0);
      const totalAvg = r.subjects.reduce((sum, s) => sum + (s.classAverage ?? 0), 0);
      return totalMax > 0 ? parseFloat(((totalAvg / totalMax) * 100).toFixed(1)) : 0;
    });

    const isMobile = window.innerWidth <= 600;

    this.progressChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Your %',
            data: studentData,
            borderColor: '#1f6f8b',
            backgroundColor: 'rgba(31,111,139,0.12)',
            borderWidth: 3,
            pointBackgroundColor: '#1f6f8b',
            pointRadius: 5,
            pointHoverRadius: 7,
            fill: true,
            tension: 0.35,
          } as any,
          {
            label: 'Class Avg %',
            data: classAvgData,
            borderColor: '#4fbdbd',
            backgroundColor: 'rgba(79,189,189,0.08)',
            borderWidth: 2,
            borderDash: [6, 4],
            pointBackgroundColor: '#4fbdbd',
            pointRadius: 4,
            pointHoverRadius: 6,
            fill: false,
            tension: 0.35,
          } as any,
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: {
              boxWidth: isMobile ? 10 : 14,
              font: { size: isMobile ? 10 : 12 },
              padding: 12,
            },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y}%`,
            },
          },
        },
        scales: {
          y: {
            beginAtZero: false,
            min: 0,
            max: 100,
            grid: { color: 'rgba(0,0,0,0.05)' },
            ticks: {
              font: { size: isMobile ? 10 : 12 },
              callback: (v) => v + '%',
            },
          },
          x: {
            grid: { display: false },
            ticks: {
              font: { size: isMobile ? 9 : 12 },
              maxRotation: isMobile ? 30 : 0,
            },
          },
        },
      },
    });
  }

  toggleExam(examId: number): void {
    if (this.expandedExamId === examId) {
      this.expandedExamId = null;
      const chart = this.charts.get(examId);
      if (chart) { chart.destroy(); this.charts.delete(examId); }
    } else {
      this.expandedExamId = examId;
      this.chartsNeedRender = true;
      this.cdr.markForCheck();
    }
  }

  private renderCharts(): void {
    if (!this.expandedExamId) return;
    const exam = this.results.find(r => r.examId === this.expandedExamId);
    if (!exam) return;

    const canvas = this.barCanvases.find(
      (el) => el.nativeElement.dataset['examId'] === String(exam.examId)
    );
    if (!canvas) return;

    const existing = this.charts.get(exam.examId);
    if (existing) existing.destroy();

    const isMobile = window.innerWidth <= 600;

    const labels = exam.subjects.map(s => s.subjectName);
    const studentData = exam.subjects.map(s => s.marksObtained ?? 0);
    const avgData = exam.subjects.map(s => s.classAverage ?? 0);
    const maxData = exam.subjects.map(s => s.maxMarks);

    const chart = new Chart(canvas.nativeElement, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Your Marks',
            data: studentData,
            backgroundColor: 'rgba(31, 111, 139, 0.75)',
            borderColor: '#1f6f8b',
            borderWidth: 2,
            borderRadius: 4,
            ...(isMobile ? { barThickness: 18 } : {}),
          },
          {
            label: 'Class Avg',
            data: avgData,
            backgroundColor: 'rgba(79, 189, 189, 0.55)',
            borderColor: '#4fbdbd',
            borderWidth: 2,
            borderRadius: 4,
            ...(isMobile ? { barThickness: 18 } : {}),
          },
          {
            label: 'Max',
            data: maxData,
            backgroundColor: 'rgba(200, 200, 200, 0.3)',
            borderColor: '#bbb',
            borderWidth: 1,
            borderRadius: 4,
            ...(isMobile ? { barThickness: 18 } : {}),
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: isMobile ? 'bottom' : 'top',
            labels: {
              boxWidth: isMobile ? 10 : 14,
              font: { size: isMobile ? 10 : 12 },
              padding: isMobile ? 8 : 12,
            },
          },
          title: { display: false },
          tooltip: {
            titleFont: { size: isMobile ? 11 : 13 },
            bodyFont: { size: isMobile ? 11 : 12 },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(0,0,0,0.06)' },
            ticks: { font: { size: isMobile ? 10 : 12 } },
          },
          x: {
            grid: { display: false },
            ticks: {
              font: { size: isMobile ? 9 : 12 },
              maxRotation: isMobile ? 30 : 0,
            },
          },
        },
      },
    });
    this.charts.set(exam.examId, chart);
  }

  /** Badge colour only — the grade itself always comes from the backend (school grading system). */
  getGradeClass(exam: ExamResult): string {
    if (exam.percentage === null) return 'grade-c';
    if (exam.passed === false) return 'grade-f';
    if (exam.percentage >= 80) return 'grade-a';
    if (exam.percentage >= 60) return 'grade-b';
    return 'grade-c';
  }

  openReportCard(examId: number | null): void {
    const queryParams: Record<string, string> = {
      studentId: this.studentId,
      session: this.selectedSession,
    };
    if (examId !== null) queryParams['examId'] = String(examId);
    this.router.navigate(['/dashboard/report-card'], { queryParams });
  }

  trackById(index: number, item: { examId: number }): number { return item.examId; }
  trackByIndex(index: number): number { return index; }
}
