import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, of, Subject, switchMap, takeUntil } from 'rxjs';
import { AcademicSession } from '../../interfaces/academic-session';
import {
  FeeAssignmentRequest,
  FeeAssignmentRow,
  FeeAssignmentStatus,
  FeeAssignmentSummary,
  FeeConfigType,
  FeeDiscountHistoryRow,
  FeeGenerationBatchRow,
  FeeGenerationResult,
  FeeLifecycleHistory,
  FeeReadinessReport,
  FeeReconciliationRow,
  FeeReconciliationSummary,
  FeeUnresolvedMonth,
  FeeStudentPreview,
  FeeTransportHistoryRow,
  FeeWorkflowChangeResult,
} from '../../interfaces/fee-workflow';
import { FeeHead } from '../../interfaces/fee-head';
import { AcademicSessionService } from '../../services/academic-session.service';
import { FeeWorkflowService } from '../../services/fee-workflow.service';
import { FeeHeadService } from '../../services/fee-head.service';
import { ToastService } from '../../services/toast.service';
import { SchoolService } from '../../services/school.service';
import { summarizeFeeChange } from '../../utils/fee-change-outcome.util';
import { schoolDateKey } from '../../utils/school-date.util';

type FeeAssignmentTab = 'assign' | 'discounts' | 'history';

@Component({
  selector: 'app-fee-assignment',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './fee-assignment.component.html',
  styleUrls: ['./fee-assignment.component.css'],
})
export class FeeAssignmentComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private reload$ = new Subject<void>();

  schoolPolicy = 'Loading school policy…';
  schoolPolicyCode: string | null = null;
  /** True once the admin has picked an effective date themselves (the default is today). */
  effectiveDateChosen = false;
  activeTab: FeeAssignmentTab = 'assign';
  private historyTabLoaded = false;

  sessions: AcademicSession[] = [];
  session = '';
  classFilter = '';
  classes: string[] = [];
  statusFilter: FeeAssignmentStatus | '' = '';
  rows: FeeAssignmentRow[] = [];
  summary?: FeeAssignmentSummary;
  selected = new Set<string>();
  months = Array.from({ length: 12 }, (_, i) => i + 1);
  selectedMonths = new Set<number>();
  loading = true;
  working = false;
  previewRows: FeeStudentPreview[] = [];
  results: FeeGenerationResult[] = [];
  readiness?: FeeReadinessReport;

  // Tab 1 — Assign & Generate: fields scoped to this tab only.
  assignForm = { effectiveDate: this.today(), reason: '' };

  // Tab 2 — Discounts & Transport: each action gets its own state, never shared.
  feeHeads: FeeHead[] = [];
  history?: FeeLifecycleHistory;
  changeResult?: FeeWorkflowChangeResult;
  discountForm = {
    feeHeadId: null as number | null,
    configType: 'DISCOUNT_PERCENT' as FeeConfigType,
    value: null as number | null,
    validFrom: this.today(),
    validUntil: '',
    reason: '',
  };
  editDiscountForm = {
    id: null as number | null,
    configType: 'DISCOUNT_PERCENT' as FeeConfigType,
    value: null as number | null,
    validFrom: '',
    validUntil: '',
    reason: '',
  };
  endDiscountReason = '';
  transportForm = {
    enabled: false,
    distance: null as number | null,
    effectiveFrom: this.today(),
    reason: '',
  };
  editTransportForm = {
    id: null as number | null,
    enabled: false,
    distance: null as number | null,
    reason: '',
  };

  // Tab 3 — History & Reconciliation.
  generationBatches: FeeGenerationBatchRow[] = [];
  reconciliation?: FeeReconciliationSummary;
  showOnlyMissing = true;
  attentionPage = 1;
  historyPage = 1;
  readonly secondaryPageSize = 5;

  readonly statuses: FeeAssignmentStatus[] = [
    'NOT_ASSIGNED',
    'READY',
    'GENERATED',
    'PARTIALLY_GENERATED',
    'EXCLUDED',
    'GENERATION_FAILED',
  ];

  constructor(
    private workflow: FeeWorkflowService,
    private sessionsApi: AcademicSessionService,
    private feeHeadsApi: FeeHeadService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef,
    private schoolService: SchoolService,
  ) {}

  ngOnInit(): void {
    this.workflow.getSettings().pipe(takeUntil(this.destroy$)).subscribe({
      next: settings => {
        const labels = { FROM_EFFECTIVE_MONTH: 'Include the full effective month', NEXT_MONTH: 'Start next month', PRORATE_JOINING_MONTH: 'Prorate the effective month' };
        this.schoolPolicy = labels[settings.midSessionPolicy];
        this.schoolPolicyCode = settings.midSessionPolicy ?? null;
        this.cdr.markForCheck();
      },
      error: () => { this.schoolPolicy = 'School policy unavailable — review the generation preview'; this.cdr.markForCheck(); },
    });
    this.setupProgressiveReload();
    this.schoolService.getClasses().pipe(takeUntil(this.destroy$)).subscribe({
      next: (classes) => {
        this.classes = classes;
        this.cdr.detectChanges();
      },
      error: () => this.toast.warning('Classes unavailable', 'Unable to load the class filter.'),
    });
    this.feeHeadsApi
      .getActiveFeeHeads()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (feeHeads) => {
          this.feeHeads = feeHeads;
          this.cdr.detectChanges();
        },
        error: () =>
          this.toast.warning('Fee heads unavailable', 'Discount controls may be temporarily unavailable.'),
      });
    this.sessionsApi
      .getAllSessions()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (sessions) => {
          this.sessions = sessions;
          this.session = sessions.find((s) => s.current)?.label || sessions[0]?.label || '';
          this.selectRemainingMonths();
          this.reload();
          this.cdr.detectChanges();
        },
        error: () => {
          this.loading = false;
          this.toast.error('Unable to load', 'Academic sessions could not be loaded.');
        },
      });
  }

  private today(): string {
    return schoolDateKey(new Date());
  }

  private setupProgressiveReload(): void {
    this.reload$
      .pipe(
        switchMap(() =>
          this.workflow
            .getAssignments(this.session, this.classFilter || undefined, this.statusFilter || undefined)
            .pipe(catchError(() => of(null))),
        ),
        takeUntil(this.destroy$),
      )
      .subscribe((rows) => {
        this.loading = false;
        if (rows) this.rows = rows;
        else this.toast.error('Unable to load', 'Student fee assignments could not be loaded.');
        this.cdr.detectChanges();
      });
    this.reload$
      .pipe(
        switchMap(() => this.workflow.getSummary(this.session).pipe(catchError(() => of(null)))),
        takeUntil(this.destroy$),
      )
      .subscribe((summary) => {
        this.summary = summary || undefined;
        this.cdr.detectChanges();
      });
    this.reload$
      .pipe(
        switchMap(() => this.workflow.getReadiness(this.session).pipe(catchError(() => of(null)))),
        takeUntil(this.destroy$),
      )
      .subscribe((value) => {
        this.readiness = value || undefined;
        this.cdr.detectChanges();
      });
  }

  reload(): void {
    if (!this.session) {
      this.loading = false;
      return;
    }
    this.loading = true;
    this.attentionPage = 1;
    this.historyPage = 1;
    this.selected.clear();
    this.previewRows = [];
    this.reload$.next();
    if (this.historyTabLoaded) this.loadHistoryTab();
  }

  selectTab(tab: FeeAssignmentTab): void {
    this.activeTab = tab;
    if (tab === 'history' && !this.historyTabLoaded) this.loadHistoryTab();
  }

  loadHistoryTab(): void {
    if (!this.session) return;
    this.historyTabLoaded = true;
    this.workflow
      .getGenerationBatches(this.session)
      .pipe(catchError(() => of([])), takeUntil(this.destroy$))
      .subscribe((batches) => {
        this.generationBatches = batches;
        this.cdr.detectChanges();
      });
    this.workflow
      .getReconciliation(this.session)
      .pipe(catchError(() => of(null)), takeUntil(this.destroy$))
      .subscribe((value) => {
        this.reconciliation = value || undefined;
        this.cdr.detectChanges();
      });
  }

  toggleStudent(id: string): void {
    this.selected.has(id) ? this.selected.delete(id) : this.selected.add(id);
  }
  toggleAll(): void {
    this.selected.size === this.rows.length
      ? this.selected.clear()
      : this.rows.forEach((r) => this.selected.add(r.studentId));
  }
  toggleMonth(month: number): void {
    this.selectedMonths.has(month) ? this.selectedMonths.delete(month) : this.selectedMonths.add(month);
  }
  onEffectiveDateChange(value: string): void {
    this.assignForm.effectiveDate = value;
    this.effectiveDateChosen = true;
  }

  /** What the school policy does to the month the effective date falls in (display only). */
  effectiveMonthConsequence(month: number): string {
    const label = this.monthLabel(month, true);
    switch (this.schoolPolicyCode) {
      case 'NEXT_MONTH': return `${label} will not be charged; billing starts from the following month.`;
      case 'FROM_EFFECTIVE_MONTH': return `${label} will be charged in full.`;
      case 'PRORATE_JOINING_MONTH': return `${label} will be charged only for the remaining days.`;
      default: return 'Check the preview to see how this month is charged.';
    }
  }

  conflictMonth(): number | null {
    if (!this.assignForm.effectiveDate) return null;
    const effective = new Date(`${this.assignForm.effectiveDate}T00:00:00`);
    if (effective.getDate() === 1) return null;
    const selectedSession = this.sessions.find((value) => value.label === this.session);
    if (!selectedSession?.startDate) return null;
    const start = new Date(`${selectedSession.startDate}T00:00:00`);
    const month =
      (effective.getFullYear() - start.getFullYear()) * 12 + effective.getMonth() - start.getMonth() + 1;
    return month >= 1 && month <= 12 && this.selectedMonths.has(month) ? month : null;
  }
  monthLabel(month: number, includeYear = false): string {
    const selectedSession = this.sessions.find((value) => value.label === this.session);
    if (!selectedSession?.startDate || month < 1 || month > 12) return `Month ${month}`;
    const [year, calendarMonth] = selectedSession.startDate.split('-').map(Number);
    if (!year || !calendarMonth) return `Month ${month}`;
    const date = new Date(Date.UTC(year, calendarMonth + month - 2, 1));
    return new Intl.DateTimeFormat('en-IN', {
      month: 'short',
      year: includeYear ? 'numeric' : undefined,
      timeZone: 'UTC',
    }).format(date);
  }
  formatAcademicMonths(months: number[]): string {
    return months.length ? months.map((month) => this.monthLabel(month, true)).join(', ') : '—';
  }
  sessionMonthHint(): string {
    const firstMonth = this.monthLabel(1, true);
    return firstMonth.startsWith('Month ') ? '' : `Month 1 begins in ${firstMonth} for ${this.session}.`;
  }
  selectRemainingMonths(): void {
    const selectedSession = this.sessions.find((value) => value.label === this.session);
    const startMonth = selectedSession ? new Date(`${selectedSession.startDate}T00:00:00`).getMonth() + 1 : 4;
    const now = new Date();
    const academic = ((now.getMonth() + 1 - startMonth + 12) % 12) + 1;
    this.selectedMonths = new Set(this.months.filter((m) => m >= academic));
  }

  private request(): FeeAssignmentRequest | null {
    if (!this.selected.size || !this.selectedMonths.size || !this.assignForm.effectiveDate) {
      this.toast.warning('Selection required', 'Select students, months and an effective date.');
      return null;
    }
    return {
      studentIds: [...this.selected],
      academicSession: this.session,
      effectiveDate: this.assignForm.effectiveDate,
      months: [...this.selectedMonths].sort((a, b) => a - b),
      reason: this.assignForm.reason,

    };
  }

  exclude(): void {
    const req = this.request();
    if (!req || !this.assignForm.reason.trim()) {
      this.toast.warning('Reason required', 'Enter a reason before excluding students.');
      return;
    }
    this.run(() => this.workflow.exclude(req), 'Students excluded from fees.');
  }

  preview(): void {
    const req = this.request();
    if (!req) return;
    this.working = true;
    this.workflow
      .preview(req)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (x) => {
          this.previewRows = x;
          this.stopWorking();
        },
        error: (e) => {
          this.stopWorking();
          this.toast.error('Preview failed', e.error?.error || 'Unable to calculate fees.');
        },
      });
  }

  suggestEligibleMonths(): void {
    if (!this.selected.size || !this.assignForm.effectiveDate) {
      this.toast.warning('Selection required', 'Select students and an effective date first.');
      return;
    }
    const request: FeeAssignmentRequest = {
      studentIds: [...this.selected],
      academicSession: this.session,
      effectiveDate: this.assignForm.effectiveDate,
      months: [...this.months],
      reason: this.assignForm.reason,
    };
    this.working = true;
    this.workflow
      .preview(request)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (rows) => {
          this.previewRows = rows;
          this.selectedMonths = new Set(
            rows.flatMap((row) => row.months).filter((month) => month.eligible && !month.existing).map((month) => month.month),
          );
          this.stopWorking();
          this.toast.info(
            'Eligible months suggested',
            `${this.selectedMonths.size} academic month(s) selected using the school policy and student joining dates.`,
          );
        },
        error: (e) => {
          this.stopWorking();
          this.toast.error('Suggestion failed', e.error?.error || 'Unable to determine eligible months.');
        },
      });
  }

  async generate(): Promise<void> {
    const req = this.request();
    if (!req) return;
    const ok = await this.toast.confirm({
      title: 'Generate fee charges?',
      message: `Create ${req.months.length} month(s) for ${req.studentIds.length} selected student(s)? Existing months will be skipped.`,
      icon: 'warning',
      confirmText: 'Generate',
      cancelText: 'Cancel',
    });
    if (!ok) return;
    this.working = true;
    this.workflow
      .assign(req)
      .pipe(switchMap(() => this.workflow.generate(req)))
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (x) => {
          this.results = x;
          this.stopWorking();
          this.toast.success(
            'Generation completed',
            `${x.filter((r) => r.successful).length} student(s) processed successfully.`,
          );
          this.reload();
        },
        error: (e) => {
          this.stopWorking();
          this.toast.error('Generation failed', e.error?.error || 'No charges were generated.');
        },
      });
  }

  async retryBatch(batch: FeeGenerationBatchRow): Promise<void> {
    if (!batch.failedStudents) return;
    const ok = await this.toast.confirm({
      title: 'Retry failed students?',
      message: `Retry ${batch.failedStudents} failed student(s) from batch #${batch.id}. Already-generated months will be skipped safely.`,
      icon: 'warning',
      confirmText: 'Retry failed',
      cancelText: 'Cancel',
    });
    if (!ok) return;
    this.working = true;
    this.workflow
      .retryGenerationBatch(batch.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (value) => {
          this.results = value;
          this.stopWorking();
          this.toast.success(
            'Retry completed',
            `${value.filter((row) => row.successful).length} student(s) processed successfully.`,
          );
          this.loadHistoryTab();
        },
        error: (e) => {
          this.stopWorking();
          this.toast.error('Retry failed', e.error?.error || 'Unable to retry this batch.');
        },
      });
  }

  /** Every unresolved month in the session, one entry per student-month, for the review list. */
  unresolvedMonthEntries(): { row: FeeReconciliationRow; month: FeeUnresolvedMonth }[] {
    return (this.reconciliation?.students || []).flatMap((row) =>
      (row.unresolvedMonths || []).map((month) => ({ row, month })));
  }
  trackByUnresolved(index: number, entry: { row: FeeReconciliationRow; month: FeeUnresolvedMonth }): string {
    return `${entry.row.studentId}:${entry.month.month}`;
  }

  visibleReconciliationRows() {
    const rows = this.reconciliation?.students || [];
    return this.showOnlyMissing
      ? rows.filter((row) => row.missingMonths.length || row.status === 'GENERATION_FAILED'
          || (row.unresolvedMonths?.length ?? 0) > 0)
      : rows;
  }
  pagedReconciliationRows() {
    const start = (this.attentionPage - 1) * this.secondaryPageSize;
    return this.visibleReconciliationRows().slice(start, start + this.secondaryPageSize);
  }
  get attentionPageCount(): number {
    return Math.max(1, Math.ceil(this.visibleReconciliationRows().length / this.secondaryPageSize));
  }
  pagedGenerationBatches(): FeeGenerationBatchRow[] {
    const start = (this.historyPage - 1) * this.secondaryPageSize;
    return this.generationBatches.slice(start, start + this.secondaryPageSize);
  }
  get historyPageCount(): number {
    return Math.max(1, Math.ceil(this.generationBatches.length / this.secondaryPageSize));
  }
  setAttentionPage(page: number): void {
    this.attentionPage = Math.min(Math.max(page, 1), this.attentionPageCount);
  }
  setHistoryPage(page: number): void {
    this.historyPage = Math.min(Math.max(page, 1), this.historyPageCount);
  }
  hasReconciliationIssues(): boolean {
    return this.visibleReconciliationRows().length > 0;
  }
  blockingReadinessIssues() {
    return (this.readiness?.issues || []).filter((issue) => issue.severity === 'BLOCKER');
  }
  statusLabel(status: FeeAssignmentStatus): string {
    switch (status) {
      case 'NOT_ASSIGNED':
        return 'Not assigned';
      case 'READY':
        return 'Ready to generate';
      case 'PARTIALLY_GENERATED':
        return 'Partially generated';
      case 'GENERATION_FAILED':
        return 'Needs attention';
      case 'GENERATED':
        return 'Generated';
      case 'EXCLUDED':
        return 'Excluded';
    }
  }

  updateTransport(): void {
    if (!this.transportForm.reason.trim()) {
      this.toast.warning('Reason required', 'Enter a reason for the transport change.');
      return;
    }
    if (this.transportForm.enabled && (!this.transportForm.distance || this.transportForm.distance <= 0)) {
      this.toast.warning('Distance required', 'Enter a positive transport distance.');
      return;
    }
    if (!this.selected.size) {
      this.toast.warning('Selection required', 'Select students in the Assign & Generate tab first.');
      return;
    }
    this.runChange(
      () =>
        this.workflow.changeTransport({
          studentIds: [...this.selected],
          academicSession: this.session,
          enabled: this.transportForm.enabled,
          distance: this.transportForm.enabled ? this.transportForm.distance : null,
          effectiveFrom: this.transportForm.effectiveFrom,
          reason: this.transportForm.reason,
        }),
      'Transport assignment updated.',
    );
  }

  editTransport(row: FeeTransportHistoryRow): void {
    this.editTransportForm = {
      id: row.id,
      enabled: row.enabled,
      distance: row.distance ?? null,
      reason: '',
    };
  }
  cancelEditTransport(): void {
    this.editTransportForm = { id: null, enabled: false, distance: null, reason: '' };
  }
  saveTransportCorrection(): void {
    if (this.editTransportForm.id === null) return;
    if (!this.editTransportForm.reason.trim()) {
      this.toast.warning('Reason required', 'Enter a reason for the correction.');
      return;
    }
    if (this.editTransportForm.enabled && (!this.editTransportForm.distance || this.editTransportForm.distance <= 0)) {
      this.toast.warning('Distance required', 'Enter a positive transport distance.');
      return;
    }
    this.working = true;
    this.workflow
      .correctFutureTransport(
        this.editTransportForm.id,
        this.editTransportForm.enabled,
        this.editTransportForm.enabled ? this.editTransportForm.distance : null,
        this.editTransportForm.reason,
      )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.stopWorking();
          this.cancelEditTransport();
          this.toast.success('Future transport corrected');
          this.loadHistoryForSelected();
        },
        error: (e) => {
          this.stopWorking();
          this.toast.error('Correction failed', e.error?.error || 'Unable to correct transport.');
        },
      });
  }

  createDiscount(): void {
    const selectedSession = this.sessions.find((value) => value.label === this.session);
    if (!this.selected.size || !selectedSession || !this.discountForm.feeHeadId || !this.selectedMonths.size) {
      this.toast.warning(
        'Discount details required',
        'Select students and months in the Assign & Generate tab, then a fee head and start date here.',
      );
      return;
    }
    const needsValue =
      this.discountForm.configType === 'DISCOUNT_PERCENT' ||
      this.discountForm.configType === 'DISCOUNT_FIXED' ||
      this.discountForm.configType === 'CUSTOM_AMOUNT';
    if (needsValue && (this.discountForm.value === null || this.discountForm.value < 0)) {
      this.toast.warning('Value required', 'Enter a valid discount or custom amount.');
      return;
    }
    const storedValue =
      needsValue && this.discountForm.value !== null
        ? this.discountForm.configType === 'DISCOUNT_PERCENT'
          ? this.discountForm.value
          : Math.round(this.discountForm.value * 100)
        : null;
    this.runChange(
      () =>
        this.workflow.applyBulkDiscount({
          studentIds: [...this.selected],
          academicSessionId: selectedSession.id,
          feeHeadId: this.discountForm.feeHeadId!,
          configType: this.discountForm.configType,
          value: storedValue,
          validFrom: this.discountForm.validFrom,
          validUntil: this.discountForm.validUntil || undefined,
          months: [...this.selectedMonths].sort((a, b) => a - b),
          reason: this.discountForm.reason,
        }),
      'Discount configuration applied.',
    );
  }

  editDiscount(row: FeeDiscountHistoryRow): void {
    this.editDiscountForm = {
      id: row.id,
      configType: row.configType,
      value: row.value == null ? null : row.configType === 'DISCOUNT_PERCENT' ? row.value : row.value / 100,
      validFrom: row.validFrom,
      validUntil: row.validUntil || '',
      reason: '',
    };
  }
  cancelEditDiscount(): void {
    this.editDiscountForm = {
      id: null,
      configType: 'DISCOUNT_PERCENT',
      value: null,
      validFrom: '',
      validUntil: '',
      reason: '',
    };
  }
  saveDiscountEdit(): void {
    if (this.editDiscountForm.id === null) return;
    const needsValue =
      this.editDiscountForm.configType === 'DISCOUNT_PERCENT' ||
      this.editDiscountForm.configType === 'DISCOUNT_FIXED' ||
      this.editDiscountForm.configType === 'CUSTOM_AMOUNT';
    if (needsValue && (this.editDiscountForm.value === null || this.editDiscountForm.value < 0)) {
      this.toast.warning('Value required', 'Enter a valid discount or custom amount.');
      return;
    }
    if (!this.editDiscountForm.reason.trim()) {
      this.toast.warning('Reason required', 'Enter a reason for this correction.');
      return;
    }
    const storedValue =
      needsValue && this.editDiscountForm.value !== null
        ? this.editDiscountForm.configType === 'DISCOUNT_PERCENT'
          ? this.editDiscountForm.value
          : Math.round(this.editDiscountForm.value * 100)
        : null;
    this.working = true;
    this.workflow
      .updateFutureDiscount(this.editDiscountForm.id, {
        configType: this.editDiscountForm.configType,
        value: storedValue,
        validFrom: this.editDiscountForm.validFrom,
        validUntil: this.editDiscountForm.validUntil || undefined,
        reason: this.editDiscountForm.reason,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.stopWorking();
          this.cancelEditDiscount();
          this.toast.success('Future discount updated');
          this.loadHistoryForSelected();
        },
        error: (e) => {
          this.stopWorking();
          this.toast.error('Update failed', e.error?.error || 'Unable to update discount.');
        },
      });
  }

  async endDiscount(row: FeeDiscountHistoryRow): Promise<void> {
    const future = this.isFuture(row.validFrom);
    const ok = await this.toast.confirm({
      title: future ? 'End this future discount?' : 'End this discount?',
      message: future
        ? 'The record will remain in audit history but will never become active.'
        : `${row.feeHeadName}: ${this.discountValueText(row)} will be removed across its full valid range. Eligible unpaid fee records will be recalculated; paid and protected records remain unchanged.`,
      icon: 'warning',
      confirmText: 'End discount',
      cancelText: 'Cancel',
    });
    if (!ok) return;
    this.runChange(
      () => this.workflow.endDiscount(row.id, this.endDiscountReason),
      'Discount ended.',
    );
  }

  loadHistoryForSelected(): void {
    if (this.selected.size !== 1) {
      this.toast.warning('Select one student', 'History is available for one selected student at a time, in the Assign & Generate tab.');
      return;
    }
    this.working = true;
    this.workflow
      .getHistory([...this.selected][0], this.session)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (value) => {
          this.history = value;
          this.stopWorking();
        },
        error: (e) => {
          this.stopWorking();
          this.toast.error('History unavailable', e.error?.error || 'Unable to load fee history.');
        },
      });
  }

  isFuture(date?: string): boolean {
    return !!date && date > this.today();
  }
  discountValueText(row: FeeDiscountHistoryRow): string {
    if (row.configType === 'WAIVER') return 'Full waiver';
    if (row.configType === 'OPT_OUT') return 'Opt out';
    if (row.value == null) return '—';
    return row.configType === 'DISCOUNT_PERCENT' ? `${row.value}%` : `₹${(row.value / 100).toFixed(2)}`;
  }

  private runChange(action: () => import('rxjs').Observable<FeeWorkflowChangeResult>, message: string): void {
    this.working = true;
    this.changeResult = undefined;
    action()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.stopWorking();
          this.changeResult = result;
          const outcome = summarizeFeeChange(result, message);
          this.toast[outcome.level](outcome.title, outcome.message);
          if (this.history && this.selected.size === 1) this.loadHistoryForSelected();
        },
        error: (e) => {
          this.stopWorking();
          this.toast.error('Action failed', e.error?.error || 'Please review the selection.');
        },
      });
  }
  private stopWorking(): void {
    this.working = false;
    this.cdr.detectChanges();
  }
  private run(action: () => any, message: string): void {
    this.working = true;
    action()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.stopWorking();
          this.toast.success('Completed', message);
          this.reload();
        },
        error: (e: any) => {
          this.stopWorking();
          this.toast.error('Action failed', e.error?.error || 'Please review the selection.');
        },
      });
  }
  trackByStudent(_: number, row: FeeAssignmentRow): string {
    return row.studentId;
  }
  ngOnDestroy(): void {
    this.reload$.complete();
    this.destroy$.next();
    this.destroy$.complete();
  }
}
