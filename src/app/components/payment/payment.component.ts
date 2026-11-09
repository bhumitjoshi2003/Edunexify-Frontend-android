import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnDestroy, Output, NgZone } from '@angular/core';
import { Subject, of } from 'rxjs';
import { catchError, map, switchMap, takeUntil } from 'rxjs/operators';
import { LoggerService } from '../../services/logger.service';
import { RazorpayService, RazorpayOrderResponse, RazorpayPaymentResponse } from '../../services/razorpay.service';
import { RazorpayCheckoutService, RazorpayConstructor } from '../../services/razorpay-checkout.service';
import { PaymentData } from '../../interfaces/payment-data';
import { ToastService } from '../../services/toast.service';
import { StudentService } from '../../services/student.service';
import { AuthStateService } from '../../auth/auth-state.service';
import {
  ONLINE_PAYMENT_UNAVAILABLE_COPY, PaymentConflict, paymentConflict,
} from '../../utils/payment-conflict.util';
import { emptyPaymentData, isPayable, toCreateOrderRequest } from '../../utils/fee-payment.util';
import { formatInrPaise } from '../../pipes/inr.pipe';

/** Razorpay Checkout closes itself after this long — safely inside the server's 15-minute
 * open-checkout window, so an abandoned checkout can't be paid after the server treats it as stale. */
export const CHECKOUT_TIMEOUT_SECONDS = 600;

/** If Razorpay never reports a terminal event (no dismiss after its own timeout), the attempt is
 * released this long after the checkout timeout so the Pay button can't stay locked forever. */
export const CHECKOUT_RELEASE_GRACE_SECONDS = 60;

/** Who and what ONE checkout attempt is for, fixed when the attempt starts. attemptId is unique for
 * the page's lifetime (across component instances); orderId is filled in once the server has
 * created this attempt's order. Every event below carries it so the fee screen can check the event
 * still belongs to the student, session and months it is showing. */
export interface CheckoutAttemptIdentity {
  readonly attemptId: number;
  readonly studentId: string;
  /** Academic session label — the fee screen's session key. */
  readonly session: string;
  readonly months: readonly number[];
  readonly monthSelectionString: string;
  readonly orderId: string | null;
}

/** A payment that may have been taken but isn't confirmed: its Razorpay ID (null when Razorpay
 * returned none) and the months of the attempt that took it. */
export interface PendingPaymentEvent {
  attempt: CheckoutAttemptIdentity;
  paymentId: string | null;
  months: number[];
}

export interface PaymentSuccessEvent {
  attempt: CheckoutAttemptIdentity;
  response: RazorpayPaymentResponse;
}

export interface PaymentConflictEvent {
  attempt: CheckoutAttemptIdentity;
  conflict: PaymentConflict;
}

export interface OnlinePaymentUnavailableEvent {
  attempt: CheckoutAttemptIdentity;
  message: string;
}

/** Razorpay reported a failed try, but its window stays open for another try: NOT terminal. */
export interface PaymentAttemptFailedEvent {
  attempt: CheckoutAttemptIdentity;
  message: string;
}

type AttemptPhase = 'starting' | 'checkout' | 'verifying';

interface ActiveAttempt {
  identity: CheckoutAttemptIdentity;
  readonly draft: PaymentData;
  phase: AttemptPhase;
  /** Razorpay has handed back a payment: later handler/dismiss/failed callbacks are ignored. */
  resultReceived: boolean;
  failures: number;
  deadline: ReturnType<typeof setTimeout> | null;
}

let attemptSequence = 0;

/**
 * The Pay button and the whole online checkout attempt. Shared by the web and Android clients —
 * keep the two copies identical. The server creates and prices the order and verifies the
 * payment; this component only drives Razorpay Checkout.
 *
 * One attempt at a time, from the click until a terminal outcome. paymentProcessingStarted opens
 * it; exactly ONE terminal event closes it:
 *
 *  - paymentSuccess            — the server confirmed and recorded the payment.
 *  - paymentPending            — money may have been taken but isn't confirmed yet (verify said
 *                                pending, verify couldn't be reached, or Razorpay returned an
 *                                unreadable result). Never shown as a failure; never invites repayment.
 *  - paymentConflict           — the server refused a new order because of an earlier payment.
 *  - onlinePaymentUnavailable  — the school has no online payment route right now.
 *  - paymentProcessCompleted   — over without success (cancelled, dismissed, refused, couldn't start).
 *
 * Razorpay's payment.failed is NOT terminal: its window stays open so the payer can try again in
 * it, so the attempt (and the Pay button lock) stays until success, dismissal or the timeout.
 * Every async continuation checks it still belongs to the active attempt; abandonAttempt() and
 * destroy invalidate it, after which its callbacks change nothing on screen.
 *
 * Every Razorpay callback runs outside Angular's zone, so each is brought back in with ngZone.run.
 */
@Component({
  selector: 'app-payment',
  imports: [],
  templateUrl: './payment.component.html',
  styleUrl: './payment.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PaymentComponent implements OnDestroy {
  private destroy$ = new Subject<void>();
  private destroyed = false;
  private active: ActiveAttempt | null = null;

  constructor(
    private razorpayService: RazorpayService,
    private studentService: StudentService,
    private ngZone: NgZone,
    private logger: LoggerService,
    private toast: ToastService,
    private authState: AuthStateService,
    private checkout: RazorpayCheckoutService,
    private cdr: ChangeDetectorRef,
  ) { }

  @Input() paymentData: PaymentData = emptyPaymentData();
  @Input() disabled: boolean = false;
  @Output() paymentSuccess = new EventEmitter<PaymentSuccessEvent>();
  @Output() paymentProcessingStarted = new EventEmitter<CheckoutAttemptIdentity>();
  @Output() paymentProcessCompleted = new EventEmitter<CheckoutAttemptIdentity>();
  @Output() paymentPending = new EventEmitter<PendingPaymentEvent>();
  @Output() onlinePaymentUnavailable = new EventEmitter<OnlinePaymentUnavailableEvent>();
  @Output() paymentConflict = new EventEmitter<PaymentConflictEvent>();
  @Output() paymentAttemptFailed = new EventEmitter<PaymentAttemptFailedEvent>();

  /** An attempt is active: from the click until its terminal outcome. */
  get processing(): boolean {
    return this.active !== null;
  }

  get canPay(): boolean {
    return !this.disabled && !this.processing && isPayable(this.paymentData);
  }

  get buttonLabel(): string {
    if (!this.active) return 'Pay Now';
    return this.active.phase === 'verifying' ? 'Confirming…' : 'Processing…';
  }

  /** The active attempt's identity, if any. */
  get activeAttempt(): CheckoutAttemptIdentity | null {
    return this.active?.identity ?? null;
  }

  async initiatePayment(): Promise<void> {
    if (this.disabled || this.active || this.destroyed) return;
    const input = this.paymentData;
    if (!isPayable(input)) {
      this.toast.warning('Payment Error', 'Select at least one month with a confirmed amount first.');
      return;
    }
    // A snapshot: the attempt pays exactly what was on screen, even if the selection changes.
    const draft: PaymentData = { ...input, months: [...input.months], legacyReceipt: { ...input.legacyReceipt } };
    // The attempt starts at the click, so a double click or a second dialog can't start another.
    const attempt = this.begin(draft);

    // A parent may manage several children: confirm whose fees are being paid, and how much.
    if (this.authState.getUserRole() === 'PARENT') {
      const confirmed = await this.toast.confirm({
        title: `Pay fees for ${draft.studentName}?`,
        message: `You are about to pay ${formatInrPaise(draft.totalPayablePaise)} for ${draft.studentName} (${draft.studentId}).`,
        confirmText: 'Continue to payment', cancelText: 'Cancel', danger: false, icon: 'info'
      });
      if (!this.isCurrent(attempt)) return;
      if (!confirmed || this.paymentData !== input) {
        this.finish(attempt);
        return;
      }
    }

    let Razorpay: RazorpayConstructor;
    try {
      Razorpay = await this.checkout.load();
    } catch (error) {
      this.ngZone.run(() => {
        if (!this.isCurrent(attempt)) return;
        this.logger.error('Razorpay Checkout could not be loaded:', error);
        this.toast.error('Payment Unavailable',
          'Could not load the payment gateway. Please check your internet connection and try again.');
        this.finish(attempt);
      });
      return;
    }
    if (!this.isCurrent(attempt)) return;
    this.createOrderAndOpen(Razorpay, attempt);
  }

  /** Invalidates the active attempt without reporting an outcome: the fee screen has moved to
   * another student/session (or is going away). Its later callbacks change nothing on screen. */
  abandonAttempt(): void {
    const attempt = this.active;
    if (!attempt) return;
    this.clearDeadline(attempt);
    this.active = null;
    this.cdr.markForCheck();
  }

  private begin(draft: PaymentData): ActiveAttempt {
    const attempt: ActiveAttempt = {
      identity: {
        attemptId: ++attemptSequence,
        studentId: draft.studentId,
        session: draft.session,
        months: [...draft.months],
        monthSelectionString: draft.monthSelectionString,
        orderId: null,
      },
      draft,
      phase: 'starting',
      resultReceived: false,
      failures: 0,
      deadline: null,
    };
    this.active = attempt;
    this.paymentProcessingStarted.emit(attempt.identity);
    this.cdr.markForCheck();
    return attempt;
  }

  private isCurrent(attempt: ActiveAttempt): boolean {
    return !this.destroyed && this.active === attempt;
  }

  private createOrderAndOpen(Razorpay: RazorpayConstructor, attempt: ActiveAttempt): void {
    this.studentService.getStudent(attempt.draft.studentId).pipe(
      // Contact prefill is a convenience; never block a payment on it.
      catchError((error) => {
        this.logger.error('Could not load student details for checkout prefill:', error);
        return of(null);
      }),
      switchMap((student) => this.razorpayService.createOrder(toCreateOrderRequest(attempt.draft)).pipe(
        map((order) => ({ order, student })),
      )),
      takeUntil(this.destroy$),
    ).subscribe({
      next: ({ order, student }) => this.ngZone.run(() => {
        if (!this.isCurrent(attempt)) return;
        if (!order?.orderId) {
          this.logger.error('Payment order created without an order id.');
          this.toast.error('Error', 'Could not start the payment. Please try again.');
          this.finish(attempt);
          return;
        }
        attempt.identity = { ...attempt.identity, orderId: order.orderId };
        this.openCheckout(Razorpay, order, student, attempt);
      }),
      error: (error) => this.onOrderRefused(error, attempt),
    });
  }

  private openCheckout(Razorpay: RazorpayConstructor, order: RazorpayOrderResponse,
                       student: { name?: string; email?: string; phoneNumber?: string } | null,
                       attempt: ActiveAttempt): void {
    const options = {
      key: order.razorpayKey,
      amount: order.amount,
      currency: 'INR',
      // Server-chosen from trusted data (school name on its own gateway, "Edunexify" on the
      // platform account) — never a client-side value.
      name: order.checkoutName || order.schoolName || 'Edunexify',
      description: 'Fee Payment',
      order_id: order.orderId,
      prefill: {
        name: student?.name || '',
        email: student?.email || '',
        contact: student?.phoneNumber || ''
      },
      theme: { color: '#4fbdbd' },
      timeout: CHECKOUT_TIMEOUT_SECONDS,
      method: { netbanking: true, card: true, upi: true, wallet: false },
      handler: (paymentResponse: RazorpayPaymentResponse) =>
        this.ngZone.run(() => this.onCheckoutResult(attempt, order, paymentResponse)),
      modal: {
        ondismiss: () => this.ngZone.run(() => this.onCheckoutDismissed(attempt)),
      }
    };

    try {
      const instance = new Razorpay(options);
      instance.on?.('payment.failed', (failure: any) => this.ngZone.run(() => this.onProviderFailure(attempt, failure)));
      if (!this.isCurrent(attempt)) return;
      attempt.phase = 'checkout';
      instance.open();
      this.armDeadline(attempt);
      this.cdr.markForCheck();
    } catch (error) {
      this.ngZone.run(() => {
        if (!this.isCurrent(attempt)) return;
        this.logger.error('Razorpay Checkout could not be opened:', error);
        this.toast.error('Payment Unavailable', 'Could not open the payment window. Please try again.');
        this.finish(attempt);
      });
    }
  }

  /** Razorpay's success handler. Deduplicated: only the first result per attempt counts. */
  private onCheckoutResult(attempt: ActiveAttempt, order: RazorpayOrderResponse, paymentResponse: RazorpayPaymentResponse): void {
    if (attempt.resultReceived) return;
    attempt.resultReceived = true;
    this.clearDeadline(attempt);
    if (!this.isCurrent(attempt)) {
      this.confirmAbandonedPayment(order, paymentResponse);
      return;
    }
    attempt.phase = 'verifying';
    this.cdr.markForCheck();
    if (!paymentResponse?.razorpay_payment_id) {
      // Razorpay reported success without a payment id: money may have been taken, so this is
      // never a failure or an invitation to pay again — the server confirms it from Razorpay.
      this.logger.error('Razorpay handler called without a payment id.');
      this.toast.warning('Payment status unknown',
        'We couldn\'t read the payment result. If money was deducted, it will be confirmed automatically — '
        + 'please don\'t pay again until it shows. Contact the school office if it doesn\'t appear soon.');
      this.release(attempt, () => this.paymentPending.emit({ attempt: attempt.identity, paymentId: null, months: [...attempt.identity.months] }));
      return;
    }
    this.verifyPayment(paymentResponse, order, attempt);
  }

  /** A failed try inside Razorpay's still-open window: report it, keep the attempt locked. */
  private onProviderFailure(attempt: ActiveAttempt, failure: any): void {
    if (!this.isCurrent(attempt) || attempt.resultReceived) return;
    attempt.failures++;
    this.logger.error('Razorpay payment failed:', failure?.error);
    const message = failure?.error?.description || 'Your payment could not be processed. Please try again.';
    this.toast.error('Payment Failed!', message);
    this.paymentAttemptFailed.emit({ attempt: attempt.identity, message });
    this.cdr.markForCheck();
  }

  private onCheckoutDismissed(attempt: ActiveAttempt): void {
    if (!this.isCurrent(attempt) || attempt.resultReceived) return;
    if (attempt.failures > 0) {
      this.toast.warning('Payment not completed', 'The payment window was closed after an unsuccessful attempt. You can try again.');
    } else {
      this.toast.warning('Payment Cancelled!', 'Please try again if you wish to proceed.');
    }
    this.finish(attempt);
  }

  /** Backstop for a checkout that never reports dismissal after Razorpay's own timeout. */
  private armDeadline(attempt: ActiveAttempt): void {
    this.clearDeadline(attempt);
    this.ngZone.runOutsideAngular(() => {
      attempt.deadline = setTimeout(() => this.ngZone.run(() => {
        attempt.deadline = null;
        if (!this.isCurrent(attempt) || attempt.resultReceived) return;
        this.toast.warning('Payment window closed', 'The payment window timed out. You can try again.');
        this.finish(attempt);
      }), (CHECKOUT_TIMEOUT_SECONDS + CHECKOUT_RELEASE_GRACE_SECONDS) * 1000);
    });
  }

  private clearDeadline(attempt: ActiveAttempt): void {
    if (attempt.deadline !== null) {
      clearTimeout(attempt.deadline);
      attempt.deadline = null;
    }
  }

  /** The screen moved on, but Razorpay still handed back a payment: tell the server (it settles
   * idempotently, and the webhook would settle it anyway) without touching any screen state. */
  private confirmAbandonedPayment(order: RazorpayOrderResponse, paymentResponse: RazorpayPaymentResponse): void {
    if (!paymentResponse?.razorpay_payment_id) return;
    this.razorpayService.verifyPayment(paymentResponse, order).subscribe({
      error: (error) => this.logger.error('Background verification of an abandoned checkout failed:', error),
    });
  }

  private onOrderRefused(error: any, attempt: ActiveAttempt): void {
    this.ngZone.run(() => {
      if (!this.isCurrent(attempt)) return;
      this.logger.error('Error creating payment order:', error);
      const conflict = error?.status === 409 ? paymentConflict(error) : null;
      if (conflict?.kind === 'pending') {
        // An earlier payment for these months was taken and isn't recorded yet: never a retry prompt.
        this.toast.warning(conflict.status === 'NEEDS_REVIEW' ? 'Payment needs review' : 'Payment being confirmed',
          conflict.message + (conflict.paymentId ? ` Payment ID: ${conflict.paymentId}` : ''));
        this.release(attempt, () => this.paymentConflict.emit({ attempt: attempt.identity, conflict }));
      } else if (conflict?.kind === 'retry-later') {
        this.toast.warning('Payment already started', conflict.message);
        this.release(attempt, () => this.paymentConflict.emit({ attempt: attempt.identity, conflict }));
      } else if (conflict) {
        // No online payment route for this school (or online pricing unavailable): not a transient
        // failure — show the server's explanation and stop offering online payment.
        const message = conflict.message || ONLINE_PAYMENT_UNAVAILABLE_COPY;
        this.toast.warning('Online Payments Unavailable', message);
        this.release(attempt, () => this.onlinePaymentUnavailable.emit({ attempt: attempt.identity, message }));
      } else {
        this.toast.error('Error', 'Could not start the payment. Please try again.');
        this.finish(attempt);
      }
    });
  }

  private verifyPayment(paymentResponse: RazorpayPaymentResponse, order: RazorpayOrderResponse, attempt: ActiveAttempt): void {
    const paymentId = paymentResponse.razorpay_payment_id;
    const months = [...attempt.identity.months];
    this.razorpayService.verifyPayment(paymentResponse, order).pipe(takeUntil(this.destroy$)).subscribe({
      next: (result) => this.ngZone.run(() => {
        if (!this.isCurrent(attempt)) return;
        if (result.success) {
          this.release(attempt, () => this.paymentSuccess.emit({ attempt: attempt.identity, response: paymentResponse }));
        } else if (result.pending) {
          // Money taken, Razorpay's confirmation still in progress: reassure, never "failed", so
          // nobody pays twice. The server records it automatically once confirmed.
          const id = result.paymentId || paymentId;
          this.toast.info('Payment received',
            (result.message || 'We\'re confirming your payment with Razorpay. It will show as paid shortly — '
              + 'please don\'t pay again.') + (id ? ` Payment ID: ${id}` : ''));
          this.release(attempt, () => this.paymentPending.emit({ attempt: attempt.identity, paymentId: id || null, months }));
        } else {
          // Refused (e.g. Razorpay doesn't confirm it): the server's message names the payment ID.
          this.toast.error('Payment not confirmed', result.message
            || `Payment could not be verified. Please contact the school office with Payment ID ${paymentId}.`);
          this.finish(attempt);
        }
      }),
      error: (error) => this.ngZone.run(() => {
        if (!this.isCurrent(attempt)) return;
        // Checkout already succeeded, so money may have been taken even though the server couldn't
        // be reached: never invite a second payment.
        this.logger.error('Error during payment verification:', error);
        this.toast.warning('Payment being confirmed',
          'We couldn\'t confirm your payment yet. It may already have been received — please don\'t pay again. '
          + 'It will be confirmed automatically; contact the school office if it isn\'t shown as paid soon.'
          + (paymentId ? ` Payment ID: ${paymentId}` : ''));
        this.release(attempt, () => this.paymentPending.emit({ attempt: attempt.identity, paymentId: paymentId || null, months }));
      }),
    });
  }

  /** Ends the attempt exactly once with its terminal event; false if it was already over. */
  private release(attempt: ActiveAttempt, report: () => void): boolean {
    if (!this.isCurrent(attempt)) return false;
    this.clearDeadline(attempt);
    this.active = null;
    report();
    this.cdr.markForCheck();
    return true;
  }

  /** Over without success: release the Pay button and the parent. */
  private finish(attempt: ActiveAttempt): void {
    this.release(attempt, () => this.paymentProcessCompleted.emit(attempt.identity));
  }

  ngOnDestroy(): void {
    this.abandonAttempt();
    this.destroyed = true;
    this.destroy$.next();
    this.destroy$.complete();
  }
}
