import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import {
  FreeSubstituteTeacher,
  SubstitutionBulkResult,
  SubstitutionDayOverview,
  SubstitutionFillPreview,
  SubstitutionWorkloadRow,
  UncoveredPeriod,
} from '../../interfaces/teacher-substitution';
import { AuthStateService } from '../../auth/auth-state.service';
import { LoggerService } from '../../services/logger.service';
import { TeacherSubstitutionService } from '../../services/teacher-substitution.service';
import { ToastService } from '../../services/toast.service';

export type SubstitutionGrouping = 'period' | 'teacher';

export interface SubstitutionGroup {
  key: string;
  label: string;
  sublabel?: string;
  periods: UncoveredPeriod[];
}

@Component({
  selector: 'app-teacher-substitution',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, RouterLink],
  templateUrl: './teacher-substitution.component.html',
  styleUrl: './teacher-substitution.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeacherSubstitutionComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  readonly today = this.localDate(new Date());
  selectedDate = this.today;
  overview: SubstitutionDayOverview | null = null;
  periods: UncoveredPeriod[] = [];
  groups: SubstitutionGroup[] = [];
  grouping: SubstitutionGrouping = 'period';
  selections: Record<number, string> = {};
  notes: Record<number, string> = {};
  noteOpen: Record<number, boolean> = {};
  loading = true;
  failed = false;
  busyEntryId: number | null = null;
  /** The one period currently showing its teacher selector to pick a replacement
   *  substitute — everything else with an existing assignment stays collapsed to just
   *  "Substitute: <name>" plus Change/Remove, per the polished admin UI. */
  changingEntryId: number | null = null;

  // "Fill all with suggested": calculate → preview → confirm → per-item results.
  fillPreview: SubstitutionFillPreview | null = null;
  fillResult: SubstitutionBulkResult | null = null;
  fillLoading = false;
  fillSaving = false;

  constructor(
    private substitutions: TeacherSubstitutionService,
    private toast: ToastService,
    private logger: LoggerService,
    private cdr: ChangeDetectorRef,
    private authState: AuthStateService,
  ) {}

  /** Backend independently enforces the TIMETABLE_EDIT permission for SUB_ADMIN on
   *  assign/change/cancel (ADMIN always has it) — this getter is a UX guard only, so an
   *  under-permissioned SUB_ADMIN sees why the controls are disabled instead of clicking
   *  Assign and getting a confusing 403. Same convention as auth-state.service.ts's
   *  hasPermission() and ai-copilot.component.ts's isAdmin getter. */
  get canManage(): boolean {
    return this.authState.getUser()?.role === 'ADMIN' || this.authState.hasPermission('TIMETABLE_EDIT');
  }

  /** Past dates are read-only (the backend rejects assign/change for them too). */
  get isPastDate(): boolean {
    return this.selectedDate < this.today;
  }

  get canEdit(): boolean {
    return this.canManage && !this.isPastDate && !this.overview?.closedReason;
  }

  ngOnInit(): void { this.load(); }

  get needsAttentionCount(): number {
    return this.periods.filter(period => this.stateOf(period) === 'NEEDS_SUBSTITUTE').length;
  }

  get noLongerNeededCount(): number {
    return this.periods.filter(period => this.stateOf(period) === 'NO_LONGER_NEEDED').length;
  }

  get coveredCount(): number {
    return this.periods.filter(period => this.stateOf(period) === 'COVERED').length;
  }

  get attentionSummary(): string {
    const count = this.needsAttentionCount;
    if (count === 0) return 'All affected periods are covered.';
    return count === 1 ? '1 period needs a substitute' : `${count} periods need a substitute`;
  }

  get workload(): SubstitutionWorkloadRow[] {
    return this.overview?.workload ?? [];
  }

  load(): void {
    this.loading = true;
    this.failed = false;
    this.fillPreview = null;
    this.substitutions.getOverview(this.selectedDate).pipe(takeUntil(this.destroy$)).subscribe({
      next: overview => {
        this.overview = overview;
        this.periods = overview.periods ?? [];
        this.selections = {};
        this.notes = {};
        this.noteOpen = {};
        for (const period of this.periods) {
          this.selections[period.timetableEntryId] = period.assignment?.substituteTeacherId ?? '';
          this.notes[period.timetableEntryId] = period.assignment?.note ?? '';
        }
        this.buildGroups();
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: error => {
        this.logger.error('Substitution periods load failed:', error);
        this.loading = false;
        this.failed = true;
        this.cdr.markForCheck();
      },
    });
  }

  onDateChange(): void {
    this.fillResult = null;
    this.changingEntryId = null;
    this.load();
  }

  setGrouping(grouping: SubstitutionGrouping): void {
    if (this.grouping === grouping) return;
    this.grouping = grouping;
    this.buildGroups();
    this.cdr.markForCheck();
  }

  private buildGroups(): void {
    const map = new Map<string, SubstitutionGroup>();
    for (const period of this.periods) {
      const key = this.grouping === 'period' ? `p${period.periodNumber}` : `t${period.originalTeacherId}`;
      let group = map.get(key);
      if (!group) {
        group = this.grouping === 'period'
          ? { key, label: `Period ${period.periodNumber}`, sublabel: `${period.startTime}–${period.endTime}`, periods: [] }
          : { key, label: period.originalTeacherName, sublabel: this.unavailabilityLabel(period) || 'Available again', periods: [] };
        map.set(key, group);
      }
      group.periods.push(period);
    }
    this.groups = [...map.values()];
  }

  stateOf(period: UncoveredPeriod): 'NEEDS_SUBSTITUTE' | 'COVERED' | 'NO_LONGER_NEEDED' {
    return period.state ?? (period.assignment ? 'COVERED' : 'NEEDS_SUBSTITUTE');
  }

  save(period: UncoveredPeriod): void {
    const teacherId = this.selections[period.timetableEntryId];
    if (!teacherId) {
      this.toast.warning('Select a teacher', 'Choose an eligible free teacher first.');
      return;
    }
    this.submit(period, teacherId);
  }

  assignSuggested(period: UncoveredPeriod): void {
    if (!period.suggested) return;
    this.submit(period, period.suggested.teacherId);
  }

  private submit(period: UncoveredPeriod, teacherId: string): void {
    const note = (this.notes[period.timetableEntryId] ?? '').trim();
    this.busyEntryId = period.timetableEntryId;
    const request = period.assignment
      ? this.substitutions.change(period.assignment.id, teacherId, note)
      : this.substitutions.assign(period.timetableEntryId, this.selectedDate, teacherId, note || null);
    request.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.toast.success(period.assignment ? 'Substitute changed' : 'Substitute assigned');
        this.busyEntryId = null;
        this.changingEntryId = null;
        this.load();
      },
      error: error => {
        this.busyEntryId = null;
        this.toast.error('Unable to save substitution', this.errorMessage(error));
        this.cdr.markForCheck();
      },
    });
  }

  async remove(period: UncoveredPeriod): Promise<void> {
    if (!period.assignment) return;
    const stale = this.stateOf(period) === 'NO_LONGER_NEEDED';
    const confirmed = await this.toast.confirm({
      title: stale ? 'Remove cover that is no longer needed?' : 'Remove substitute?',
      message: `${period.assignment.substituteTeacherName} will be notified that this cover period was cancelled.`,
      confirmText: 'Remove',
      danger: true,
    });
    if (!confirmed) return;
    this.busyEntryId = period.timetableEntryId;
    this.substitutions.cancel(period.assignment.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.toast.success('Substitution removed');
        this.busyEntryId = null;
        this.changingEntryId = null;
        this.load();
      },
      error: error => {
        this.busyEntryId = null;
        this.toast.error('Unable to remove substitution', this.errorMessage(error));
        this.cdr.markForCheck();
      },
    });
  }

  // ── Fill all with suggested ──

  calculateFill(): void {
    this.fillLoading = true;
    this.fillResult = null;
    this.substitutions.suggestFill(this.selectedDate).pipe(takeUntil(this.destroy$)).subscribe({
      next: preview => {
        this.fillPreview = preview;
        this.fillLoading = false;
        this.cdr.markForCheck();
      },
      error: error => {
        this.fillLoading = false;
        this.toast.error('Unable to calculate suggestions', this.errorMessage(error));
        this.cdr.markForCheck();
      },
    });
  }

  cancelFill(): void {
    this.fillPreview = null;
    this.cdr.markForCheck();
  }

  confirmFill(): void {
    const preview = this.fillPreview;
    if (!preview?.proposals.length) return;
    this.fillSaving = true;
    const items = preview.proposals.map(p => ({ timetableEntryId: p.timetableEntryId, substituteTeacherId: p.substituteTeacherId }));
    this.substitutions.assignMany(preview.date, items).pipe(takeUntil(this.destroy$)).subscribe({
      next: result => {
        this.fillSaving = false;
        this.fillResult = result;
        this.fillPreview = null;
        if (result.conflicts || result.failed) {
          this.toast.warning('Some periods were not assigned', this.fillResultSummary(result));
        } else {
          this.toast.success('Substitutes assigned', this.fillResultSummary(result));
        }
        this.load();
      },
      error: error => {
        this.fillSaving = false;
        this.toast.error('Unable to assign substitutes', this.errorMessage(error));
        this.cdr.markForCheck();
      },
    });
  }

  dismissFillResult(): void {
    this.fillResult = null;
    this.cdr.markForCheck();
  }

  fillResultSummary(result: SubstitutionBulkResult): string {
    const parts = [`${result.assigned} assigned`];
    if (result.conflicts) parts.push(`${result.conflicts} conflict${result.conflicts === 1 ? '' : 's'}`);
    if (result.failed) parts.push(`${result.failed} failed`);
    return parts.join(' · ');
  }

  /** "Class X · A, P3" for a bulk outcome row, using the period it refers to. */
  outcomeLabel(timetableEntryId: number): string {
    const proposal = this.periods.find(p => p.timetableEntryId === timetableEntryId);
    return proposal ? `${this.classLabel(proposal)}, P${proposal.periodNumber}` : `Period #${timetableEntryId}`;
  }

  // ── Labels ──

  classLabel(period: { className: string; sectionName?: string | null }): string {
    return period.sectionName ? `Class ${period.className} · ${period.sectionName}` : `Class ${period.className}`;
  }

  unavailabilityLabel(period: UncoveredPeriod): string {
    switch (period.unavailabilityReason) {
      case 'APPROVED_LEAVE': return 'Approved leave';
      case 'ABSENT': return 'Absent';
      case 'ON_LEAVE': return 'On leave';
      default: return '';
    }
  }

  leaveDates(period: UncoveredPeriod): string {
    if (!period.leaveStart) return '';
    const start = this.shortDate(period.leaveStart);
    return !period.leaveEnd || period.leaveEnd === period.leaveStart ? start : `${start} – ${this.shortDate(period.leaveEnd)}`;
  }

  reasonLabel(code: string): string {
    if (code === 'SAME_SUBJECT') return 'Same subject';
    if (code === 'KNOWS_CLASS') return 'Knows class';
    if (code === 'BACK_TO_BACK') return 'Back-to-back';
    const covering = /^COVERING_(\d+)$/.exec(code);
    if (covering) return `Covering ${covering[1]} today`;
    return code;
  }

  /** "Priya Sharma · Same subject · Knows class · Covering 1 today". */
  teacherContext(teacher: FreeSubstituteTeacher): string {
    return [teacher.name, ...(teacher.reasons ?? []).map(code => this.reasonLabel(code))].join(' · ');
  }

  coversLabel(row: SubstitutionWorkloadRow): string {
    return `${row.covers} cover${row.covers === 1 ? '' : 's'}`;
  }

  startChange(period: UncoveredPeriod): void {
    this.changingEntryId = period.timetableEntryId;
    this.selections[period.timetableEntryId] = '';
    this.cdr.markForCheck();
  }

  cancelChange(period: UncoveredPeriod): void {
    this.changingEntryId = null;
    this.selections[period.timetableEntryId] = period.assignment?.substituteTeacherId ?? '';
    this.notes[period.timetableEntryId] = period.assignment?.note ?? '';
    this.cdr.markForCheck();
  }

  toggleNote(period: UncoveredPeriod): void {
    this.noteOpen[period.timetableEntryId] = !this.noteOpen[period.timetableEntryId];
    this.cdr.markForCheck();
  }

  trackGroup = (_: number, group: SubstitutionGroup) => group.key;
  trackPeriod = (_: number, period: UncoveredPeriod) => period.timetableEntryId;

  private shortDate(iso: string): string {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }

  private errorMessage(error: any): string {
    return error?.error?.detail || error?.error?.message || error?.error?.reason
      || (typeof error?.error === 'string' ? error.error : '')
      || 'Please refresh and try again.';
  }

  private localDate(date: Date): string {
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
