import { AcademicSessionService } from '../../services/academic-session.service';
import { feeMonthLabel } from '../../utils/fee-session.util';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { FeeHeadService } from '../../services/fee-head.service';
import { FeeHead } from '../../interfaces/fee-head';
import { ToastService } from '../../services/toast.service';
import { LoggerService } from '../../services/logger.service';

@Component({
  selector: 'app-fee-head-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './fee-head-management.component.html',
  styleUrl: './fee-head-management.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeeHeadManagementComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  feeHeads: FeeHead[] = [];
  isLoading = false;
  saving = false;
  showForm = false;
  editingId: number | null = null;

  form: FeeHead = this.emptyForm();

  frequencyOptions = [
    { value: 'MONTHLY', label: 'Monthly' },
    { value: 'QUARTERLY', label: 'Quarterly' },
    { value: 'SEMI_ANNUAL', label: 'Semi-Annual' },
    { value: 'ANNUAL', label: 'Annual' },
    { value: 'ONE_TIME', label: 'One-Time' },
  ];

  allMonths = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: `Academic month ${i + 1}` }));

  get suspiciousSchedules(): FeeHead[] {
    return this.feeHeads.filter(head => {
      try {
        const months = JSON.parse(head.dueMonths || '[]').sort((a: number, b: number) => a - b).join(',');
        return ((head.frequency === 'ANNUAL' || head.frequency === 'ONE_TIME') && months === '4')
          || (head.frequency === 'SEMI_ANNUAL' && months === '4,10');
      } catch { return true; }
    });
  }

  needsReview(head: FeeHead): boolean {
    return this.suspiciousSchedules.includes(head);
  }

  selectedMonths: Set<number> = new Set();

  constructor(
    private feeHeadService: FeeHeadService,
    private toast: ToastService,
    private logger: LoggerService,
    private cdr: ChangeDetectorRef,
    private sessionsApi: AcademicSessionService,
  ) {}

  ngOnInit(): void {
    this.sessionsApi.getCurrentSession().pipe(takeUntil(this.destroy$)).subscribe({
      next: session => {
        this.allMonths = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: feeMonthLabel(session.startDate, i + 1) }));
        this.cdr.markForCheck();
      },
      error: e => this.logger.error('Session dates unavailable; showing academic ordinals', e),
    });
    this.loadFeeHeads();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadFeeHeads(): void {
    this.isLoading = true;
    this.cdr.markForCheck();
    this.feeHeadService.getAllFeeHeads().pipe(takeUntil(this.destroy$)).subscribe({
      next: (list) => {
        this.feeHeads = list;
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: (e) => {
        this.logger.error('Failed to load fee heads', e);
        this.toast.error('Error', 'Failed to load fee heads.');
        this.isLoading = false;
        this.cdr.markForCheck();
      }
    });
  }

  openAdd(): void {
    this.editingId = null;
    this.form = this.emptyForm();
    this.selectedMonths = this.defaultMonthsForFrequency(this.form.frequency);
    this.showForm = true;
    this.cdr.markForCheck();
  }

  openEdit(fh: FeeHead): void {
    this.editingId = fh.id!;
    this.form = { ...fh };
    try {
      this.selectedMonths = new Set(JSON.parse(fh.dueMonths || '[]'));
    } catch {
      this.selectedMonths = new Set();
    }
    this.showForm = true;
    this.cdr.markForCheck();
  }

  cancelForm(): void {
    this.showForm = false;
    this.editingId = null;
    this.cdr.markForCheck();
  }

  toggleMonth(month: number): void {
    if (this.selectedMonths.has(month)) {
      this.selectedMonths.delete(month);
    } else {
      this.selectedMonths.add(month);
    }
    this.cdr.markForCheck();
  }

  isMonthSelected(month: number): boolean {
    return this.selectedMonths.has(month);
  }

  save(): void {
    if (!this.form.name?.trim() || !this.form.code?.trim()) {
      this.toast.warning('Validation', 'Name and code are required.');
      return;
    }
    this.form.dueMonths = JSON.stringify(Array.from(this.selectedMonths).sort((a,b) => a - b));
    this.saving = true;
    this.cdr.markForCheck();

    const obs = this.editingId
      ? this.feeHeadService.updateFeeHead(this.editingId, this.form)
      : this.feeHeadService.createFeeHead(this.form);

    obs.pipe(takeUntil(this.destroy$)).subscribe({
      next: (saved) => {
        if (this.editingId) {
          this.feeHeads = this.feeHeads.map(f => f.id === saved.id ? saved : f);
        } else {
          this.feeHeads = [...this.feeHeads, saved];
        }
        this.showForm = false;
        this.editingId = null;
        this.saving = false;
        this.toast.success('Saved', `Fee head "${saved.name}" saved.`);
        this.cdr.markForCheck();
      },
      error: (e) => {
        this.logger.error('Failed to save fee head', e);
        this.toast.error('Error', e?.error?.message || 'Could not save fee head.');
        this.saving = false;
        this.cdr.markForCheck();
      }
    });
  }

  getFrequencyLabel(freq: string): string {
    return this.frequencyOptions.find(f => f.value === freq)?.label ?? freq;
  }

  parseDueMonths(json: string): string {
    try {
      const months: number[] = JSON.parse(json || '[]');
      return months.map(m => this.allMonths[m - 1]?.label).filter(Boolean).join(', ');
    } catch {
      return '';
    }
  }

  onFrequencyChange(): void {
    this.selectedMonths = this.defaultMonthsForFrequency(this.form.frequency);
    this.cdr.markForCheck();
  }

  private defaultMonthsForFrequency(frequency: FeeHead['frequency']): Set<number> {
    switch (frequency) {
      case 'MONTHLY': return new Set([1,2,3,4,5,6,7,8,9,10,11,12]);
      case 'QUARTERLY': return new Set([1,4,7,10]);
      case 'SEMI_ANNUAL': return new Set([1,7]);
      case 'ANNUAL': return new Set([1]);
      case 'ONE_TIME': return new Set([1]);
      default: return new Set([1,2,3,4,5,6,7,8,9,10,11,12]);
    }
  }

  private emptyForm(): FeeHead {
    return {
      name: '', code: '', frequency: 'MONTHLY', dueMonths: '[1,2,3,4,5,6,7,8,9,10,11,12]',
      optional: false, refundable: false, siblingDiscountPct: 0, displayOrder: 0, active: true,
    };
  }
}
