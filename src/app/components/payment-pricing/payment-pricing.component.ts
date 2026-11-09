import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { PaymentPricingService } from '../../services/payment-pricing.service';
import { PaymentPricingConfig, PaymentPricingConfigRequest } from '../../interfaces/payment-pricing-config';
import { ToastService } from '../../services/toast.service';
import { LoggerService } from '../../services/logger.service';

/** Platform Admin (SUPER_ADMIN)-only payment pricing management. Pricing is never "edited" —
 * every submission schedules a brand-new immutable version; the backend enforces this the same
 * way (no update endpoint exists at all). All money/rate values here are entered as friendly
 * percent/rupee strings and converted to exact integer basis-points/paise via string
 * manipulation, never floating-point multiplication (a naive `percent * 100` in JS can produce
 * e.g. 219.99999999999997 for "2.20", which would silently persist the wrong rate). */
@Component({
  selector: 'app-payment-pricing',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './payment-pricing.component.html',
  styleUrl: './payment-pricing.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PaymentPricingComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  configs: PaymentPricingConfig[] = [];
  loading = true;
  loadError = false;
  showForm = false;
  submitting = false;

  // Form fields — friendly display units (percent/rupees as plain decimal strings).
  gatewayRatePercent = '';
  gatewayTaxPercent = '';
  edunexifyFeeRupees = '';
  scheduleMode: 'immediate' | 'scheduled' = 'immediate';
  effectiveFromLocal = ''; // datetime-local input value, browser-local time

  constructor(
    private pricingService: PaymentPricingService,
    private toast: ToastService,
    private logger: LoggerService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private load(): void {
    this.loading = true;
    this.loadError = false;
    this.cdr.markForCheck();
    this.pricingService.list('RAZORPAY').pipe(takeUntil(this.destroy$)).subscribe({
      next: (configs) => {
        this.configs = configs;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.logger.error('Error loading payment pricing configuration:', err);
        this.toast.error('Error', 'Could not load payment pricing configuration.');
        this.loading = false;
        this.loadError = true;
        this.cdr.markForCheck();
      },
    });
  }

  retry(): void {
    this.load();
  }

  get isEmpty(): boolean {
    return !this.loading && !this.loadError && this.configs.length === 0;
  }

  get current(): PaymentPricingConfig | undefined {
    return this.configs.find(c => c.status === 'CURRENT');
  }

  get scheduled(): PaymentPricingConfig[] {
    return this.configs.filter(c => c.status === 'SCHEDULED');
  }

  get history(): PaymentPricingConfig[] {
    return this.configs.filter(c => c.status === 'HISTORICAL' || c.status === 'CANCELLED');
  }

  /** Rate/tax basis points -> a fixed-2-decimal percent string, via integer arithmetic only. */
  bpsToPercent(bps: number): string {
    const whole = Math.trunc(bps / 100);
    const frac = Math.abs(bps % 100).toString().padStart(2, '0');
    return `${whole}.${frac}`;
  }

  paiseToRupees(paise: number): string {
    const whole = Math.trunc(paise / 100);
    const frac = Math.abs(paise % 100).toString().padStart(2, '0');
    return `${whole}.${frac}`;
  }

  /** Parses a decimal percent string (e.g. "2.2", "2.20", "18") into EXACT integer basis
   * points via string manipulation — never `Number(value) * 100`, which can misround. Returns
   * null if the input isn't a valid non-negative decimal with at most 2 fractional digits. */
  private percentToBps(value: string): number | null {
    return this.decimalStringToInt(value, 2);
  }

  private rupeesToPaise(value: string): number | null {
    return this.decimalStringToInt(value, 2);
  }

  private decimalStringToInt(value: string, scale: number): number | null {
    const trimmed = (value || '').trim();
    if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
    const [wholePart, fracPart = ''] = trimmed.split('.');
    const paddedFrac = (fracPart + '0'.repeat(scale)).slice(0, scale);
    const combined = `${wholePart}${paddedFrac}`;
    const result = Number(combined);
    return Number.isSafeInteger(result) ? result : null;
  }

  openForm(): void {
    this.gatewayRatePercent = '';
    this.gatewayTaxPercent = '';
    this.edunexifyFeeRupees = '';
    this.scheduleMode = 'immediate';
    this.effectiveFromLocal = '';
    this.showForm = true;
    this.cdr.markForCheck();
  }

  cancelForm(): void {
    this.showForm = false;
    this.cdr.markForCheck();
  }

  async submit(): Promise<void> {
    const rateBps = this.percentToBps(this.gatewayRatePercent);
    const taxBps = this.percentToBps(this.gatewayTaxPercent);
    const feePaise = this.rupeesToPaise(this.edunexifyFeeRupees);

    if (rateBps === null || taxBps === null || feePaise === null) {
      this.toast.warning('Invalid Input', 'Enter valid non-negative amounts (up to 2 decimal places).');
      return;
    }
    if (rateBps < 0 || rateBps >= 10000 || taxBps < 0 || taxBps >= 10000) {
      this.toast.warning('Invalid Input', 'Gateway rate and tax must each be less than 100%.');
      return;
    }

    let effectiveFromIso: string | null = null;
    let effectiveFromDisplay = 'Immediately';
    if (this.scheduleMode === 'scheduled') {
      if (!this.effectiveFromLocal) {
        this.toast.warning('Invalid Input', 'Choose an effective date/time for a scheduled change.');
        return;
      }
      const localDate = new Date(this.effectiveFromLocal);
      if (isNaN(localDate.getTime()) || localDate.getTime() <= Date.now()) {
        this.toast.warning('Invalid Input', 'Scheduled effective time must be in the future.');
        return;
      }
      effectiveFromIso = localDate.toISOString();
      effectiveFromDisplay = localDate.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
    }

    const currentRateDisplay = this.current ? `${this.bpsToPercent(this.current.gatewayRateBps)}%` : 'none configured';
    const confirmed = await this.toast.confirm({
      title: 'Schedule New Payment Pricing?',
      icon: 'warning',
      html: `
        <div style="text-align:left; line-height:1.7;">
          <div><strong>Gateway rate:</strong> ${currentRateDisplay} &rarr; ${this.gatewayRatePercent}%</div>
          <div><strong>Gateway GST:</strong> ${this.gatewayTaxPercent}%</div>
          <div><strong>Edunexify transaction fee:</strong> &#8377;${this.edunexifyFeeRupees}</div>
          <div><strong>Effective:</strong> ${effectiveFromDisplay}</div>
        </div>
      `,
      confirmText: 'Schedule Pricing',
      cancelText: 'Cancel',
    });
    if (!confirmed) return;

    const request: PaymentPricingConfigRequest = {
      gatewayProvider: 'RAZORPAY',
      gatewayRateBps: rateBps,
      gatewayTaxRateBps: taxBps,
      edunexifyTransactionFeePaise: feePaise,
      effectiveFrom: effectiveFromIso,
    };

    this.submitting = true;
    this.cdr.markForCheck();
    this.pricingService.create(request).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.submitting = false;
        this.showForm = false;
        this.toast.success('Pricing Scheduled', 'The new payment pricing version has been saved.');
        this.load();
      },
      error: (err) => {
        this.submitting = false;
        this.cdr.markForCheck();
        this.logger.error('Error creating payment pricing version:', err);
        const message = err?.error?.message || 'Could not schedule the new pricing version.';
        this.toast.error('Error', message);
      },
    });
  }

  async cancelScheduled(config: PaymentPricingConfig): Promise<void> {
    const confirmed = await this.toast.confirm({
      title: 'Cancel Scheduled Pricing Change?',
      message: `This will cancel the ${this.bpsToPercent(config.gatewayRateBps)}% rate scheduled for ` +
        `${new Date(config.effectiveFrom).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}. This cannot be undone.`,
      confirmText: 'Cancel Change',
      cancelText: 'Keep It',
      danger: true,
      icon: 'danger',
    });
    if (!confirmed) return;

    this.pricingService.cancel(config.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.toast.success('Cancelled', 'The scheduled pricing change has been cancelled.');
        this.load();
      },
      error: (err) => {
        this.logger.error('Error cancelling payment pricing version:', err);
        const message = err?.error?.message || 'Could not cancel the scheduled pricing change.';
        this.toast.error('Error', message);
      },
    });
  }
}
