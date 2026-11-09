import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { forkJoin, Subject, takeUntil } from 'rxjs';
import {
  FeeGenerationService, FeeGenerationStudentPreviewRow, FeeGenerationDecision,
  FeeGenerationRequest, FeeGenerationStudentResult, TargetFeeDriftRow, TargetFeeDriftStatus
} from '../../services/fee-generation.service';
import { AcademicSessionService } from '../../services/academic-session.service';
import { AcademicSession } from '../../interfaces/academic-session';
import { SchoolService, SchoolClass } from '../../services/school.service';
import { LoggerService } from '../../services/logger.service';
import { ToastService } from '../../services/toast.service';
import { feeMonthLabel } from '../../utils/fee-session.util';

@Component({
  selector: 'app-fee-generation-target',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './fee-generation-target.component.html',
  styleUrl: './fee-generation-target.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeeGenerationTargetComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  // ── Sessions ──────────────────────────────────────────────────────────
  sessionsLoading = true;
  sessions: AcademicSession[] = [];
  targetSessionId: number | null = null;

  // ── Filters ───────────────────────────────────────────────────────────
  classes: SchoolClass[] = [];
  classFilter: number | null = null;
  studentIdFilter = '';

  // ── Preview ───────────────────────────────────────────────────────────
  previewLoading = false;
  preview: FeeGenerationStudentPreviewRow[] = [];
  /** The exact session/filter combination the currently-loaded preview was fetched with —
   *  compared against the live selectors so any change is caught before generate. */
  private previewedTargetSessionId: number | null = null;
  private previewedClassFilter: number | null = null;
  private previewedStudentIdFilter = '';

  // ── Selection ─────────────────────────────────────────────────────────
  selected = new Set<string>();

  // ── Generate / results ────────────────────────────────────────────────
  executing = false;
  /** True while the confirmation dialog is open — a second click never opens a second one. */
  private confirming = false;
  results: FeeGenerationStudentResult[] | null = null;

  // ── E5C read-only drift review ──
  driftOpen = false;
  driftLoading = false;
  driftRows: TargetFeeDriftRow[] = [];
  driftStatusFilter: TargetFeeDriftStatus | '' = '';
  readonly driftStatuses: TargetFeeDriftStatus[] = [
    'CLEAN', 'PARTIAL_GENERATION', 'CLASS_MISMATCH',
    'CANCELLED_TARGET_WITH_FEES', 'NO_TARGET_ENROLLMENT'
  ];

  constructor(
    private feeGenerationService: FeeGenerationService,
    private academicSessionService: AcademicSessionService,
    private schoolService: SchoolService,
    private route: ActivatedRoute,
    private logger: LoggerService,
    private cdr: ChangeDetectorRef,
    private toast: ToastService,
  ) {}

  ngOnInit(): void {
    this.loadSessionsAndClasses();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  toggleDriftReview(): void {
    this.driftOpen = !this.driftOpen;
    if (this.driftOpen && this.driftRows.length === 0) this.loadDrift();
    this.cdr.markForCheck();
  }

  loadDrift(): void {
    if (this.targetSessionId == null) {
      this.toast.warning('Select target session', 'Choose a target session before reviewing mismatches.');
      return;
    }
    this.driftLoading = true;
    const studentId = this.studentIdFilter.trim() || null;
    this.feeGenerationService.getTargetDrift(this.targetSessionId, this.classFilter, studentId)
      .pipe(takeUntil(this.destroy$)).subscribe({
        next: rows => {
          this.driftRows = rows;
          this.driftLoading = false;
          this.cdr.markForCheck();
        },
        error: e => {
          this.logger.error('Error loading target fee drift:', e);
          this.driftLoading = false;
          this.toast.error('Error', 'Failed to load fee and enrollment mismatches.');
          this.cdr.markForCheck();
        }
      });
  }

  get visibleDriftRows(): TargetFeeDriftRow[] {
    return this.driftStatusFilter
      ? this.driftRows.filter(row => row.driftStatus === this.driftStatusFilter)
      : this.driftRows;
  }

  driftLabel(status: TargetFeeDriftStatus): string {
    return status.split('_').map(value => value[0] + value.slice(1).toLowerCase()).join(' ');
  }

  driftLevel(status: TargetFeeDriftStatus): 'clean' | 'informational' | 'action-needed' {
    if (status === 'CLEAN') return 'clean';
    if (status === 'NO_TARGET_ENROLLMENT') return 'informational';
    return 'action-needed';
  }

  // ── Session + class loading ───────────────────────────────────────────

  private loadSessionsAndClasses(): void {
    this.sessionsLoading = true;
    this.cdr.markForCheck();
    forkJoin({
      sessions: this.academicSessionService.getAllSessions(),
      classes: this.schoolService.getManagedClasses(),
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: ({ sessions, classes }) => {
        this.sessions = sessions;
        this.classes = [...classes].sort((a, b) => a.displayOrder - b.displayOrder);
        this.applyInitialTargetSession();
        this.sessionsLoading = false;
        this.cdr.markForCheck();
      },
      error: (e) => {
        this.logger.error('Error loading academic sessions:', e);
        this.sessionsLoading = false;
        this.toast.error('Error', 'Failed to load academic sessions.');
        this.cdr.markForCheck();
      }
    });
  }

  /** Deep-linked from the year-end results screen ("Generate fees for {target session}") via a
   *  targetSessionId query param; otherwise defaults to whichever existing session starts the
   *  day the current session ends, same safe-default logic as the promotion screen — never
   *  creates a session, and the admin can always change the selection. */
  private applyInitialTargetSession(): void {
    const fromQuery = Number(this.route.snapshot.queryParamMap.get('targetSessionId'));
    if (fromQuery && this.sessions.some(s => s.id === fromQuery)) {
      this.targetSessionId = fromQuery;
      return;
    }
    const current = this.sessions.find(s => s.current) ?? null;
    if (!current) return;
    const nextDay = this.addDays(current.endDate, 1);
    const next = this.sessions.find(s => s.startDate === nextDay);
    this.targetSessionId = next ? next.id : null;
  }

  private addDays(isoDate: string, days: number): string {
    const d = new Date(isoDate + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  sessionLabel(id: number | null): string {
    if (id == null) return '';
    return this.sessions.find(s => s.id === id)?.label ?? '';
  }

  /** Label for the session the CURRENTLY LOADED preview belongs to (never the live, possibly-
   *  since-changed selector value) — used in messaging shown alongside preview rows and results. */
  get previewedTargetLabel(): string { return this.sessionLabel(this.previewedTargetSessionId); }

  // ── Selector change handlers — any change invalidates the loaded preview ────

  onTargetSessionChange(): void { this.invalidatePreview(); }
  onClassFilterChange(): void { this.invalidatePreview(); }
  onStudentIdFilterChange(): void { this.invalidatePreview(); }

  private invalidatePreview(): void {
    if (this.preview.length === 0 && !this.results) return;
    this.preview = [];
    this.results = null;
    this.selected.clear();
    this.cdr.markForCheck();
  }

  /** True once the live selectors/filters have drifted from what the loaded preview reflects —
   *  generate must never fire against a preview that no longer matches the screen. */
  get previewIsStale(): boolean {
    if (this.previewedTargetSessionId == null) return true;
    return this.previewedTargetSessionId !== this.targetSessionId
      || this.previewedClassFilter !== this.classFilter
      || this.previewedStudentIdFilter !== this.studentIdFilter.trim();
  }

  // ── Preview loading ────────────────────────────────────────────────────

  loadPreview(): void {
    if (this.targetSessionId == null) return;
    this.previewLoading = true;
    this.cdr.markForCheck();

    const target = this.targetSessionId;
    const classFilter = this.classFilter;
    const studentIdFilter = this.studentIdFilter.trim();

    this.feeGenerationService.getTargetPreview(target, classFilter, studentIdFilter || null)
      .pipe(takeUntil(this.destroy$)).subscribe({
        next: (rows) => {
          this.preview = rows;
          this.previewedTargetSessionId = target;
          this.previewedClassFilter = classFilter;
          this.previewedStudentIdFilter = studentIdFilter;
          this.selected.clear();
          this.previewLoading = false;
          this.cdr.markForCheck();
        },
        error: (e) => {
          this.logger.error('Error loading fee generation preview:', e);
          this.previewLoading = false;
          this.toast.error('Error', 'Failed to load the fee generation preview.');
          this.cdr.markForCheck();
        }
      });
  }

  // ── Selection handling ─────────────────────────────────────────────────
  // Nothing is pre-selected: loading a preview must never leave the school one click away from
  // generating a whole session. Only a row with months to generate can be selected.

  isSelected(studentId: string): boolean { return this.selected.has(studentId); }

  canSelect(row: FeeGenerationStudentPreviewRow): boolean {
    return row.eligible && row.generatableMonths.length > 0;
  }

  /** Explicit admin action: every row that has months to generate. */
  selectAllGeneratable(): void {
    for (const r of this.preview) if (this.canSelect(r)) this.selected.add(r.studentId);
    this.cdr.markForCheck();
  }

  clearSelection(): void {
    this.selected.clear();
    this.cdr.markForCheck();
  }

  toggleSelected(row: FeeGenerationStudentPreviewRow): void {
    if (!this.canSelect(row)) return;
    if (this.selected.has(row.studentId)) this.selected.delete(row.studentId);
    else this.selected.add(row.studentId);
    this.cdr.markForCheck();
  }

  get selectedRows(): FeeGenerationStudentPreviewRow[] {
    return this.preview.filter(r => this.selected.has(r.studentId));
  }

  get eligibleCount(): number { return this.preview.filter(r => r.eligible).length; }
  get blockedCount(): number { return this.preview.filter(r => !r.eligible).length; }
  get generatableCount(): number { return this.preview.filter(r => this.canSelect(r)).length; }
  get nothingToGenerateCount(): number { return this.preview.filter(r => r.eligible && r.generatableMonths.length === 0).length; }
  get selectedMonthCount(): number { return this.selectedRows.reduce((sum, r) => sum + r.generatableMonths.length, 0); }

  monthLabel(month: number): string {
    const start = this.sessions.find(s => s.id === this.previewedTargetSessionId)?.startDate;
    return feeMonthLabel(start, month);
  }

  /** "December 2026 – March 2027 (4 months)" for a contiguous scope; otherwise every month is listed. */
  generatableScope(row: FeeGenerationStudentPreviewRow): string {
    const months = row.generatableMonths;
    if (!months.length) return 'nothing to generate';
    if (months.length === 1) return this.monthLabel(months[0]);
    const contiguous = months.every((m, i) => i === 0 || m === months[i - 1] + 1);
    return contiguous
      ? `${this.monthLabel(months[0])} – ${this.monthLabel(months[months.length - 1])} (${months.length} months)`
      : `${months.map(m => this.monthLabel(m)).join(', ')} (${months.length} months)`;
  }

  /** Skipped (not generated, not chargeable) months grouped by their reason. */
  skippedReasons(row: FeeGenerationStudentPreviewRow): { reason: string; months: string }[] {
    const byReason = new Map<string, number[]>();
    for (const m of row.months) {
      if (m.alreadyGenerated || m.willGenerate) continue;
      const reason = m.message || 'Not chargeable';
      byReason.set(reason, [...(byReason.get(reason) ?? []), m.month]);
    }
    return [...byReason.entries()].map(([reason, months]) => ({ reason, months: months.map(m => `M${m}`).join(', ') }));
  }

  get canGenerate(): boolean {
    return this.preview.length > 0 && !this.previewIsStale && !this.executing && this.selectedRows.length > 0;
  }

  // ── Confirmation + generate ────────────────────────────────────────────

  async confirmAndGenerate(): Promise<void> {
    if (!this.canGenerate || this.confirming) return;
    const count = this.selectedRows.length;
    const targetLabel = this.previewedTargetLabel;
    const totalDue = this.selectedRows.reduce((sum, r) => sum + (r.totalDue || 0), 0);
    const scope = this.selectedRows
      .map(r => `<li>${this.escape(r.studentName || r.studentId)}: ${this.generatableScope(r)}</li>`).join('');

    this.confirming = true;
    let confirmed = false;
    try {
      confirmed = await this.toast.confirm({
        title: 'Confirm Fee Generation',
        html: `
          <p style="margin-bottom:12px;color:#374151;">
            This creates <strong>${this.selectedMonthCount}</strong> month(s) of fees for <strong>${count}</strong> student(s)
            in <strong>${targetLabel}</strong>, totalling approximately <strong>₹${totalDue.toFixed(2)}</strong>.
          </p>
          <ul style="margin:0 0 12px 18px;color:#374151;">${scope}</ul>
          <p style="margin-top:14px;font-size:0.85rem;color:#334155;">
            Already-generated months are skipped automatically and never changed, and months before a
            student's joining, fee-assignment or fee-rule start date are never charged — only the
            months listed above are created. If a student's target class or enrollment has changed since this
            preview was loaded, that student is skipped with a conflict instead of being generated
            against stale data.
          </p>
        `,
        icon: 'warning',
        confirmText: 'Yes, Generate Fees',
        cancelText: 'Cancel',
      });
    } finally {
      this.confirming = false;
    }
    if (confirmed) this.doGenerate();
  }

  private escape(value: string): string {
    return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
  }

  private doGenerate(): void {
    if (!this.canGenerate || this.previewedTargetSessionId == null) return;
    this.executing = true;
    this.cdr.markForCheck();

    const decisions: FeeGenerationDecision[] = this.selectedRows.map(r => ({
      studentId: r.studentId,
      expectedTargetEnrollmentId: r.targetEnrollmentId,
      expectedTargetClassId: r.targetClassId,
    }));
    const request: FeeGenerationRequest = { targetSessionId: this.previewedTargetSessionId, decisions };

    this.feeGenerationService.generateTargetFees(request).pipe(takeUntil(this.destroy$)).subscribe({
      next: (results) => {
        this.results = results;
        this.executing = false;
        this.cdr.markForCheck();
        // Reflect authoritative backend state — never assume the UI's own optimistic view.
        this.loadPreview();
      },
      error: (e) => {
        this.logger.error('Error generating fees:', e);
        this.executing = false;
        this.toast.error('Error', 'Fee generation failed. Please try again.');
        this.cdr.markForCheck();
      }
    });
  }

  // ── Result display helpers ────────────────────────────────────────────

  outcomeStudentName(result: FeeGenerationStudentResult): string {
    return this.preview.find(r => r.studentId === result.studentId)?.studentName ?? result.studentId;
  }

  isSuccessOutcome(outcome: string): boolean {
    return outcome === 'GENERATED' || outcome === 'PARTIALLY_GENERATED';
  }

  isInfoOutcome(outcome: string): boolean {
    return outcome === 'ALREADY_GENERATED' || outcome === 'NOT_ELIGIBLE';
  }

  /** Months created / skipped across the whole last run. */
  get resultTotals(): { created: number; skipped: number } {
    return (this.results ?? []).reduce((t, r) => ({ created: t.created + r.generatedMonths, skipped: t.skipped + r.skippedMonths }),
      { created: 0, skipped: 0 });
  }

  summaryEntries(): { code: string; count: number }[] {
    if (!this.results) return [];
    const counts = new Map<string, number>();
    for (const r of this.results) counts.set(r.outcome, (counts.get(r.outcome) ?? 0) + 1);
    return [...counts.entries()].map(([code, count]) => ({ code, count }));
  }

  dismissResults(): void {
    this.results = null;
    this.cdr.markForCheck();
  }

  // ── trackBy ────────────────────────────────────────────────────────────
  trackByRow(_: number, r: FeeGenerationStudentPreviewRow): string { return r.studentId; }
  trackByMonth(_: number, m: { month: number }): number { return m.month; }
  trackByResult(_: number, r: FeeGenerationStudentResult): string { return r.studentId; }
  trackBySession(_: number, s: AcademicSession): number { return s.id; }
  trackByClass(_: number, c: SchoolClass): number { return c.id; }
}
