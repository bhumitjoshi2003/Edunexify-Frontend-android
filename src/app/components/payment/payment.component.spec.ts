import { NgZone } from '@angular/core';
import { Subject, of, throwError } from 'rxjs';
import { CHECKOUT_RELEASE_GRACE_SECONDS, CHECKOUT_TIMEOUT_SECONDS, PaymentComponent } from './payment.component';
import { RazorpayCheckoutUnavailableError } from '../../services/razorpay-checkout.service';
import { PaymentData } from '../../interfaces/payment-data';
import { emptyPaymentData } from '../../utils/fee-payment.util';

/** Shared by the web and Android clients — keep the two copies identical. */
describe('PaymentComponent — checkout attempt', () => {
  let razorpayService: any;
  let toast: any;
  let checkout: any;
  let cdr: any;
  let c: PaymentComponent;
  let opened: any[];
  let instances: any[];
  let role: string;

  /** A fake Razorpay constructor: records options and lets a test fire 'payment.failed'. */
  function FakeRazorpay(this: any, options: any) {
    opened.push(options);
    const handlers: Record<string, (x: any) => void> = {};
    const instance = { on: (event: string, cb: (x: any) => void) => { handlers[event] = cb; }, open: jasmine.createSpy('open'), handlers };
    instances.push(instance);
    return instance;
  }

  const draft = (over: Partial<PaymentData> = {}): PaymentData => ({
    ...emptyPaymentData(),
    studentId: 'S1', studentName: 'Asha', className: '5', session: '2026-2027',
    months: [1, 2], monthSelectionString: '110000000000',
    totalPayablePaise: 580050, schoolFeePaise: 570050, additionalChargesPaise: 5000, lateFeePaise: 0,
    onlineConvenienceFeePaise: 10000,
    legacyReceipt: { tuitionFeeRupees: 5651, busFeeRupees: 0, annualChargesRupees: 0, labChargesRupees: 0, ecaProjectRupees: 0, examinationFeeRupees: 0 },
    ...over,
  });
  const order = (over: any = {}) => ({ razorpayKey: 'rzp_live_schoolA', orderId: 'order_X', amount: 580050, ...over });
  const rzpResponse = { razorpay_payment_id: 'pay_9', razorpay_order_id: 'order_X', razorpay_signature: 'sig' };

  beforeEach(() => {
    opened = [];
    instances = [];
    role = 'STUDENT';
    razorpayService = { createOrder: jasmine.createSpy('createOrder'), verifyPayment: jasmine.createSpy('verifyPayment') };
    toast = jasmine.createSpyObj('ToastService', ['warning', 'error', 'success', 'info', 'confirm']);
    checkout = { load: jasmine.createSpy('load').and.returnValue(Promise.resolve(FakeRazorpay as any)) };
    cdr = jasmine.createSpyObj('ChangeDetectorRef', ['markForCheck']);
    const studentService = { getStudent: () => of({ name: 'Asha' }) };
    const logger = jasmine.createSpyObj('LoggerService', ['error']);
    c = new PaymentComponent(razorpayService, studentService as any, new NgZone({ enableLongStackTrace: false }), logger, toast,
      { getUserRole: () => role } as any, checkout, cdr);
    c.paymentData = draft();
  });

  afterEach(() => c.ngOnDestroy());

  describe('payable input', () => {
    it('cannot pay without a quoted, integer paise total', () => {
      c.paymentData = draft({ totalPayablePaise: 0 });
      expect(c.canPay).toBeFalse();
      c.paymentData = draft({ totalPayablePaise: 100.5 });
      expect(c.canPay).toBeFalse();
      c.paymentData = draft({ months: [] });
      expect(c.canPay).toBeFalse();
      c.paymentData = draft();
      expect(c.canPay).toBeTrue();
      c.disabled = true;
      expect(c.canPay).toBeFalse();
    });

    it('sends the quoted paise unchanged and legacy receipt buckets in rupees — no 100x scaling', async () => {
      razorpayService.createOrder.and.returnValue(throwError(() => ({ status: 500 })));
      await c.initiatePayment();
      const request = razorpayService.createOrder.calls.mostRecent().args[0];
      expect(request.totalAmount).toBe(580050);
      expect(request.additionalCharges).toBe(5000);
      expect(request.platformFee).toBe(10000);
      expect(request.totalTuitionFee).toBe(5651);
      expect(request.monthSelectionString).toBe('110000000000');
    });

    it('a parent confirms the child and the exact paise amount first', async () => {
      role = 'PARENT';
      toast.confirm.and.returnValue(Promise.resolve(false));
      await c.initiatePayment();
      expect(toast.confirm.calls.mostRecent().args[0].message).toContain('₹5,800.50');
      expect(checkout.load).not.toHaveBeenCalled();
      expect(c.processing).toBeFalse();
    });
  });

  describe('Razorpay script', () => {
    it('load failure: explains, releases the button, and the next click retries the load', async () => {
      checkout.load.and.returnValue(Promise.reject(new RazorpayCheckoutUnavailableError('error')));
      const done = spyOn(c.paymentProcessCompleted, 'emit');
      await c.initiatePayment();
      expect(toast.error).toHaveBeenCalledWith('Payment Unavailable', jasmine.stringMatching(/Could not load the payment gateway/));
      expect(razorpayService.createOrder).not.toHaveBeenCalled();
      expect(done).toHaveBeenCalledTimes(1);
      expect(c.processing).toBeFalse();
      expect(c.canPay).toBeTrue();

      checkout.load.and.returnValue(Promise.resolve(FakeRazorpay as any));
      razorpayService.createOrder.and.returnValue(of(order()));
      await c.initiatePayment();
      expect(checkout.load).toHaveBeenCalledTimes(2);
      expect(opened.length).toBe(1);
    });

    it('a missing Razorpay global is a load failure, not a crash', async () => {
      checkout.load.and.returnValue(Promise.reject(new RazorpayCheckoutUnavailableError('missing-global')));
      await c.initiatePayment();
      expect(toast.error).toHaveBeenCalledWith('Payment Unavailable', jasmine.any(String));
      expect(c.processing).toBeFalse();
    });

    it('a Razorpay constructor that throws is reported and cleaned up', async () => {
      checkout.load.and.returnValue(Promise.resolve((() => { throw new Error('bad'); }) as any));
      razorpayService.createOrder.and.returnValue(of(order()));
      await c.initiatePayment();
      expect(toast.error).toHaveBeenCalledWith('Payment Unavailable', 'Could not open the payment window. Please try again.');
      expect(c.processing).toBeFalse();
    });
  });

  describe('one attempt at a time', () => {
    it('a second click while processing does nothing', async () => {
      razorpayService.createOrder.and.returnValue(of(order()));
      await c.initiatePayment();
      expect(c.processing).toBeTrue();
      await c.initiatePayment();
      expect(razorpayService.createOrder).toHaveBeenCalledTimes(1);
      expect(c.canPay).toBeFalse();
    });
  });

  describe('checkout options', () => {
    beforeEach(() => razorpayService.createOrder.and.returnValue(of(order({ checkoutName: 'Green Valley Public School' }))));

    it('uses the server order: key, amount, order id, school name; closes after 600 seconds', async () => {
      await c.initiatePayment();
      expect(opened[0].key).toBe('rzp_live_schoolA');
      expect(opened[0].amount).toBe(580050);
      expect(opened[0].order_id).toBe('order_X');
      expect(opened[0].name).toBe('Green Valley Public School');
      expect(opened[0].timeout).toBe(600);
      expect(instances[0].open).toHaveBeenCalled();
    });

    it('ignores any client-side name and keeps Edunexify branding when the server sends none', async () => {
      razorpayService.createOrder.and.returnValue(of(order()));
      c.paymentData = { ...draft(), checkoutName: 'Spoofed' } as any;
      await c.initiatePayment();
      expect(opened[0].name).toBe('Edunexify');
    });
  });

  describe('Razorpay outcomes', () => {
    beforeEach(async () => {
      razorpayService.createOrder.and.returnValue(of(order()));
      await c.initiatePayment();
    });

    it('modal dismissed before any result: cancelled, button released', () => {
      const done = spyOn(c.paymentProcessCompleted, 'emit');
      opened[0].modal.ondismiss();
      expect(toast.warning).toHaveBeenCalledWith('Payment Cancelled!', jasmine.any(String));
      expect(done).toHaveBeenCalledTimes(1);
      expect(c.processing).toBeFalse();
    });

    it('payment.failed: reported, but the attempt stays open while Razorpay offers a retry; dismiss then ends it once', () => {
      const done = spyOn(c.paymentProcessCompleted, 'emit');
      const failed = spyOn(c.paymentAttemptFailed, 'emit');
      instances[0].handlers['payment.failed']({ error: { description: 'Card declined' } });
      expect(toast.error).toHaveBeenCalledWith('Payment Failed!', 'Card declined');
      expect(failed).toHaveBeenCalledWith(jasmine.objectContaining({ message: 'Card declined' }));
      expect(done).not.toHaveBeenCalled();
      expect(c.processing).toBeTrue();
      expect(c.canPay).toBeFalse();
      opened[0].modal.ondismiss();
      opened[0].modal.ondismiss();
      expect(toast.warning).toHaveBeenCalledOnceWith('Payment not completed', jasmine.any(String));
      expect(done).toHaveBeenCalledTimes(1);
      expect(c.processing).toBeFalse();
    });

    it('handler with no payment id: status unknown, never failed, months locked as pending', () => {
      const pending = spyOn(c.paymentPending, 'emit');
      const success = spyOn(c.paymentSuccess, 'emit');
      opened[0].handler({});
      expect(toast.warning).toHaveBeenCalledWith('Payment status unknown', jasmine.stringMatching(/don't pay again/));
      expect(toast.error).not.toHaveBeenCalled();
      expect(success).not.toHaveBeenCalled();
      expect(pending).toHaveBeenCalledWith(jasmine.objectContaining({ paymentId: null, months: [1, 2] }));
      expect(c.processing).toBeFalse();
      expect(razorpayService.verifyPayment).not.toHaveBeenCalled();
    });

    it('a dismiss after the handler returned a payment is not a cancellation', () => {
      razorpayService.verifyPayment.and.returnValue(of({ success: true }));
      opened[0].handler(rzpResponse);
      opened[0].modal.ondismiss();
      expect(toast.warning).not.toHaveBeenCalled();
    });

    it('verified: success only', () => {
      razorpayService.verifyPayment.and.returnValue(of({ success: true }));
      const success = spyOn(c.paymentSuccess, 'emit');
      const done = spyOn(c.paymentProcessCompleted, 'emit');
      opened[0].handler(rzpResponse);
      expect(success).toHaveBeenCalled();
      expect(done).not.toHaveBeenCalled();
      expect(c.processing).toBeFalse();
    });

    it('202 pending: received, never failed; the page gets the payment ID and the months', () => {
      razorpayService.verifyPayment.and.returnValue(of({ success: false, pending: true, paymentId: 'pay_9', message: 'Payment received.' }));
      const pending = spyOn(c.paymentPending, 'emit');
      opened[0].handler(rzpResponse);
      expect(toast.info).toHaveBeenCalledWith('Payment received', 'Payment received. Payment ID: pay_9');
      expect(toast.error).not.toHaveBeenCalled();
      expect(pending).toHaveBeenCalledWith(jasmine.objectContaining({ paymentId: 'pay_9', months: [1, 2] }));
      expect(c.processing).toBeFalse();
    });

    it('verification unreachable: may already be received — never "try again", treated as pending', () => {
      razorpayService.verifyPayment.and.returnValue(throwError(() => ({ status: 0 })));
      const pending = spyOn(c.paymentPending, 'emit');
      opened[0].handler(rzpResponse);
      const [title, message] = toast.warning.calls.mostRecent().args;
      expect(title).toBe('Payment being confirmed');
      expect(message).toContain('may already have been received');
      expect(message).toContain('pay_9');
      expect(message).not.toContain('try again');
      expect(toast.error).not.toHaveBeenCalled();
      expect(pending).toHaveBeenCalledWith(jasmine.objectContaining({ paymentId: 'pay_9', months: [1, 2] }));
    });

    it('refused: shows the server message', () => {
      razorpayService.verifyPayment.and.returnValue(of({ success: false, message: 'Razorpay could not confirm this payment. Payment ID: pay_9' }));
      opened[0].handler(rzpResponse);
      expect(toast.error).toHaveBeenCalledWith('Payment not confirmed', 'Razorpay could not confirm this payment. Payment ID: pay_9');
      expect(c.processing).toBeFalse();
    });

    it('the attempt pays the snapshot even if the selection changed meanwhile', () => {
      c.paymentData = draft({ months: [3], totalPayablePaise: 100 });
      razorpayService.verifyPayment.and.returnValue(of({ success: false, pending: true, paymentId: 'pay_9' }));
      const pending = spyOn(c.paymentPending, 'emit');
      opened[0].handler(rzpResponse);
      expect(pending).toHaveBeenCalledWith(jasmine.objectContaining({ paymentId: 'pay_9', months: [1, 2] }));
    });
  });

  describe('order refused (409 and others)', () => {
    async function refuse(error: any) {
      razorpayService.createOrder.and.returnValue(throwError(() => error));
      await c.initiatePayment();
    }

    it('no online payment route: shows the server explanation and tells the page', async () => {
      const unavailable = spyOn(c.onlinePaymentUnavailable, 'emit');
      const done = spyOn(c.paymentProcessCompleted, 'emit');
      await refuse({ status: 409, error: { error: 'Online fee payment is not available for this school yet. Please pay at the school office.' } });
      expect(toast.warning).toHaveBeenCalledWith('Online Payments Unavailable',
        'Online fee payment is not available for this school yet. Please pay at the school office.');
      expect(unavailable).toHaveBeenCalledWith(jasmine.objectContaining({
        message: 'Online fee payment is not available for this school yet. Please pay at the school office.' }));
      expect(toast.error).not.toHaveBeenCalled();
      // Exactly one terminal event per attempt: "unavailable" is it.
      expect(done).not.toHaveBeenCalled();
      expect(c.processing).toBeFalse();
    });

    it('routing unavailable with no message: the default unavailable copy, not a generic failure', async () => {
      const unavailable = spyOn(c.onlinePaymentUnavailable, 'emit');
      await refuse({ status: 409, error: {} });
      expect(unavailable).toHaveBeenCalledWith(jasmine.objectContaining({
        message: 'Online payments are temporarily unavailable. Please contact the school office.' }));
      expect(toast.error).not.toHaveBeenCalled();
    });

    it('other failures: a generic retryable error', async () => {
      const unavailable = spyOn(c.onlinePaymentUnavailable, 'emit');
      await refuse({ status: 500 });
      expect(toast.error).toHaveBeenCalledWith('Error', 'Could not start the payment. Please try again.');
      expect(unavailable).not.toHaveBeenCalled();
      expect(c.processing).toBeFalse();
    });

    it('a payment being confirmed: payment ID, never a retry prompt', async () => {
      const conflict = spyOn(c.paymentConflict, 'emit');
      await refuse({ status: 409, error: {
        error: 'A payment for these months is already being confirmed. Please don\'t pay again.',
        pending: true, paymentId: 'pay_P1', status: 'CONFIRMING' } });
      expect(toast.warning).toHaveBeenCalledWith('Payment being confirmed',
        'A payment for these months is already being confirmed. Please don\'t pay again. Payment ID: pay_P1');
      expect(conflict).toHaveBeenCalledWith(jasmine.objectContaining({
        conflict: jasmine.objectContaining({ kind: 'pending', status: 'CONFIRMING', paymentId: 'pay_P1' }) }));
      expect(toast.error).not.toHaveBeenCalled();
    });

    it('NEEDS_REVIEW is preserved and points to the school office', async () => {
      const conflict = spyOn(c.paymentConflict, 'emit');
      await refuse({ status: 409, error: {
        error: 'A payment for these months needs to be checked by the school before it can be recorded. Please don\'t pay again — contact the school office.',
        pending: true, paymentId: 'pay_R1', status: 'NEEDS_REVIEW' } });
      const [title, message] = toast.warning.calls.mostRecent().args;
      expect(title).toBe('Payment needs review');
      expect(message).toContain('pay_R1');
      expect(conflict).toHaveBeenCalledWith(jasmine.objectContaining({
        conflict: jasmine.objectContaining({ kind: 'pending', status: 'NEEDS_REVIEW' }) }));
    });

    it('retryAfter: wait until the server time (IST) or check the existing checkout', async () => {
      const conflict = spyOn(c.paymentConflict, 'emit');
      await refuse({ status: 409, error: {
        error: 'A payment for some of these months was started a few minutes ago.', retryAfter: '2026-10-09T10:15:30.123' } });
      expect(toast.warning).toHaveBeenCalledWith('Payment already started',
        'An online payment for these fees was started recently. Please wait until 10:15 IST or check the existing checkout before trying again.');
      expect(conflict).toHaveBeenCalledWith(jasmine.objectContaining({ conflict: jasmine.objectContaining({ kind: 'retry-later' }) }));
    });
  });

  describe('attempt lifecycle and context ownership', () => {
    const flush = () => new Promise<void>((resolve) => setTimeout(resolve));

    function deferredLoad() {
      let resolve!: (ctor: any) => void;
      let reject!: (error: any) => void;
      checkout.load.and.returnValue(new Promise((res, rej) => { resolve = res; reject = rej; }));
      return { resolve: () => resolve(FakeRazorpay as any), reject: () => reject(new RazorpayCheckoutUnavailableError('timeout')) };
    }

    beforeEach(() => razorpayService.createOrder.and.returnValue(of(order())));

    it('payment.failed, then a retry in the SAME Checkout succeeds: one success, no second checkout', async () => {
      razorpayService.verifyPayment.and.returnValue(of({ success: true }));
      const success = spyOn(c.paymentSuccess, 'emit');
      const done = spyOn(c.paymentProcessCompleted, 'emit');
      await c.initiatePayment();
      instances[0].handlers['payment.failed']({ error: { description: 'Insufficient funds' } });
      await c.initiatePayment();
      expect(razorpayService.createOrder).toHaveBeenCalledTimes(1);
      expect(opened.length).toBe(1);

      opened[0].handler(rzpResponse);
      opened[0].modal.ondismiss();
      expect(success).toHaveBeenCalledTimes(1);
      expect(done).not.toHaveBeenCalled();
      expect(toast.warning).not.toHaveBeenCalled();
      expect(c.processing).toBeFalse();
    });

    it('every event carries the attempt identity: student, session, months and the server order', async () => {
      const started = spyOn(c.paymentProcessingStarted, 'emit');
      const pending = spyOn(c.paymentPending, 'emit');
      razorpayService.verifyPayment.and.returnValue(of({ success: false, pending: true, paymentId: 'pay_9' }));
      await c.initiatePayment();
      const identity = started.calls.mostRecent().args[0]!;
      expect(identity).toEqual(jasmine.objectContaining({ studentId: 'S1', session: '2026-2027', months: [1, 2], orderId: null }));
      expect(c.activeAttempt).toEqual(jasmine.objectContaining({ attemptId: identity.attemptId, orderId: 'order_X' }));
      opened[0].handler(rzpResponse);
      expect(pending.calls.mostRecent().args[0]!.attempt).toEqual(jasmine.objectContaining({
        attemptId: identity.attemptId, studentId: 'S1', session: '2026-2027', months: [1, 2], orderId: 'order_X' }));
    });

    it('a double click starts one attempt: one load, one order, one checkout', async () => {
      const started = spyOn(c.paymentProcessingStarted, 'emit');
      const first = c.initiatePayment();
      const second = c.initiatePayment();
      await Promise.all([first, second]);
      expect(started).toHaveBeenCalledTimes(1);
      expect(checkout.load).toHaveBeenCalledTimes(1);
      expect(razorpayService.createOrder).toHaveBeenCalledTimes(1);
      expect(opened.length).toBe(1);
    });

    it('a parent double click opens one confirmation, not two', async () => {
      role = 'PARENT';
      toast.confirm.and.returnValue(Promise.resolve(true));
      await Promise.all([c.initiatePayment(), c.initiatePayment()]);
      expect(toast.confirm).toHaveBeenCalledTimes(1);
      expect(opened.length).toBe(1);
    });

    it('duplicate provider callbacks are deduplicated: one verification, one outcome', async () => {
      razorpayService.verifyPayment.and.returnValue(of({ success: true }));
      const success = spyOn(c.paymentSuccess, 'emit');
      await c.initiatePayment();
      opened[0].handler(rzpResponse);
      opened[0].handler(rzpResponse);
      instances[0].handlers['payment.failed']({ error: {} });
      expect(razorpayService.verifyPayment).toHaveBeenCalledTimes(1);
      expect(success).toHaveBeenCalledTimes(1);
      expect(toast.error).not.toHaveBeenCalled();
    });

    it('destroyed while the Razorpay script is still loading: no order, no checkout, no toast', async () => {
      const load = deferredLoad();
      const done = spyOn(c.paymentProcessCompleted, 'emit');
      const attempt = c.initiatePayment();
      c.ngOnDestroy();
      load.resolve();
      await attempt;
      expect(razorpayService.createOrder).not.toHaveBeenCalled();
      expect(opened.length).toBe(0);
      expect(done).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
    });

    it('a load failure that arrives after the attempt was abandoned shows nothing', async () => {
      const load = deferredLoad();
      const attempt = c.initiatePayment();
      c.abandonAttempt();
      load.reject();
      await attempt;
      expect(toast.error).not.toHaveBeenCalled();
      expect(c.processing).toBeFalse();
    });

    it('destroyed while Checkout is open: later callbacks change nothing on screen; the server is still told', async () => {
      razorpayService.verifyPayment.and.returnValue(of({ success: false, pending: true, paymentId: 'pay_9' }));
      const pending = spyOn(c.paymentPending, 'emit');
      const done = spyOn(c.paymentProcessCompleted, 'emit');
      await c.initiatePayment();
      c.ngOnDestroy();
      instances[0].handlers['payment.failed']({ error: { description: 'x' } });
      opened[0].handler(rzpResponse);
      opened[0].modal.ondismiss();
      expect(razorpayService.verifyPayment).toHaveBeenCalledTimes(1);
      expect(pending).not.toHaveBeenCalled();
      expect(done).not.toHaveBeenCalled();
      expect(toast.info).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
      expect(toast.warning).not.toHaveBeenCalled();
    });

    it('a stale success after invalidation never reports into the next attempt', async () => {
      const success = spyOn(c.paymentSuccess, 'emit');
      await c.initiatePayment();
      c.abandonAttempt();
      expect(c.processing).toBeFalse();
      await c.initiatePayment();
      const second = c.activeAttempt!;
      razorpayService.verifyPayment.and.returnValue(of({ success: true }));
      opened[0].handler(rzpResponse);
      expect(success).not.toHaveBeenCalled();
      expect(c.activeAttempt).toBe(second);
      expect(c.processing).toBeTrue();
    });

    it('a stale payment.failed or dismiss from an older Checkout leaves the new attempt alone', async () => {
      const failed = spyOn(c.paymentAttemptFailed, 'emit');
      const done = spyOn(c.paymentProcessCompleted, 'emit');
      await c.initiatePayment();
      c.abandonAttempt();
      await c.initiatePayment();
      instances[0].handlers['payment.failed']({ error: { description: 'old' } });
      opened[0].modal.ondismiss();
      expect(failed).not.toHaveBeenCalled();
      expect(done).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
      expect(c.processing).toBeTrue();
      opened[1].modal.ondismiss();
      expect(done).toHaveBeenCalledTimes(1);
    });

    it('an order response that arrives after abandonment never opens Checkout', async () => {
      const orders = new Subject<any>();
      razorpayService.createOrder.and.returnValue(orders);
      await c.initiatePayment();
      c.abandonAttempt();
      orders.next(order());
      await flush();
      expect(opened.length).toBe(0);
    });

    it('an order without an order id is never opened in Checkout', async () => {
      razorpayService.createOrder.and.returnValue(of(order({ orderId: '' })));
      const done = spyOn(c.paymentProcessCompleted, 'emit');
      await c.initiatePayment();
      expect(opened.length).toBe(0);
      expect(toast.error).toHaveBeenCalledWith('Error', 'Could not start the payment. Please try again.');
      expect(done).toHaveBeenCalledTimes(1);
    });

    it('if Razorpay never reports a dismissal after its own timeout, the attempt is released once', async () => {
      jasmine.clock().install();
      try {
        const done = spyOn(c.paymentProcessCompleted, 'emit');
        await c.initiatePayment();
        jasmine.clock().tick(CHECKOUT_TIMEOUT_SECONDS * 1000);
        expect(c.processing).toBeTrue();
        jasmine.clock().tick(CHECKOUT_RELEASE_GRACE_SECONDS * 1000 + 1);
        expect(done).toHaveBeenCalledTimes(1);
        expect(c.processing).toBeFalse();
        opened[0].modal.ondismiss();
        expect(done).toHaveBeenCalledTimes(1);
      } finally {
        jasmine.clock().uninstall();
      }
    });

    it('a result in time cancels the backstop: verification is never cut short', async () => {
      jasmine.clock().install();
      try {
        const orders = new Subject<any>();
        razorpayService.verifyPayment.and.returnValue(orders);
        const done = spyOn(c.paymentProcessCompleted, 'emit');
        await c.initiatePayment();
        opened[0].handler(rzpResponse);
        expect(c.buttonLabel).toBe('Confirming…');
        jasmine.clock().tick((CHECKOUT_TIMEOUT_SECONDS + CHECKOUT_RELEASE_GRACE_SECONDS) * 1000 + 1);
        expect(done).not.toHaveBeenCalled();
        expect(c.processing).toBeTrue();
      } finally {
        jasmine.clock().uninstall();
      }
    });
  });
});
