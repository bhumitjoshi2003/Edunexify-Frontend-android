import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, forkJoin, takeUntil } from 'rxjs';
import { PaymentGatewayService } from '../../services/payment-gateway.service';
import { SchoolService, SchoolSettings } from '../../services/school.service';
import { SchoolPaymentGateway } from '../../interfaces/payment-gateway';
import { ToastService } from '../../services/toast.service';
import { LoggerService } from '../../services/logger.service';

/** SUPER_ADMIN review of school-owned Razorpay gateways: approve or reject pending submissions,
 * retire active ones, and grant/stop the temporary Edunexify-account fallback per school. Every
 * rule (re-verification with Razorpay, one ACTIVE per school, the global fallback cut-off) is
 * enforced server-side; this screen only shows non-secret facts and forwards decisions. */
@Component({
  selector: 'app-super-admin-payment-gateways',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './super-admin-payment-gateways.component.html',
  styleUrl: './super-admin-payment-gateways.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SuperAdminPaymentGatewaysComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  /** Latest allowed fallback date as reported by the server (payments.platform-fallback.latest-cutoff).
   * Used only to limit the date picker; the server enforces it regardless. */
  fallbackCutoff: string | null = null;

  loading = true;
  loadError = false;
  pending: SchoolPaymentGateway[] = [];
  active: SchoolPaymentGateway[] = [];
  schools: SchoolSettings[] = [];
  busyGatewayId: number | null = null;

  fallbackSchoolId: number | null = null;
  fallbackUntil = '';
  fallbackReason = '';
  savingFallback = false;

  constructor(
    private gatewayService: PaymentGatewayService,
    private schoolService: SchoolService,
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

  load(): void {
    this.loading = true;
    this.loadError = false;
    this.cdr.markForCheck();
    forkJoin({
      pending: this.gatewayService.list('PENDING'),
      active: this.gatewayService.list('ACTIVE'),
      schools: this.schoolService.listAllSchools(),
      policy: this.gatewayService.getPlatformFallbackPolicy(),
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: ({ pending, active, schools, policy }) => {
        this.fallbackCutoff = policy?.latestCutoff ?? null;
        this.pending = pending;
        this.active = active;
        this.schools = [...schools].sort((a, b) => a.name.localeCompare(b.name));
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: (e) => {
        this.logger.error('Failed to load payment gateways', e);
        this.loading = false;
        this.loadError = true;
        this.cdr.markForCheck();
      }
    });
  }

  get today(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  get selectedSchool(): SchoolSettings | null {
    return this.schools.find(s => s.id === this.fallbackSchoolId) ?? null;
  }

  /** Two-letter avatar text for a school row. */
  initials(name: string | null | undefined): string {
    const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
    return ((words[0]?.[0] ?? '#') + (words[1]?.[0] ?? '')).toUpperCase();
  }

  /** Fallbacks that are still running today (shown as a hero figure). */
  get runningFallbacks(): number {
    return this.schools.filter(s => !!s.platformPaymentFallbackUntil && s.platformPaymentFallbackUntil >= this.today).length;
  }

  /** Schools that currently have a fallback date set (it may already have lapsed). */
  get schoolsWithFallback(): SchoolSettings[] {
    return this.schools.filter(s => !!s.platformPaymentFallbackUntil);
  }

  async activate(g: SchoolPaymentGateway): Promise<void> {
    const ok = await this.toast.confirm({
      title: `Activate ${g.maskedKeyId} for ${g.schoolName ?? 'school #' + g.schoolId}?`,
      message: 'The keys are re-checked with Razorpay first. Online fee payments for this school will go to this account; '
        + 'any currently active gateway for the school is retired.',
      confirmText: 'Activate', cancelText: 'Cancel', icon: 'question',
    });
    if (!ok) return;
    this.decide(g, this.gatewayService.activate(g.id), 'Gateway activated');
  }

  async reject(g: SchoolPaymentGateway): Promise<void> {
    const reason = await this.toast.confirmWithReason({
      title: `Reject ${g.maskedKeyId}?`,
      message: 'The school is notified with your reason and can submit new keys.',
      confirmText: 'Reject', cancelText: 'Cancel', danger: true, icon: 'danger',
      reasonInput: { label: 'Reason', placeholder: 'e.g. Webhook not configured', required: true, maxLength: 500 },
    });
    if (!reason?.trim()) return;
    this.decide(g, this.gatewayService.reject(g.id, reason.trim()), 'Gateway rejected');
  }

  async retire(g: SchoolPaymentGateway): Promise<void> {
    const reason = await this.toast.confirmWithReason({
      title: `Retire ${g.maskedKeyId}?`,
      message: 'New online payments stop immediately for this school unless another gateway or a fallback is active. '
        + 'Existing orders, payments and refunds keep using this account.',
      confirmText: 'Retire', cancelText: 'Cancel', danger: true, icon: 'warning',
      reasonInput: { label: 'Reason', placeholder: 'e.g. School closed its Razorpay account', required: true, maxLength: 500 },
    });
    if (!reason?.trim()) return;
    this.decide(g, this.gatewayService.retire(g.id, reason.trim()), 'Gateway retired');
  }

  private decide(g: SchoolPaymentGateway, call: ReturnType<PaymentGatewayService['activate']>, done: string): void {
    this.busyGatewayId = g.id;
    this.cdr.markForCheck();
    call.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.busyGatewayId = null;
        this.toast.success(done, `${g.schoolName ?? 'School #' + g.schoolId}: ${g.maskedKeyId}`);
        this.load();
      },
      error: (e) => {
        this.logger.error('Payment gateway decision failed', e);
        this.busyGatewayId = null;
        this.toast.error('Not done', this.serverMessage(e) || 'The request failed. Please try again.');
        this.cdr.markForCheck();
      }
    });
  }

  saveFallback(stop: boolean): void {
    const school = this.selectedSchool;
    if (!school) {
      this.toast.warning('Validation', 'Choose a school.');
      return;
    }
    if (!this.fallbackReason.trim()) {
      this.toast.warning('Validation', 'A reason is required.');
      return;
    }
    const until = stop ? null : this.fallbackUntil;
    if (!stop) {
      if (!until) {
        this.toast.warning('Validation', 'Choose the last day of the fallback.');
        return;
      }
      if (until < this.today) {
        this.toast.warning('Validation', 'The fallback date can\'t be in the past.');
        return;
      }
      if (this.fallbackCutoff && until > this.fallbackCutoff) {
        this.toast.warning('Validation', `The platform fallback can't run past ${this.fallbackCutoff}.`);
        return;
      }
    }
    this.savingFallback = true;
    this.cdr.markForCheck();
    this.gatewayService.setPlatformFallback(school.id, until, this.fallbackReason.trim())
      .pipe(takeUntil(this.destroy$)).subscribe({
        next: (res) => {
          school.platformPaymentFallbackUntil = res.platformPaymentFallbackUntil;
          this.savingFallback = false;
          this.fallbackReason = '';
          this.fallbackUntil = '';
          this.toast.success(stop ? 'Fallback stopped' : 'Fallback granted',
            stop ? `${school.name} no longer uses the Edunexify account.`
                 : `${school.name} may use the Edunexify account until ${res.platformPaymentFallbackUntil} while no school gateway is active.`);
          this.cdr.markForCheck();
        },
        error: (e) => {
          this.logger.error('Failed to set platform payment fallback', e);
          this.savingFallback = false;
          this.toast.error('Not saved', this.serverMessage(e) || 'Could not update the fallback. Please try again.');
          this.cdr.markForCheck();
        }
      });
  }

  private serverMessage(e: any): string | null {
    const body = e?.error;
    return typeof body === 'string' ? body : (body?.message || body?.error || null);
  }
}
