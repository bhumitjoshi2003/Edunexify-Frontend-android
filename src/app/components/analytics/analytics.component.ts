import {
  ChangeDetectionStrategy, ChangeDetectorRef,
  Component, OnDestroy, OnInit
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, forkJoin, of, takeUntil } from 'rxjs';
import { BaseChartDirective } from 'ng2-charts';
import { Chart, registerables, ChartConfiguration, ChartData } from 'chart.js';
import {
  DashboardAnalyticsService, FeeTrend, ClassStats, AttendanceTrend
} from '../../services/dashboard-analytics.service';
import { SchoolService } from '../../services/school.service';
import { LoggerService } from '../../services/logger.service';
import { AuthStateService } from '../../auth/auth-state.service';

Chart.register(...registerables);

const PALETTE = [
  '#6366f1', '#0891b2', '#059669', '#d97706',
  '#dc2626', '#7c3aed', '#db2777', '#0284c7',
  '#65a30d', '#ea580c', '#0d9488', '#8b5cf6',
];

@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [CommonModule, FormsModule, BaseChartDirective],
  templateUrl: './analytics.component.html',
  styleUrl: './analytics.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalyticsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  isLoading = true;
  error = '';
  hasData: boolean = false;
  analyticsError: string | null = null;
  today = new Date();

  // ── Fee trend (bar) ───────────────────────────────────────────
  feeTrendData: ChartData<'bar'> = { labels: [], datasets: [] };
  feeTrendOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: { label: ctx => `₹${Number(ctx.parsed.y).toLocaleString('en-IN')}` }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(0,0,0,0.04)' },
        ticks: { callback: val => `₹${Number(val).toLocaleString('en-IN')}` }
      },
      x: { grid: { display: false } }
    }
  };

  // ── Class attendance (horizontal bar) ────────────────────────
  attendanceData: ChartData<'bar'> = { labels: [], datasets: [] };
  attendanceOptions: ChartConfiguration<'bar'>['options'] = {
    indexAxis: 'y' as const,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: ctx => `${Number(ctx.parsed.x).toFixed(1)}%` } }
    },
    scales: {
      x: {
        beginAtZero: true, max: 100,
        grid: { color: 'rgba(0,0,0,0.04)' },
        ticks: { callback: val => `${val}%` }
      },
      y: { grid: { display: false } }
    }
  };

  // ── Student distribution (doughnut) ──────────────────────────
  distributionData: ChartData<'doughnut'> = { labels: [], datasets: [] };
  distributionOptions: ChartConfiguration<'doughnut'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'right', labels: { boxWidth: 12, padding: 14, font: { size: 11 } } },
      tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed} students` } }
    },
    cutout: '62%',
  };

  // ── Raw data for summary stats ────────────────────────────────
  private rawClassStats: ClassStats[] = [];
  private rawFeeTrend: FeeTrend[] = [];

  get totalStudents(): number {
    return this.rawClassStats.reduce((s, c) => s + c.studentCount, 0);
  }
  get avgAttendance(): number {
    if (!this.rawClassStats.length) return 0;
    return this.rawClassStats.reduce((s, c) => s + c.attendanceRate, 0) / this.rawClassStats.length;
  }
  get totalClasses(): number { return this.rawClassStats.length; }
  get latestMonthFee(): number {
    return this.rawFeeTrend.length ? this.rawFeeTrend[this.rawFeeTrend.length - 1].amount : 0;
  }
  get latestMonth(): string {
    return this.rawFeeTrend.length ? this.rawFeeTrend[this.rawFeeTrend.length - 1].month : '';
  }
  get attendanceCardStyle(): string {
    const r = this.avgAttendance;
    if (r >= 85) return '--c1:#059669;--c2:#34d399';
    if (r >= 70) return '--c1:#d97706;--c2:#fbbf24';
    return '--c1:#dc2626;--c2:#f87171';
  }

  // ── Attendance trend (line) ───────────────────────────────────
  classList: string[] = [];
  selectedTrendClass = '';
  trendMode: 'weekly' | 'monthly' = 'monthly';
  isTrendLoading = false;
  attendanceTrendData: ChartData<'line'> = { labels: [], datasets: [] };
  attendanceTrendOptions: ChartConfiguration<'line'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: ctx => `${Number(ctx.parsed.y).toFixed(1)}%` } }
    },
    scales: {
      y: {
        beginAtZero: false,
        min: 0,
        max: 100,
        grid: { color: 'rgba(0,0,0,0.04)' },
        ticks: { callback: val => `${val}%` }
      },
      x: { grid: { display: false }, ticks: { maxRotation: 45, minRotation: 30 } }
    },
    elements: { line: { tension: 0.35 }, point: { radius: 4, hoverRadius: 6 } }
  };

  constructor(
    private analyticsService: DashboardAnalyticsService,
    private schoolService: SchoolService,
    private cdr: ChangeDetectorRef,
    private logger: LoggerService,
    private authState: AuthStateService,
  ) {}

  /** Fee collection analytics belong to Fee Management: not requested or shown without it. */
  get feeAnalyticsEnabled(): boolean {
    return this.authState.hasFeature('FEE_MANAGEMENT');
  }

  ngOnInit(): void {
    this.schoolService.getClasses().pipe(takeUntil(this.destroy$)).subscribe({
      next: classes => {
        this.classList = classes;
        if (classes.length > 0) {
          this.selectedTrendClass = classes[0];
          this.loadAttendanceTrend();
        }
        this.cdr.markForCheck();
      }
    });
    this.loadAll();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadAll(): void {
    this.isLoading = true;
    forkJoin([
      this.feeAnalyticsEnabled ? this.analyticsService.getFeeTrend() : of<FeeTrend[]>([]),
      this.analyticsService.getClassStats(),
    ]).pipe(takeUntil(this.destroy$)).subscribe({
      next: ([feeTrend, classStats]) => {
        this.buildFeeTrend(feeTrend);
        this.buildAttendance(classStats);
        this.buildDistribution(classStats);
        this.hasData = (feeTrend?.length > 0 || classStats?.length > 0);
        if (!this.hasData) {
          this.analyticsError = 'No analytics data available yet. Create classes and record transactions to see insights.';
        } else {
          this.analyticsError = null;
        }
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: e => {
        this.logger.error('Analytics load error:', e);
        this.error = 'Failed to load analytics data. Please refresh.';
        this.analyticsError = 'Failed to load analytics data. Please try refreshing the page.';
        this.isLoading = false;
        this.cdr.markForCheck();
      }
    });
  }

  private buildFeeTrend(data: FeeTrend[]): void {
    // FeeTrendDto.amount is paise on the backend (DashboardService.getFeeTrend nets
    // Payment.amountPaid, itself paise) — convert once here so both the chart and
    // latestMonthFee below are correct without needing per-usage conversions.
    this.rawFeeTrend = data.map(d => ({ ...d, amount: d.amount / 100 }));
    this.feeTrendData = {
      labels: this.rawFeeTrend.map(d => d.month),
      datasets: [{
        data: this.rawFeeTrend.map(d => d.amount),
        backgroundColor: this.rawFeeTrend.map((_, i) =>
          `rgba(99,102,241,${0.4 + (i / Math.max(this.rawFeeTrend.length - 1, 1)) * 0.55})`),
        borderColor: '#6366f1',
        borderWidth: 2,
        borderRadius: 8,
        borderSkipped: false,
      }]
    };
  }

  private buildAttendance(data: ClassStats[]): void {
    this.rawClassStats = data;
    this.attendanceData = {
      labels: data.map(d => `Cl. ${d.className}`),
      datasets: [{
        data: data.map(d => d.attendanceRate),
        backgroundColor: data.map((_, i) => PALETTE[i % PALETTE.length] + 'bb'),
        borderColor: data.map((_, i) => PALETTE[i % PALETTE.length]),
        borderWidth: 2,
        borderRadius: 6,
        borderSkipped: false,
      }]
    };
  }

  loadAttendanceTrend(): void {
    if (!this.selectedTrendClass) return;
    this.isTrendLoading = true;
    this.cdr.markForCheck();
    this.analyticsService.getAttendanceTrend(this.selectedTrendClass, this.trendMode)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: data => {
          this.buildAttendanceTrend(data);
          this.isTrendLoading = false;
          this.cdr.markForCheck();
        },
        error: e => {
          this.logger.error('Attendance trend load error:', e);
          this.isTrendLoading = false;
          this.cdr.markForCheck();
        }
      });
  }

  onTrendClassChange(): void { this.loadAttendanceTrend(); }
  onTrendModeChange(mode: 'weekly' | 'monthly'): void {
    this.trendMode = mode;
    this.loadAttendanceTrend();
  }

  private buildAttendanceTrend(data: AttendanceTrend[]): void {
    const hasData = data.some(d => d.attendanceRate > 0);
    const color = '#059669';
    this.attendanceTrendData = {
      labels: data.map(d => d.period),
      datasets: [{
        data: data.map(d => d.attendanceRate),
        borderColor: color,
        backgroundColor: hasData ? 'rgba(5,150,105,0.10)' : 'transparent',
        fill: true,
        pointBackgroundColor: data.map(d =>
          d.attendanceRate >= 85 ? '#059669' : d.attendanceRate >= 70 ? '#d97706' : d.attendanceRate > 0 ? '#dc2626' : '#94a3b8'
        ),
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
      }]
    };
  }

  private buildDistribution(data: ClassStats[]): void {
    this.distributionData = {
      labels: data.map(d => `Class ${d.className}`),
      datasets: [{
        data: data.map(d => d.studentCount),
        backgroundColor: PALETTE.slice(0, data.length),
        borderWidth: 2,
        borderColor: '#fff',
        hoverOffset: 10,
      }]
    };
  }

}
