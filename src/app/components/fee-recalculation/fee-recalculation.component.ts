import { AcademicSessionService } from '../../services/academic-session.service';
import { AcademicSession } from '../../interfaces/academic-session';
import { feeMonthLabel } from '../../utils/fee-session.util';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, take, takeUntil } from 'rxjs';
import { ActivatedRoute } from '@angular/router';
import { FeesService } from '../../services/fees.service';
import { SchoolService } from '../../services/school.service';
import { FeesCalculationService } from '../../services/fees-calculation.service';
import { ToastService } from '../../services/toast.service';
import { LoggerService } from '../../services/logger.service';
import { RecalculationEntry } from '../../interfaces/recalculation';

interface MonthOption {
  month: number;
  name: string;
  selectedForPreview: boolean;
}

interface PreviewRow extends RecalculationEntry {
  monthName: string;
  includeInApply: boolean;
}

@Component({
  selector: 'app-fee-recalculation',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './fee-recalculation.component.html',
  styleUrl: './fee-recalculation.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeeRecalculationComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private request$ = new Subject<void>();
  sessions: AcademicSession[] = [];

  studentId = '';
  session = '';
  monthOptions: MonthOption[] = [];

  loadingPreview = false;
  previewRows: PreviewRow[] = [];
  previewRequested = false;

  reason = '';
  applying = false;
  applyResults: PreviewRow[] | null = null;

  constructor(
    private feesService: FeesService,
    private schoolService: SchoolService,
    private feesCalc: FeesCalculationService,
    private sessionsApi: AcademicSessionService,
    private toast: ToastService,
    private logger: LoggerService,
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    // Opened from Fee Assignment → History & Reconciliation for one unresolved month: prefill the
    // student, session and month(s). Nothing runs until the admin previews and applies.
    const params = this.route.snapshot.queryParamMap;
    this.studentId = params.get('studentId') ?? this.studentId;
    this.session = params.get('session') ?? this.session;
    const prefillMonths = (params.get('months') ?? '').split(',').map(Number)
      .filter(m => Number.isInteger(m) && m >= 1 && m <= 12);
    const prefill = () => {
      this.onSessionChange();
      if (prefillMonths.length) {
        this.monthOptions.forEach(m => m.selectedForPreview = prefillMonths.includes(m.month));
        this.cdr.markForCheck();
      }
    };
    this.sessionsApi.getAllSessions().pipe(take(1), takeUntil(this.destroy$)).subscribe({
      next: sessions => { this.sessions = sessions; prefill(); },
      error: e => { this.logger.error('Session dates unavailable', e); prefill(); },
    });
  }

  onSessionChange(): void {
    this.request$.next();
    this.previewRows = [];
    this.applyResults = null;
    this.previewRequested = false;
    this.loadingPreview = false;
    this.monthOptions = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1, name: this.monthLabel(i + 1), selectedForPreview: false,
    }));
    this.cdr.markForCheck();
  }

  private monthLabel(month: number): string {
    return feeMonthLabel(this.sessions.find(s => s.label === this.session)?.startDate, month);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get selectedMonthsForPreview(): number[] {
    return this.monthOptions.filter(m => m.selectedForPreview).map(m => m.month);
  }

  get eligibleSelectedCount(): number {
    return this.previewRows.filter(r => r.ok && r.includeInApply).length;
  }

  runPreview(): void {
    if (!this.studentId.trim() || !this.session.trim()) {
      this.toast.warning('Missing information', 'Enter a student ID and session first.');
      return;
    }
    const months = this.selectedMonthsForPreview;
    if (months.length === 0) {
      this.toast.warning('No months selected', 'Select at least one month to preview.');
      return;
    }

    this.loadingPreview = true;
    this.previewRows = [];
    this.applyResults = null;
    this.cdr.markForCheck();

    this.feesService.previewRecalculation(this.studentId.trim(), this.session.trim(), months)
      .pipe(takeUntil(this.request$), takeUntil(this.destroy$))
      .subscribe({
        next: (entries) => {
          this.previewRows = entries.map(e => this.toPreviewRow(e));
          this.previewRequested = true;
          this.loadingPreview = false;
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.logger.error('Error fetching recalculation preview:', err);
          this.toast.error('Preview failed', 'Could not compute a recalculation preview. Please try again.');
          this.loadingPreview = false;
          this.cdr.markForCheck();
        },
      });
  }

  private toPreviewRow(e: RecalculationEntry): PreviewRow {
    return { ...e, monthName: this.monthLabel(e.month), includeInApply: e.ok };
  }

  toggleIncludeInApply(row: PreviewRow): void {
    if (!row.ok) return;
    row.includeInApply = !row.includeInApply;
  }

  async confirmAndApply(): Promise<void> {
    const monthsToApply = this.previewRows.filter(r => r.ok && r.includeInApply).map(r => r.month);
    if (monthsToApply.length === 0) {
      this.toast.warning('Nothing to apply', 'Select at least one eligible month first.');
      return;
    }
    if (!this.reason.trim()) {
      this.toast.warning('Reason required', 'A reason is required to apply a recalculation.');
      return;
    }

    const confirmed = await this.toast.confirm({
      title: 'Apply fee recalculation?',
      message: `This will recompute and permanently change the bill for ${monthsToApply.length} month(s) for student ${this.studentId}. This does not affect any payment or refund already recorded — only unpaid, unallocated months are eligible.`,
      confirmText: 'Recalculate',
      cancelText: 'Cancel',
      icon: 'warning',
    });
    if (!confirmed) return;

    this.applying = true;
    this.cdr.markForCheck();

    this.feesService.applyRecalculation(this.studentId.trim(), this.session.trim(), monthsToApply, this.reason.trim())
      .pipe(takeUntil(this.request$), takeUntil(this.destroy$))
      .subscribe({
        next: (entries) => {
          this.applyResults = entries.map(e => this.toPreviewRow(e));
          this.applying = false;
          const succeeded = entries.filter(e => e.ok).length;
          const failed = entries.length - succeeded;
          if (failed === 0) {
            this.toast.success('Recalculation applied', `${succeeded} month(s) recalculated successfully.`);
          } else {
            this.toast.warning('Recalculation partially applied', `${succeeded} succeeded, ${failed} rejected — see details below.`);
          }
          this.previewRequested = false;
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.logger.error('Error applying recalculation:', err);
          this.toast.error('Apply failed', 'Could not apply the recalculation. Please try again.');
          this.applying = false;
          this.cdr.markForCheck();
        },
      });
  }
}
