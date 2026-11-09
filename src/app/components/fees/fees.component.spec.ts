import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';

import { PaymentTrackerComponent, MonthViewModel } from './fees.component';
import { FeesService } from '../../services/fees.service';
import { StudentService } from '../../services/student.service';
import { AuthService } from '../../auth/auth.service';
import { AttendanceService } from '../../services/attendance.service';
import { AuthStateService } from '../../auth/auth-state.service';
import { FeesCalculationService } from '../../services/fees-calculation.service';
import { LoggerService } from '../../services/logger.service';
import { ToastService } from '../../services/toast.service';
import { SchoolService } from '../../services/school.service';
import { AcademicSessionService } from '../../services/academic-session.service';
import { ParentPortalService } from '../../services/parent-portal.service';
import { StudentFee } from '../../interfaces/student-fee';
import { ManualPaymentRequest } from '../../interfaces/manual-payment-request';
import { CheckoutQuote } from '../../interfaces/checkout-quote';
import { RazorpayService } from '../../services/razorpay.service';
import { RazorpayCheckoutService } from '../../services/razorpay-checkout.service';
import { CheckoutAttemptIdentity } from '../payment/payment.component';

/**
 * Fee UI regression fix (payment-mode/provenance + blank-form ₹0 confusion). Covers:
 * - paymentProvenanceLabel: the true funding source per month, not a hardcoded "Manual".
 * - markAsManuallyPaid: the selected payment mode is carried through into the request sent
 *   to the backend, and the action is guarded (never fires) when no month is selected.
 * - recalculateTotals (via toggleMonthSelection): totalAmountToPay comes from the backend
 *   checkout quote, never a client-side recomputation.
 *
 * Also covers the Phase 1B migration off locally-guessed "current academic year": before,
 * currentAcademicYear came from FeesCalculationService.getAcademicYear(new Date()) — a value
 * that depended on the real wall-clock date when a test ran, not on anything these tests
 * actually controlled. It only ever matched the '2026-2027' fixtures below by coincidence of
 * when this suite happened to run, and would have silently diverged once real time crossed
 * into the next academic year. currentAcademicYear now comes from a mocked
 * AcademicSessionService.getCurrentSession() call, making it fully deterministic.
 */
describe('PaymentTrackerComponent', () => {
  let component: PaymentTrackerComponent;
  let fixture: ComponentFixture<PaymentTrackerComponent>;
  let feesServiceSpy: jasmine.SpyObj<FeesService>;
  let schoolServiceSpy: jasmine.SpyObj<SchoolService>;
  let academicSessionServiceSpy: jasmine.SpyObj<AcademicSessionService>;
  let toastSpy: jasmine.SpyObj<ToastService>;
  let authServiceSpy: jasmine.SpyObj<AuthService>;
  let authStateServiceSpy: jasmine.SpyObj<AuthStateService>;
  let parentPortalServiceSpy: jasmine.SpyObj<ParentPortalService>;
  let razorpayServiceSpy: jasmine.SpyObj<RazorpayService>;
  let routeParams$: BehaviorSubject<Record<string, string>>;
  /** Razorpay Checkout windows opened through the real Pay button (see FakeRazorpay). */
  let checkoutWindows: { options: any; handlers: Record<string, (x: any) => void> }[];

  const adminUser = {
    userId: 'admin1',
    role: 'ADMIN',
    name: 'Admin',
    className: null,
    schoolSlug: 'school-a',
  };

  function buildFee(
    month: number,
    overrides: Partial<StudentFee> = {},
  ): StudentFee {
    return {
      studentId: 'S1',
      className: '10',
      month,
      year: '2026-2027',
      paid: false,
      manuallyPaid: false,
      baseAmountDue: 5000,
      busFeeDue: 800,
      discountAmount: 0,
      snapshotStatus: 'COMPUTED',
      ...overrides,
    };
  }

  beforeEach(async () => {
    feesServiceSpy = jasmine.createSpyObj('FeesService', [
      'getDistinctYearsByStudentId',
      'getStudentFees',
      'getCheckoutQuote',
      'recordManualPayment',
      'getMonthFeeBreakdown',
      'getPendingConfirmations',
    ]);
    feesServiceSpy.getPendingConfirmations.and.returnValue(of([]));
    feesServiceSpy.getDistinctYearsByStudentId.and.returnValue(
      of(['2026-2027']),
    );
    feesServiceSpy.getStudentFees.and.returnValue(
      of([buildFee(5), buildFee(6)]),
    );
    feesServiceSpy.getMonthFeeBreakdown.and.returnValue(of(null as any));

    schoolServiceSpy = jasmine.createSpyObj('SchoolService', ['getSettings']);
    schoolServiceSpy.getSettings.and.returnValue(
      of({ academicYearStartMonth: 7 } as any),
    );

    academicSessionServiceSpy = jasmine.createSpyObj('AcademicSessionService', ['getAllSessions']);
    academicSessionServiceSpy.getAllSessions.and.returnValue(
      of([{ id: 1, label: '2026-2027', startDate: '2026-07-01', endDate: '2027-06-30', current: true }]),
    );

    toastSpy = jasmine.createSpyObj('ToastService', [
      'success',
      'error',
      'warning',
      'info',
      'confirm',
    ]);
    toastSpy.confirm.and.returnValue(Promise.resolve(true));

    const studentServiceSpy = jasmine.createSpyObj('StudentService', [
      'getStudent',
    ]);
    studentServiceSpy.getStudent.and.returnValue(
      of({ name: 'Jordan', className: '10' } as any),
    );

    authServiceSpy = jasmine.createSpyObj('AuthService', [
      'getUserRole',
      'getUserId',
    ]);
    authServiceSpy.getUserRole.and.returnValue('ADMIN');

    const attendanceServiceSpy = jasmine.createSpyObj('AttendanceService', [
      'getTotalUnappliedLeaveCount',
    ]);
    attendanceServiceSpy.getTotalUnappliedLeaveCount.and.returnValue(of(0));

    authStateServiceSpy = jasmine.createSpyObj('AuthStateService', [
      'getUserId',
      'getUser',
      'getUserRole',
    ]);
    authStateServiceSpy.getUserId.and.returnValue('admin1');
    authStateServiceSpy.getUser.and.returnValue(adminUser as any);
    // ParentChildContextComponent (rendered unconditionally at the top of fees.component.html)
    // calls this at construction time regardless of role — was missing from this spy entirely,
    // so fixture.detectChanges() threw "authState.getUserRole is not a function" in every test
    // that rendered the template, independent of anything this Phase 1B change touches.
    authStateServiceSpy.getUserRole.and.returnValue('ADMIN');

    // Real constructor dependency of PaymentTrackerComponent (only exercised for role ===
    // 'PARENT', never hit by these ADMIN-role tests) that was previously left unmocked —
    // Angular then tried to construct the real ParentPortalService, which needs HttpClient,
    // which isn't provided here either, so every test in this file failed at TestBed
    // construction with "No provider for HttpClient!" before it could even run.
    parentPortalServiceSpy = jasmine.createSpyObj('ParentPortalService', ['getMyProfile']);
    razorpayServiceSpy = jasmine.createSpyObj('RazorpayService', ['createOrder', 'verifyPayment']);
    routeParams$ = new BehaviorSubject<Record<string, string>>({});
    checkoutWindows = [];
    function FakeRazorpay(this: any, options: any) {
      const handlers: Record<string, (x: any) => void> = {};
      checkoutWindows.push({ options, handlers });
      return { on: (event: string, cb: (x: any) => void) => { handlers[event] = cb; }, open: () => undefined };
    }

    await TestBed.configureTestingModule({
      imports: [PaymentTrackerComponent],
      providers: [
        FeesCalculationService, // pure calculation service, no HTTP deps — use the real one
        { provide: ActivatedRoute, useValue: { params: routeParams$ } },
        { provide: FeesService, useValue: feesServiceSpy },
        { provide: StudentService, useValue: studentServiceSpy },
        { provide: AuthService, useValue: authServiceSpy },
        { provide: AttendanceService, useValue: attendanceServiceSpy },
        { provide: AuthStateService, useValue: authStateServiceSpy },
        {
          provide: LoggerService,
          useValue: jasmine.createSpyObj('LoggerService', [
            'error',
            'warn',
            'info',
          ]),
        },
        { provide: ToastService, useValue: toastSpy },
        { provide: SchoolService, useValue: schoolServiceSpy },
        { provide: AcademicSessionService, useValue: academicSessionServiceSpy },
        { provide: ParentPortalService, useValue: parentPortalServiceSpy },
        // The Pay button (rendered for STUDENT/PARENT) only needs it when a payment starts.
        { provide: RazorpayService, useValue: razorpayServiceSpy },
        { provide: RazorpayCheckoutService, useValue: { load: () => Promise.resolve(FakeRazorpay as any) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PaymentTrackerComponent);
    component = fixture.componentInstance;
    spyOn(TestBed.inject(Router), 'navigate').and.returnValue(Promise.resolve(true));
  });

  afterEach(() => fixture.destroy());

  let attemptSequence = 1000;
  /** A checkout attempt the Pay button started for this screen's current student + session. */
  function startAttempt(months: number[]): CheckoutAttemptIdentity {
    const attempt: CheckoutAttemptIdentity = {
      attemptId: ++attemptSequence, studentId: component.studentId, session: component.session,
      months, monthSelectionString: '', orderId: 'order_T',
    };
    component.onPaymentProcessingStarted(attempt);
    return attempt;
  }

  // ── paymentProvenanceLabel ──────────────────────────────────────────────

  function monthWith(provenance: string | null | undefined): MonthViewModel {
    return {
      ...buildFee(1),
      monthNumber: 1,
      name: 'July',
      fee: 5000,
      busFee: 800,
      selected: false,
      amountUnavailable: false,
      paymentProvenance: provenance,
    };
  }

  it('shows the true mode for a manual CASH payment, not a generic "Manual" label', () => {
    expect(component.paymentProvenanceLabel(monthWith('CASH'))).toBe('Cash');
  });

  it('shows the true mode for a manual CHEQUE payment', () => {
    expect(component.paymentProvenanceLabel(monthWith('CHEQUE'))).toBe(
      'Cheque',
    );
  });

  it('shows the true mode for a manual UPI payment', () => {
    expect(component.paymentProvenanceLabel(monthWith('UPI'))).toBe('UPI');
  });

  it('labels a Razorpay-funded month "Razorpay", never "Manual"', () => {
    const label = component.paymentProvenanceLabel(monthWith('RAZORPAY'));
    expect(label).toBe('Razorpay');
    expect(label).not.toContain('Manual');
  });

  it('represents mixed funding truthfully as "Mixed" rather than picking one arbitrary mode', () => {
    expect(component.paymentProvenanceLabel(monthWith('MIXED'))).toBe('Mixed');
  });

  it('falls back to the generic "Paid" only when no provenance is available at all', () => {
    expect(component.paymentProvenanceLabel(monthWith(null))).toBe('Paid');
  });

  // ── markAsManuallyPaid: mode survives into the request; no-selection guard ──

  it('carries the selected payment mode through into the ManualPaymentRequest sent to the backend', () => {
    fixture.detectChanges(); // ngOnInit
    component.studentId = 'S1';
    component.studentName = 'Jordan';
    component.className = '10';
    component.session = '2026-2027';
    component.selectedYear = 2026;
    component.selectedMonthsByYear = { 2026: [5] };
    component.manualPaymentAmount = 5887;
    component.quoteValid = true;
    component.manualPaymentMode = 'CHEQUE';
    component.quoteValid = true;
    feesServiceSpy.recordManualPayment.and.returnValue(
      of({ message: 'ok', paymentId: 'p1' } as any),
    );

    component.markAsManuallyPaid();

    return fixture.whenStable().then(() => {
      expect(feesServiceSpy.recordManualPayment).toHaveBeenCalled();
      const sentRequest: ManualPaymentRequest =
        feesServiceSpy.recordManualPayment.calls.mostRecent().args[0];
      expect(sentRequest.paymentMode).toBe('CHEQUE');
    });
  });

  it('never calls the backend when no month is selected (no misleading ₹0 submission)', () => {
    fixture.detectChanges();
    component.studentId = 'S1';
    component.selectedYear = 2026;
    component.selectedMonthsByYear = { 2026: [] };
    component.manualPaymentAmount = 100;
    component.quoteValid = true;

    component.markAsManuallyPaid();

    expect(feesServiceSpy.recordManualPayment).not.toHaveBeenCalled();
    expect(toastSpy.warning).toHaveBeenCalled();
  });

  // ── Checkout quote: the only source of payable amounts (paise end to end) ──

  function quoteOf(overrides: Partial<CheckoutQuote> = {}): CheckoutQuote {
    return {
      studentId: 'S1',
      session: '2026-2027',
      months: [5],
      // ₹5,800 school fee + ₹50 leave charges + ₹42.50 late fee = ₹5,892.50 school amount
      schoolFeePaise: 589250,
      additionalChargesPaise: 5000,
      lateFeePaise: 4250,
      onlineConvenienceFeePaise: 8700,
      totalPayablePaise: 597950,
      currency: 'INR',
      onlinePaymentAvailable: true,
      unresolvedMonths: [],
      ...overrides,
    };
  }

  function selectMay(quote: CheckoutQuote | null, role = 'ADMIN', error?: any) {
    fixture.detectChanges();
    component.role = role;
    component.studentId = 'S1';
    component.studentName = 'Jordan';
    component.session = '2026-2027';
    component.selectedYear = 2026;
    feesServiceSpy.getCheckoutQuote.and.returnValue(error ? throwError(() => error) : of(quote!));
    const month: MonthViewModel = {
      ...buildFee(5), monthNumber: 5, name: 'November', fee: 5000, busFee: 800,
      selected: false, amountUnavailable: false,
    };
    component.months = [month];
    component.toggleMonthSelection(month);
    (component as any).cdr.markForCheck();
    fixture.detectChanges();
    return fixture.whenStable();
  }

  const el = (id: string) =>
    (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

  it('carries every quote component through in paise — leave charges and late fee are never dropped or zeroed', async () => {
    await selectMay(quoteOf());

    expect(component.totalPayablePaise).toBe(597950);
    const pd = component.paymentData;
    expect(pd.totalPayablePaise).toBe(597950);
    expect(pd.schoolFeePaise).toBe(589250);
    expect(pd.additionalChargesPaise).toBe(5000);
    expect(pd.lateFeePaise).toBe(4250);
    expect(pd.onlineConvenienceFeePaise).toBe(8700);
    expect(pd.months).toEqual([5]);
    expect(pd.monthSelectionString).toBe('000010000000');
    // Legacy receipt buckets are rupees: the bare school fee without leave charges or late fee.
    expect(pd.legacyReceipt.tuitionFeeRupees).toBe(5800);
    expect(pd.legacyReceipt.busFeeRupees).toBe(800);
    // The admin's manual amount is the school amount in rupees, never the online convenience fee.
    expect(component.manualPaymentAmount).toBe(5892.5);
    expect(component.quoteSummary).toEqual({
      monthNames: [component.monthLabel(5)],
      schoolFeePaise: 580000, lateFeePaise: 4250, leaveChargesPaise: 5000, convenienceFeePaise: 8700, totalPaise: 597950,
    });
  });

  it('leave charges come only from the quote: no leave count is requested, and the charge is shown as quoted', async () => {
    const attendance = TestBed.inject(AttendanceService) as any;
    await selectMay(quoteOf({ additionalChargesPaise: 2500, schoolFeePaise: 586750, totalPayablePaise: 595450 }));

    expect(attendance.getTotalUnappliedLeaveCount).not.toHaveBeenCalled();
    expect(component.paymentData.additionalChargesPaise).toBe(2500);
    expect(component.quoteSummary!.leaveChargesPaise).toBe(2500);
    expect(component.paymentData.totalPayablePaise).toBe(595450);
    expect(el('summary-leave-charges')!.textContent).toContain('₹25');
  });

  // ── PB-1: a manual payment states the quote's leave charges, which it always covers in full ──

  const s2Quote = () => quoteOf({ additionalChargesPaise: 2500, lateFeePaise: 0, schoolFeePaise: 132500,
    onlineConvenienceFeePaise: 0, totalPayablePaise: 132500 });

  it('a manual payment sends the quote\'s leave charges with the full amount, and shows them apart from the fee', async () => {
    await selectMay(s2Quote());
    feesServiceSpy.recordManualPayment.and.returnValue(of({ message: 'ok', paymentId: 'p1' } as any));

    expect(component.manualPaymentAmount).toBe(1325);
    expect(component.quoteSummary!.schoolFeePaise).toBe(130000);
    expect(el('manual-leave-charges')!.textContent).toContain('₹25');

    component.markAsManuallyPaid();
    await fixture.whenStable();

    expect(toastSpy.confirm.calls.mostRecent().args[0].message).toContain('leave charges');
    const sent: ManualPaymentRequest = feesServiceSpy.recordManualPayment.calls.mostRecent().args[0];
    expect(sent.amountReceived).toBe(1325);
    expect(sent.additionalCharges).toBe(25);
  });

  it('a manual payment with no leave charges states none', async () => {
    await selectMay(quoteOf({ additionalChargesPaise: 0, lateFeePaise: 0, schoolFeePaise: 90000, totalPayablePaise: 90000 }));
    feesServiceSpy.recordManualPayment.and.returnValue(of({ message: 'ok', paymentId: 'p1' } as any));

    expect(el('manual-leave-charges')).toBeNull();
    component.markAsManuallyPaid();
    await fixture.whenStable();

    expect(feesServiceSpy.recordManualPayment.calls.mostRecent().args[0].additionalCharges).toBe(0);
  });

  it('refuses, without calling the backend, an amount that does not cover the leave charges or exceeds what is due', async () => {
    await selectMay(s2Quote());

    for (const amount of [20, 25, 1325.01]) {
      component.manualPaymentAmount = amount;
      component.markAsManuallyPaid();
    }

    expect(feesServiceSpy.recordManualPayment).not.toHaveBeenCalled();
    expect(toastSpy.warning).toHaveBeenCalledTimes(3);
  });

  it('school-gateway pricing (no convenience fee): total is exactly the school amount; online payment stays available', async () => {
    await selectMay(quoteOf({ onlineConvenienceFeePaise: 0, totalPayablePaise: 589250 }), 'STUDENT');
    expect(component.totalPayablePaise).toBe(589250);
    expect(component.paymentData.onlineConvenienceFeePaise).toBe(0);
    expect(component.onlinePaymentUnavailable).toBeFalse();
    expect(el('summary-convenience-fee')).toBeNull();
  });

  it('platform-fallback pricing keeps the server convenience fee as-is, never recomputed', async () => {
    await selectMay(quoteOf({ onlineConvenienceFeePaise: 13300, totalPayablePaise: 602550 }), 'STUDENT');
    expect(component.totalPayablePaise).toBe(602550);
    expect(component.paymentData.onlineConvenienceFeePaise).toBe(13300);
    expect(el('footer-total')!.textContent!.trim()).toBe('₹6,025.50');
  });

  it('older quotes without the leave/late fields are treated as zero, not NaN', async () => {
    const legacy = quoteOf({ schoolFeePaise: 580000, onlineConvenienceFeePaise: 8700, totalPayablePaise: 588700 }) as any;
    delete legacy.additionalChargesPaise;
    delete legacy.lateFeePaise;
    await selectMay(legacy);
    expect(component.paymentData.additionalChargesPaise).toBe(0);
    expect(component.paymentData.lateFeePaise).toBe(0);
    expect(component.paymentData.legacyReceipt.tuitionFeeRupees).toBe(5800);
    expect(component.quoteSummary!.schoolFeePaise).toBe(580000);
  });

  it('a quote with unresolved months is never payable', async () => {
    await selectMay(quoteOf({ unresolvedMonths: [5] }), 'STUDENT');
    expect(component.quoteValid).toBeFalse();
    expect(component.paymentData.totalPayablePaise).toBe(0);
    expect(toastSpy.error).toHaveBeenCalled();
  });

  it('onlinePaymentAvailable=false: shows the unavailable note instead of a Pay button', async () => {
    await selectMay(quoteOf({ onlinePaymentAvailable: false }), 'STUDENT');
    expect(component.onlinePaymentUnavailable).toBeTrue();
    expect(el('online-payment-unavailable')!.textContent).toContain('Online payments are temporarily unavailable');
    expect((fixture.nativeElement as HTMLElement).querySelector('app-payment')).toBeNull();
  });

  it('ADMIN manual collection is never blocked by the online-payment availability flag', async () => {
    await selectMay(quoteOf({ onlinePaymentAvailable: false }), 'ADMIN');
    expect(component.onlinePaymentUnavailable).toBeFalse();
    expect(component.manualPaymentAmount).toBe(5892.5);
  });

  it('a 409 quote refusal shows the server message as information, not an error/retry', async () => {
    await selectMay(null, 'STUDENT', { status: 409, error: { error: 'Online fee payment is not available for this school yet.' } });
    expect(component.onlinePaymentUnavailable).toBeTrue();
    expect(component.onlinePaymentUnavailableMessage).toBe('Online fee payment is not available for this school yet.');
    expect(toastSpy.error).not.toHaveBeenCalled();
    expect(el('online-payment-unavailable')!.textContent).toContain('Online fee payment is not available for this school yet.');
  });

  it('any other quote failure is a retryable error, not "online payment unavailable"', async () => {
    await selectMay(null, 'STUDENT', { status: 500 });
    expect(component.onlinePaymentUnavailable).toBeFalse();
    expect(toastSpy.error).toHaveBeenCalledWith('Error', 'Could not calculate the payment amount. Please try again.');
  });

  it('an order refused with 409 (emitted by the Pay button) replaces the button with the message', async () => {
    await selectMay(quoteOf(), 'STUDENT');
    component.onOnlinePaymentUnavailable({ attempt: startAttempt([5]), message: 'Please pay at the school office.' });
    fixture.detectChanges();
    expect(el('online-payment-unavailable')!.textContent).toContain('Please pay at the school office.');
    expect((fixture.nativeElement as HTMLElement).querySelector('app-payment')).toBeNull();
  });

  it('a "started recently" 409 explains when to retry, until the selection changes', async () => {
    await selectMay(quoteOf(), 'STUDENT');
    component.onPaymentConflict({ attempt: startAttempt([5]), conflict: { kind: 'retry-later', retryAfter: '2026-10-09T10:15:00', message: 'Please wait until 10:15 IST.' } });
    fixture.detectChanges();
    expect(el('retry-notice')!.textContent).toContain('Please wait until 10:15 IST.');
    component.toggleMonthSelection(component.months[0]);
    expect(component.retryNotice).toBeNull();
  });

  it('two months with different values: the summary and payment cover both, from the quote', async () => {
    fixture.detectChanges();
    component.role = 'STUDENT';
    feesServiceSpy.getCheckoutQuote.and.returnValue(of(quoteOf({
      months: [5, 6], schoolFeePaise: 1300050, additionalChargesPaise: 0, lateFeePaise: 0,
      onlineConvenienceFeePaise: 0, totalPayablePaise: 1300050,
    })));
    component.months[0].fee = 5000;
    component.months[1].fee = 7200.5;
    component.toggleMonthSelection(component.months[0]);
    component.toggleMonthSelection(component.months[1]);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(feesServiceSpy.getCheckoutQuote.calls.mostRecent().args[2]).toEqual([5, 6]);
    expect(component.paymentData.totalPayablePaise).toBe(1300050);
    expect(component.paymentData.monthSelectionString).toBe('000011000000');
    expect(el('selection-total')!.innerText.replace(/\s+/g, ' ').trim()).toBe('Total payable — 2 months ₹13,000.50');
    expect(el('selected-total')!.textContent!.trim()).toBe('₹13,000.50');
  });

  it('resets the total to ₹0 when the selection is cleared (expected empty state, not a bug)', () => {
    fixture.detectChanges();
    component.selectedYear = 2026;
    component.selectedMonthsByYear = { 2026: [] };
    (component as any).recalculateTotals();
    expect(component.totalPayablePaise).toBe(0);
    expect(component.manualPaymentAmount).toBe(0);
    expect(component.quoteSummary).toBeNull();
    expect(feesServiceSpy.getCheckoutQuote).not.toHaveBeenCalled();
  });

  it('remaining due keeps paise exactly (₹100.50 due, ₹100 paid → ₹0.50)', () => {
    const month = { ...monthWith(null), fee: 100.5, busFee: 0, amountPaid: 100 } as MonthViewModel;
    expect(component.remainingAmountDue(month)).toBe(0.5);
    expect(component.remainingAmountDue({ ...month, amountPaid: 500 })).toBe(0);
  });

  it('does not request fees with an empty session for a newly registered student', () => {
    feesServiceSpy.getDistinctYearsByStudentId.and.returnValue(of([]));
    feesServiceSpy.getStudentFees.calls.reset();

    fixture.detectChanges();

    expect(component.feesLoaded).toBeTrue();
    expect(component.months).toEqual([]);
    expect(feesServiceSpy.getStudentFees).not.toHaveBeenCalled();
  });


  // ── netAmountPaid: month-card paid-amount display bug fix ──────────────────
  // The card used to show manualPaymentReceived for any manuallyPaid row instead of the
  // authoritative StudentFees.amountPaid — understating MIXED-funded rows and not reflecting
  // partial refunds. netAmountPaid must always be the ledger-net amountPaid, never
  // manualPaymentReceived, regardless of source or refund state.

  function fundedMonth(overrides: Partial<StudentFee>): MonthViewModel {
    return {
      ...buildFee(1),
      monthNumber: 1,
      name: 'July',
      fee: 5000,
      busFee: 800,
      selected: false,
      amountUnavailable: false,
      ...overrides,
    };
  }

  it('one manual payment: netAmountPaid is the authoritative amountPaid', () => {
    const month = fundedMonth({
      paid: true,
      manuallyPaid: true,
      amountPaid: 5800,
      manualPaymentReceived: 5800,
    });
    expect(component.netAmountPaid(month)).toBe(5800);
  });

  it('one Razorpay payment: netAmountPaid is amountPaid, not affected by manualPaymentReceived being unset', () => {
    const month = fundedMonth({
      paid: true,
      manuallyPaid: false,
      amountPaid: 5800,
      manualPaymentReceived: undefined,
    });
    expect(component.netAmountPaid(month)).toBe(5800);
  });

  it('mixed manual + Razorpay funding: netAmountPaid is the full aggregate, not just the manual portion', () => {
    // e.g. ₹3000 paid manually (CASH) + ₹2800 paid via Razorpay = ₹5800 total net-allocated.
    // manualPaymentReceived only reflects the ₹3000 manual slice — using it here would
    // understate the row by ₹2800, exactly the bug being fixed.
    const month = fundedMonth({
      paid: true,
      manuallyPaid: true,
      amountPaid: 5800,
      manualPaymentReceived: 3000,
      paymentProvenance: 'MIXED',
    });
    expect(component.netAmountPaid(month)).toBe(5800);
    expect(component.netAmountPaid(month)).not.toBe(3000);
  });

  it('partial refund: netAmountPaid reflects the reduced net amount, not the original manual receipt', () => {
    // Originally paid ₹5800 manually; ₹2000 refunded — backend recomputes amountPaid to 3800
    // and flips paid to false since it no longer covers the due amount, but the row still has
    // real money in it and must show 3800, not the stale pre-refund manualPaymentReceived.
    const month = fundedMonth({
      paid: false,
      manuallyPaid: true,
      amountPaid: 3800,
      manualPaymentReceived: 3800,
      paymentProvenance: 'CASH',
    });
    expect(component.netAmountPaid(month)).toBe(3800);
  });

  it('fully refunded row: netAmountPaid is 0, and the card falls back to showing the amount due again', () => {
    // Backend's recomputeStudentFeesNetState floors amountPaid at 0 and flips paid/manuallyPaid
    // back to false once every allocation is fully reversed — the resulting correct state is
    // indistinguishable from "never paid," which is what should be shown.
    const month = fundedMonth({
      paid: false,
      manuallyPaid: false,
      amountPaid: 0,
      manualPaymentReceived: 0,
      paymentProvenance: null,
    });
    expect(component.netAmountPaid(month)).toBe(0);
  });

  it('never reads manualPaymentReceived when amountPaid is present, even if they disagree', () => {
    const month = fundedMonth({ amountPaid: 9999, manualPaymentReceived: 1 });
    expect(component.netAmountPaid(month)).toBe(9999);
  });

  it('treats a missing amountPaid (never touched by any payment) as 0, not undefined', () => {
    const month = fundedMonth({ amountPaid: undefined });
    expect(component.netAmountPaid(month)).toBe(0);
  });

  // ── Rendered month-card amount reflects netAmountPaid, end to end ──────────

  it('renders the true aggregate amount on the card for a mixed-funded month, not the manual-only slice', () => {
    fixture.detectChanges();
    const mixedMonth = fundedMonth({
      paid: true,
      manuallyPaid: true,
      amountPaid: 5800,
      manualPaymentReceived: 3000,
      paymentProvenance: 'MIXED',
    });
    component.months = [mixedMonth];
    (component as any).cdr.markForCheck();   // OnPush: a direct property write needs an explicit check
    fixture.detectChanges();

    const amountText =
      (fixture.nativeElement as HTMLElement).querySelector('.pt-month-amount')
        ?.textContent ?? '';
    expect(amountText).toContain('5,800');
    expect(amountText).not.toContain('3,000');
  });

  // ── Month-card status presentation (unavailable / partial / funding) ──────────

  describe('month card status', () => {
    const cardOf = () => (fixture.nativeElement as HTMLElement).querySelector('.pt-month') as HTMLElement;
    const chips = () => Array.from(cardOf().querySelectorAll('.pt-month-chip')).map((c) => c.textContent!.trim());

    it('an unknown amount leads with "Needs review", keeps the reason as a warning note, and still shows it is overdue', () => {
      fixture.detectChanges();
      spyOn(component, 'isLate').and.returnValue(true);
      component.months = [fundedMonth({ amountUnavailable: true, baseAmountDue: 0, snapshotStatus: 'NO_ACTIVE_RULE_THIS_MONTH',
        amountUnavailableReason: 'No fee rule covers this billing month. Ask the school to review rule effective dates.' } as any)];
      (component as any).cdr.markForCheck();
      fixture.detectChanges();

      const card = cardOf();
      expect(card.classList).toContain('pt-month--unavailable');
      expect(card.classList).not.toContain('pt-month--late');
      expect(card.querySelector('.pt-month-amount')!.textContent).toContain('Amount unavailable');
      expect(card.querySelector('.pt-month-amount')!.textContent).not.toContain('₹0');
      const note = card.querySelector('[data-testid="month-unavailable-reason"]')!;
      expect(note.classList).toContain('pt-month-note--warn');
      expect(note.textContent).toContain('No fee rule covers this billing month. Ask the school to review rule effective dates.');
      expect(chips()).toEqual(['Needs review', 'Overdue']);
    });

    it('a partly paid month says Partial (never Paid), shows what was received, and keeps funding separate', () => {
      fixture.detectChanges();
      spyOn(component, 'isLate').and.returnValue(false);
      component.months = [fundedMonth({ paid: false, manuallyPaid: true, amountPaid: 2000, paymentProvenance: 'CASH' })];
      (component as any).cdr.markForCheck();
      fixture.detectChanges();

      const card = cardOf();
      expect(card.classList).toContain('pt-month--partial');
      expect(card.classList).not.toContain('pt-month--paid');
      expect(chips()).toEqual(['Partial']);
      expect(card.querySelector('[data-testid="month-partial-note"]')!.textContent).toContain('Partly paid · ₹2,000 received');
      expect(card.querySelector('[data-testid="month-funding"]')!.textContent!.trim()).toBe('via Cash');
      expect(card.querySelector('.pt-month-amount')!.textContent).toContain('₹3,800');      // balance still owed
    });

    it('a fully paid month says Paid with its funding, and no partial note', () => {
      fixture.detectChanges();
      component.months = [fundedMonth({ paid: true, amountPaid: 5800, paymentProvenance: 'RAZORPAY' })];
      (component as any).cdr.markForCheck();
      fixture.detectChanges();

      expect(chips()).toEqual(['Paid']);
      expect(cardOf().querySelector('[data-testid="month-partial-note"]')).toBeNull();
      expect(cardOf().querySelector('[data-testid="month-funding"]')!.textContent!.trim()).toBe('via Razorpay');
    });
  });

  // ── Online payments taken but not yet recorded (pending-confirmations, server state) ──

  describe('pending payment confirmations', () => {
    const confirming = { paymentId: 'pay_CONF1', months: [5], pendingSince: '2026-10-09T10:00:00', status: 'CONFIRMING' as const };
    const review = { paymentId: 'pay_REV1', months: [6], pendingSince: '2026-10-01T10:00:00', status: 'NEEDS_REVIEW' as const };
    const root = () => fixture.nativeElement as HTMLElement;
    const card = (month: number) =>
      Array.from(root().querySelectorAll('.pt-month'))[component.months.findIndex((m) => m.month === month)] as HTMLElement;

    it('loads them with the fees, for this student and session, on every page load', () => {
      fixture.detectChanges();
      expect(feesServiceSpy.getPendingConfirmations).toHaveBeenCalledWith(component.studentId, '2026-2027');
    });

    it('marks a CONFIRMING month as being confirmed, with the don\'t-pay-again copy and the payment ID', () => {
      feesServiceSpy.getPendingConfirmations.and.returnValue(of([confirming]));
      fixture.detectChanges();

      const notice = root().querySelector('[data-testid="pending-confirmation"]')!;
      expect(notice.textContent).toContain('Payment being confirmed');
      expect(notice.textContent).toContain('Payment received. We’re confirming it with Razorpay. Please don’t pay again.');
      expect(notice.textContent).toContain('pay_CONF1');
      expect(card(5).getAttribute('data-pending')).toBe('CONFIRMING');
      expect(card(5).classList).toContain('pt-month--confirming');
      expect(card(5).querySelector('.pt-month-chip')!.textContent).toContain('Confirming');
      expect(card(6).getAttribute('data-pending')).toBeNull();
    });

    it('marks a NEEDS_REVIEW month as needing review, telling the user to contact the school office', () => {
      feesServiceSpy.getPendingConfirmations.and.returnValue(of([review]));
      fixture.detectChanges();

      const notice = root().querySelector('[data-testid="pending-confirmation"]')!;
      expect(notice.textContent).toContain('Payment needs review');
      expect(notice.textContent).toContain('Please don’t pay again — contact the school office.');
      expect(notice.textContent).toContain('pay_REV1');
      expect(card(6).getAttribute('data-pending')).toBe('NEEDS_REVIEW');
      expect(card(6).querySelector('.pt-month-chip')!.textContent).toContain('Needs review');
    });

    it('a month being confirmed cannot be selected; an ordinary unpaid month still can', () => {
      feesServiceSpy.getPendingConfirmations.and.returnValue(of([confirming]));
      feesServiceSpy.getCheckoutQuote.and.returnValue(of({ studentId: 'S1', session: '2026-2027', months: [6],
        schoolFeePaise: 580000, additionalChargesPaise: 0, lateFeePaise: 0, onlineConvenienceFeePaise: 0,
        totalPayablePaise: 580000, currency: 'INR', unresolvedMonths: [] } as any));
      fixture.detectChanges();
      component.selectedYear = 2026;

      component.toggleMonthSelection(component.months.find((m) => m.month === 5)!);
      expect(component.selectedMonthsByYear[2026] ?? []).not.toContain(5);

      component.toggleMonthSelection(component.months.find((m) => m.month === 6)!);
      expect(component.selectedMonthsByYear[2026]).toEqual([6]);
    });

    it('a selected month that turns out to be pending on reload is dropped from the selection', () => {
      fixture.detectChanges();
      component.selectedMonthsByYear = { [component.selectedYear]: [5] };
      feesServiceSpy.getPendingConfirmations.and.returnValue(of([confirming]));

      component.fetchFees();

      expect(component.selectedMonthsByYear[component.selectedYear] ?? []).toEqual([]);
      expect(component.months.find((m) => m.month === 5)!.selected).toBeFalse();
    });

    it('if the pending list can\'t be loaded, the fees still load (the server still refuses a second order)', () => {
      feesServiceSpy.getPendingConfirmations.and.returnValue(throwError(() => ({ status: 500 })));
      fixture.detectChanges();
      expect(component.feesLoaded).toBeTrue();
      expect(component.months.length).toBe(2);
      expect(component.pendingConfirmations).toEqual([]);
    });

    it('after a pending verification or a pending 409, reloads the server state and clears the selection', () => {
      fixture.detectChanges();
      component.selectedMonthsByYear = { 2026: [5] };
      feesServiceSpy.getPendingConfirmations.calls.reset();

      component.onPaymentConflict({ attempt: startAttempt([5]), conflict: { kind: 'pending', status: 'CONFIRMING', paymentId: 'pay_X', message: 'm' } });

      expect(feesServiceSpy.getPendingConfirmations).toHaveBeenCalled();
      expect(component.selectedMonthsByYear).toEqual({});
    });

    it('a pending verification locks those months right away, even if the refresh fails', () => {
      fixture.detectChanges();
      feesServiceSpy.getPendingConfirmations.and.returnValue(throwError(() => ({ status: 503 })));

      component.onPaymentPending({ attempt: startAttempt([5]), paymentId: 'pay_L1', months: [5] });
      fixture.detectChanges();

      expect(component.pendingFor(5)).toEqual(jasmine.objectContaining({ paymentId: 'pay_L1', status: 'CONFIRMING' }));
      expect(card(5).getAttribute('data-pending')).toBe('CONFIRMING');
      expect(card(5).querySelector('[data-testid="month-chip"]')!.textContent).toContain('Confirming');
      expect(root().querySelector('[data-testid="pending-confirmation"]')!.textContent).toContain('pay_L1');
      expect(card(6).getAttribute('data-pending')).toBeNull();
      component.toggleMonthSelection(component.months.find((m) => m.month === 5)!);
      expect(component.selectedMonthsByYear[component.selectedYear] ?? []).not.toContain(5);
      expect(toastSpy.error).not.toHaveBeenCalled();
    });

    it('stays locked across later failed refreshes, and is never shown as failed or payable', () => {
      fixture.detectChanges();
      feesServiceSpy.getPendingConfirmations.and.returnValue(throwError(() => ({ status: 503 })));
      component.onPaymentPending({ attempt: startAttempt([5]), paymentId: 'pay_L1', months: [5] });
      component.fetchFees();
      component.fetchFees();
      expect(component.pendingFor(5)?.paymentId).toBe('pay_L1');
      expect(component.presentation(component.months.find((m) => m.month === 5)!).selectable).toBeFalse();
    });

    it('once the server lists that payment, its status (NEEDS_REVIEW) governs and the local copy goes', () => {
      fixture.detectChanges();
      component.onPaymentPending({ attempt: startAttempt([5]), paymentId: 'pay_L1', months: [5] });
      feesServiceSpy.getPendingConfirmations.and.returnValue(of([{ paymentId: 'pay_L1', months: [5], pendingSince: '2026-10-09T10:00:00', status: 'NEEDS_REVIEW' as const }]));
      component.fetchFees();
      expect(component.localPendingPayment).toBeNull();
      expect(component.pendingConfirmations.length).toBe(1);
      expect(component.pendingFor(5)!.status).toBe('NEEDS_REVIEW');
    });

    it('once the months come back paid, the local lock is released', () => {
      fixture.detectChanges();
      component.onPaymentPending({ attempt: startAttempt([5]), paymentId: 'pay_L1', months: [5] });
      feesServiceSpy.getStudentFees.and.returnValue(of([buildFee(5, { paid: true, amountPaid: 5800 }), buildFee(6)]));
      component.fetchFees();
      expect(component.localPendingPayment).toBeNull();
      expect(component.pendingFor(5)).toBeNull();
    });

    it('an unreadable Razorpay result (no payment ID) still locks the months, without a blank ID line', () => {
      fixture.detectChanges();
      feesServiceSpy.getPendingConfirmations.and.returnValue(throwError(() => ({ status: 503 })));
      component.onPaymentPending({ attempt: startAttempt([6]), paymentId: null, months: [6] });
      fixture.detectChanges();
      expect(card(6).getAttribute('data-pending')).toBe('CONFIRMING');
      const notice = root().querySelector('[data-testid="pending-confirmation"]')!;
      expect(notice.textContent).toContain('Payment being confirmed');
      expect(notice.textContent).not.toContain('Payment ID');
    });

    it('a pending 409 locks the attempted months until the server lists them', () => {
      fixture.detectChanges();
      feesServiceSpy.getPendingConfirmations.and.returnValue(throwError(() => ({ status: 503 })));
      component.onPaymentConflict({ attempt: startAttempt([6]), conflict: { kind: 'pending', status: 'CONFIRMING', paymentId: 'pay_X', message: 'm' } });
      expect(component.pendingFor(6)?.paymentId).toBe('pay_X');
    });

    it('a "started recently" 409 does not reload or clear anything', () => {
      fixture.detectChanges();
      component.selectedMonthsByYear = { 2026: [5] };
      feesServiceSpy.getPendingConfirmations.calls.reset();

      component.onPaymentConflict({ attempt: startAttempt([5]), conflict: { kind: 'retry-later', retryAfter: '2026-10-09T10:15:00', message: 'm' } });

      expect(feesServiceSpy.getPendingConfirmations).not.toHaveBeenCalled();
      expect(component.selectedMonthsByYear).toEqual({ 2026: [5] });
    });

    it('a manual payment refused because of an online payment shows the server message and reloads', async () => {
      fixture.detectChanges();
      component.studentId = 'S1';
      component.selectedYear = 2026;
      component.selectedMonthsByYear = { 2026: [5] };
      component.manualPaymentAmount = 5800;
    component.quoteValid = true;
      feesServiceSpy.recordManualPayment.and.returnValue(throwError(() => ({ status: 409,
        error: { error: 'An online payment for some of these months was started recently…', retryAfter: '2026-10-09T10:15' } })));
      feesServiceSpy.getPendingConfirmations.calls.reset();

      component.markAsManuallyPaid();
      await fixture.whenStable();

      expect(toastSpy.warning).toHaveBeenCalledWith('Online payment in progress',
        'An online payment for some of these months was started recently and may still be completed. '
        + 'Wait until 10:15 IST, or check with the parent, before recording a manual payment.');
      expect(toastSpy.error).not.toHaveBeenCalled();
      expect(feesServiceSpy.getPendingConfirmations).toHaveBeenCalled();
    });
  });

  // ── Phase 1B: authoritative current session, not a locally-guessed one ─────

  describe('current-session sourcing', () => {
    it('uses the backend AcademicSession label, never a value computed from today\'s date and academicYearStartMonth', () => {
      fixture.detectChanges();

      expect(academicSessionServiceSpy.getAllSessions).toHaveBeenCalled();
      expect(component.currentAcademicYear).toBe('2026-2027');
    });

    it('still loads the fee grid when the school has no current session configured', () => {
      academicSessionServiceSpy.getAllSessions.and.returnValue(
        throwError(() => ({ error: 'No current academic session found.' })),
      );

      fixture.detectChanges();

      return fixture.whenStable().then(() => {
        expect(component.currentAcademicYear).toBe('');
        expect(component.feesLoaded).toBeTrue();
        expect(feesServiceSpy.getStudentFees).toHaveBeenCalled();
      });
    });

    it('suppresses "unpaid this month" warnings for a viewed session strictly after the authoritative current one (historical/future selection)', () => {
      fixture.detectChanges();
      component.role = 'STUDENT';
      component.currentAcademicYear = '2025-2026';
      component.session = '2026-2027'; // viewed session is after the real current one
      component.months = [
        { ...buildFee(5), monthNumber: 5, name: 'November', fee: 5000, busFee: 800, selected: false, amountUnavailable: false, paid: false } as MonthViewModel,
      ];

      component.checkAndDisplayFeeWarnings();

      expect(component.pastUnpaidMonthNames).toEqual([]);
      expect(component.unpaidCurrentMonthName).toBe('');
    });

    it('isLate never flags a month in a session strictly after the authoritative current one', () => {
      fixture.detectChanges();
      component.currentAcademicYear = '2025-2026';
      component.session = '2026-2027';
      const month = {
        ...buildFee(1), monthNumber: 1, name: 'July', fee: 5000, busFee: 800,
        selected: false, amountUnavailable: false, paid: false, manuallyPaid: false,
      } as MonthViewModel;

      expect(component.isLate(month)).toBeFalse();
    });

    it('isLate flags an unpaid month in a historical session strictly before the authoritative current one', () => {
      fixture.detectChanges();
      component.currentAcademicYear = '2026-2027';
      component.session = '2025-2026'; // a past session the user has navigated back to
      const month = {
        ...buildFee(1), monthNumber: 1, name: 'July', fee: 5000, busFee: 800,
        selected: false, amountUnavailable: false, paid: false, manuallyPaid: false,
      } as MonthViewModel;

      expect(component.isLate(month)).toBeTrue();
    });
  });

  function regressionQuote(): CheckoutQuote {
    return { studentId: 'S1', session: '2026-2027', months: [1], schoolFeePaise: 380000,
      additionalChargesPaise: 0, lateFeePaise: 0, onlineConvenienceFeePaise: 0,
      totalPayablePaise: 380000, currency: 'INR', unresolvedMonths: [] } as CheckoutQuote;
  }

  it('labels October and November from the viewed session, regardless of school settings', () => {
    fixture.detectChanges();
    component.sessions = [{ id: 9, label: 'Autumn 2026', startDate: '2026-10-01', endDate: '2027-09-30', current: true }];
    component.session = 'Autumn 2026';
    expect(component.monthLabel(1)).toBe('October 2026');
    expect(component.monthLabel(2)).toBe('November 2026');
  });

  it('keeps a manually funded partial remainder outstanding and selectable', () => {
    feesServiceSpy.getStudentFees.and.returnValue(of([{ ...buildFee(1), paid: false, manuallyPaid: true, amountPaid: 2000, paymentProvenance: 'CASH' }]));
    feesServiceSpy.getCheckoutQuote.and.returnValue(of(regressionQuote()));
    fixture.detectChanges();
    const card = (fixture.nativeElement as HTMLElement).querySelector('.pt-month')!;
    expect(card.textContent).toContain('Partial');
    expect(card.textContent).toContain('3,800');
    expect(card.querySelector('.pt-month-chip')?.textContent).not.toContain('Paid');
    (card as HTMLElement).click();
    expect(feesServiceSpy.getCheckoutQuote).toHaveBeenCalled();
    expect(component.quoteValid).toBeTrue();
  });

  it('clears old totals immediately and ignores an old quote after exact session switch', () => {
    fixture.detectChanges();
    const oldQuote = new Subject<CheckoutQuote>();
    feesServiceSpy.getCheckoutQuote.and.returnValue(oldQuote);
    const month = monthWith(null);
    month.paid = false;
    component.months = [month];
    component.toggleMonthSelection(month);
    expect(component.quoteValid).toBeFalse();
    component.onYearChange({ target: { value: 'Autumn 2027' } } as unknown as Event);
    oldQuote.next(regressionQuote());
    expect(component.session).toBe('Autumn 2027');
    expect(component.totalPayablePaise).toBe(0);
    expect(component.paymentData.studentId).toBe('');
    expect(component.quoteValid).toBeFalse();
  });

  it('shows the reason for an unresolved month without inventing a zero amount', () => {
    feesServiceSpy.getStudentFees.and.returnValue(of([{ ...buildFee(1), paid: false,
      baseAmountDue: null, snapshotStatus: 'NO_ACTIVE_RULE_THIS_MONTH',
      amountUnavailableReason: 'No fee rule covers this billing month.' }]));
    fixture.detectChanges();
    const card = (fixture.nativeElement as HTMLElement).querySelector('.pt-month')!;
    expect(card.textContent).toContain('Amount unavailable');
    expect(card.textContent).toContain('No fee rule covers this billing month.');
    expect(card.querySelector('.pt-month-amount')?.textContent).not.toContain('₹0');
    component.toggleMonthSelection(component.months[0]);
    expect(feesServiceSpy.getCheckoutQuote).not.toHaveBeenCalled();
  });

  it('does not let a previous session fee response overwrite the new session', () => {
    fixture.detectChanges();
    const oldFees = new Subject<StudentFee[]>();
    feesServiceSpy.getStudentFees.and.returnValue(oldFees);
    component.fetchFees();
    feesServiceSpy.getStudentFees.and.returnValue(of([buildFee(2)]));
    component.onYearChange({ target: { value: 'Autumn 2027' } } as unknown as Event);
    oldFees.next([buildFee(11)]);
    expect(component.months.map(m => m.month)).toEqual([2]);
    expect(component.totalPayablePaise).toBe(0);
    expect(component.quoteValid).toBeFalse();
  });
  it('invalidates the quote immediately when selection changes and ignores the former response', () => {
    fixture.detectChanges();
    const first = new Subject<CheckoutQuote>();
    const second = new Subject<CheckoutQuote>();
    feesServiceSpy.getCheckoutQuote.and.returnValues(first, second);
    const months = component.months;
    component.toggleMonthSelection(months[0]);
    component.toggleMonthSelection(months[1]);
    first.next(regressionQuote());
    expect(component.quoteValid).toBeFalse();
    expect(component.totalPayablePaise).toBe(0);
    second.next(regressionQuote());
    expect(component.quoteValid).toBeTrue();
    expect(component.paymentData.monthSelectionString).toBe('000011000000');
  });

  // ── A015: a failed ledger read is never a genuine empty ledger ───────────────

  describe('fee ledger read state', () => {
    const root = () => fixture.nativeElement as HTMLElement;
    const q = (id: string) => root().querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
    const cards = () => root().querySelectorAll('[data-testid="fee-month"]').length;
    const render = () => { (component as any).cdr.markForCheck(); fixture.detectChanges(); };

    it('first load 500: an error with Retry, never "No fees generated yet"', () => {
      feesServiceSpy.getStudentFees.and.returnValue(throwError(() => ({ status: 500 })));
      fixture.detectChanges();
      expect(component.ledgerDisplay).toBe('error');
      expect(component.feesLoaded).toBeFalse();
      expect(q('fees-load-error')!.textContent).toContain('Couldn\'t load fees');
      expect(q('fees-retry')).not.toBeNull();
      expect(q('fees-empty')).toBeNull();
      expect(root().textContent).not.toContain('No fees generated yet');
    });

    it('403 on the session list is an error too, and Retry repeats that read', () => {
      feesServiceSpy.getDistinctYearsByStudentId.and.returnValues(
        throwError(() => ({ status: 403 })), of(['2026-2027']));
      fixture.detectChanges();
      expect(q('fees-load-error')).not.toBeNull();
      expect(q('fees-empty')).toBeNull();
      q('fees-retry')!.click();
      render();
      expect(feesServiceSpy.getDistinctYearsByStudentId).toHaveBeenCalledTimes(2);
      expect(cards()).toBe(2);
      expect(q('fees-load-error')).toBeNull();
    });

    it('network error: Retry is visible; Retry success shows the rows, and only re-reads', () => {
      feesServiceSpy.getStudentFees.and.returnValues(
        throwError(() => ({ status: 0 })), of([buildFee(5), buildFee(6)]));
      fixture.detectChanges();
      expect(q('fees-retry')).not.toBeNull();
      expect(cards()).toBe(0);

      q('fees-retry')!.click();
      render();
      expect(cards()).toBe(2);
      expect(q('fees-load-error')).toBeNull();
      expect(q('fees-empty')).toBeNull();
      expect(razorpayServiceSpy.createOrder).not.toHaveBeenCalled();
      expect(feesServiceSpy.getCheckoutQuote).not.toHaveBeenCalled();
      expect(feesServiceSpy.recordManualPayment).not.toHaveBeenCalled();
    });

    it('a timeout is a failed read too (not empty)', () => {
      feesServiceSpy.getStudentFees.and.returnValue(throwError(() => ({ name: 'TimeoutError' })));
      fixture.detectChanges();
      expect(component.ledgerDisplay).toBe('error');
    });

    it('a successful [] is the genuine empty state', () => {
      feesServiceSpy.getStudentFees.and.returnValue(of([]));
      fixture.detectChanges();
      expect(component.ledgerDisplay).toBe('empty');
      expect(q('fees-empty')!.textContent).toContain('No fees generated yet');
      expect(q('fees-load-error')).toBeNull();
    });

    it('while the first read is in flight: loading, neither empty nor error', () => {
      feesServiceSpy.getStudentFees.and.returnValue(new Subject<StudentFee[]>());
      fixture.detectChanges();
      expect(q('fees-loading')).not.toBeNull();
      expect(q('fees-empty')).toBeNull();
      expect(q('fees-load-error')).toBeNull();
    });

    it('refresh failure after rows: keeps the rows, says so, and blocks selection until a good read', () => {
      fixture.detectChanges();
      expect(cards()).toBe(2);
      const refresh = new Subject<StudentFee[]>();
      feesServiceSpy.getStudentFees.and.returnValue(refresh);
      component.fetchFees();
      render();
      expect(q('fees-refreshing')).not.toBeNull();
      expect(cards()).toBe(2);

      refresh.error({ status: 500 });
      render();
      expect(cards()).toBe(2);
      expect(q('fees-refresh-error')).not.toBeNull();
      expect(q('fees-empty')).toBeNull();
      expect(q('fees-load-error')).toBeNull();
      component.selectedYear = 2026;
      component.toggleMonthSelection(component.months[0]);
      expect(feesServiceSpy.getCheckoutQuote).not.toHaveBeenCalled();

      feesServiceSpy.getStudentFees.and.returnValue(of([buildFee(5, { paid: true, amountPaid: 5800 }), buildFee(6)]));
      q('fees-retry')!.click();
      render();
      expect(q('fees-refresh-error')).toBeNull();
      expect(component.months[0].paid).toBeTrue();
      feesServiceSpy.getCheckoutQuote.and.returnValue(new Subject<CheckoutQuote>());
      component.toggleMonthSelection(component.months[1]);
      expect(feesServiceSpy.getCheckoutQuote).toHaveBeenCalled();
    });

    it('session switch while a read is pending: the old answer never lands; the new failure is shown as an error', () => {
      const old = new Subject<StudentFee[]>();
      feesServiceSpy.getStudentFees.and.returnValue(old);
      fixture.detectChanges();
      const next = new Subject<StudentFee[]>();
      feesServiceSpy.getStudentFees.and.returnValue(next);
      component.onYearChange({ target: { value: '2027-2028' } } as unknown as Event);
      old.next([buildFee(11)]);
      expect(component.months).toEqual([]);
      next.error({ status: 500 });
      expect(component.ledgerDisplay).toBe('error');
    });

    it('a stale failure from an older read never replaces a newer success', () => {
      const old = new Subject<StudentFee[]>();
      feesServiceSpy.getStudentFees.and.returnValue(old);
      fixture.detectChanges();
      feesServiceSpy.getStudentFees.and.returnValue(of([buildFee(2)]));
      component.onYearChange({ target: { value: '2027-2028' } } as unknown as Event);
      old.error({ status: 500 });
      expect(component.ledgerDisplay).toBe('rows');
      expect(component.ledgerRefreshFailed).toBeFalse();
      expect(component.months.map((m) => m.month)).toEqual([2]);
    });

    it('session change resets an error: the new session starts from loading', () => {
      feesServiceSpy.getStudentFees.and.returnValue(throwError(() => ({ status: 500 })));
      fixture.detectChanges();
      feesServiceSpy.getStudentFees.and.returnValue(new Subject<StudentFee[]>());
      component.onYearChange({ target: { value: '2027-2028' } } as unknown as Event);
      expect(component.ledgerDisplay).toBe('loading');
    });

    it('child switch resets stale rows and a failed refresh: nothing of the previous child stays', () => {
      fixture.detectChanges();
      feesServiceSpy.getStudentFees.and.returnValue(throwError(() => ({ status: 500 })));
      component.fetchFees();
      expect(component.ledgerRefreshFailed).toBeTrue();

      const childFees = new Subject<StudentFee[]>();
      feesServiceSpy.getStudentFees.and.returnValue(childFees);
      component.onChildTabSelected({ studentId: 'S2', studentName: 'Ravi', className: '3', canViewFees: true, canPayFees: true } as any);
      expect(component.months).toEqual([]);
      expect(component.ledgerRefreshFailed).toBeFalse();
      expect(component.ledgerDisplay).toBe('loading');
      childFees.next([]);
      childFees.complete();
      expect(component.ledgerDisplay).toBe('empty');
      expect(feesServiceSpy.getStudentFees.calls.mostRecent().args[0]).toBe('S2');
    });

    it('a new account (a fresh screen) starts from loading, never from an earlier screen\'s state', () => {
      feesServiceSpy.getStudentFees.and.returnValue(throwError(() => ({ status: 500 })));
      fixture.detectChanges();
      fixture.destroy();
      fixture = TestBed.createComponent(PaymentTrackerComponent);
      component = fixture.componentInstance;
      expect(component.ledgerDisplay).toBe('loading');
      expect(component.feesLoaded).toBeFalse();
    });
  });

  // ── A031: the screen owns one checkout attempt at a time ─────────────────────

  describe('checkout attempt ownership', () => {
    const root = () => fixture.nativeElement as HTMLElement;
    const q = (id: string) => root().querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

    beforeEach(() => {
      fixture.detectChanges();
      component.studentId = 'S1';
      component.studentName = 'Asha';
    });

    it('while an attempt is active, months, session, child and Retry are locked', () => {
      startAttempt([5]);
      expect(component.isLoadingPayment).toBeTrue();
      component.selectedYear = 2026;
      component.toggleMonthSelection(component.months[1]);
      expect(component.selectedMonthsByYear[2026] ?? []).toEqual([]);
      component.onYearChange({ target: { value: '2027-2028' } } as unknown as Event);
      component.onChildTabSelected({ studentId: 'S2', studentName: 'Ravi', className: '3', canViewFees: true, canPayFees: true } as any);
      const reads = feesServiceSpy.getStudentFees.calls.count();
      component.retryLedger();
      expect(component.studentId).toBe('S1');
      expect(component.session).toBe('2026-2027');
      expect(feesServiceSpy.getStudentFees.calls.count()).toBe(reads);
      expect(component.isLoadingPayment).toBeTrue();
    });

    it('shows whose payment is open, and a provider failure keeps the lock with retry guidance', () => {
      const attempt = startAttempt([5, 6]);
      (component as any).cdr.markForCheck();
      fixture.detectChanges();
      expect(q('checkout-in-progress')!.textContent).toContain('Asha');
      expect(q('checkout-in-progress')!.textContent).toContain('2 months');

      component.onPaymentAttemptFailed({ attempt, message: 'Card declined' });
      fixture.detectChanges();
      expect(component.isLoadingPayment).toBeTrue();
      expect(q('checkout-failure')!.textContent).toContain('Card declined');
      expect(q('checkout-in-progress')!.textContent).toContain('try again in the payment window');

      component.onPaymentProcessCompleted(attempt);
      fixture.detectChanges();
      expect(component.isLoadingPayment).toBeFalse();
      expect(q('checkout-in-progress')).toBeNull();
    });

    it('releases once: a repeated or older terminal event is ignored', () => {
      const first = startAttempt([5]);
      component.onPaymentProcessCompleted(first);
      const second = startAttempt([6]);
      component.onPaymentProcessCompleted(first);
      component.onPaymentPending({ attempt: first, paymentId: 'pay_OLD', months: [5] });
      expect(component.activeCheckout).toBe(second);
      expect(component.isLoadingPayment).toBeTrue();
      expect(component.localPendingPayment).toBeNull();
    });

    it('a pending event whose months differ from the attempt is ignored', () => {
      const attempt = startAttempt([5]);
      component.onPaymentPending({ attempt, paymentId: 'pay_X', months: [6] });
      expect(component.localPendingPayment).toBeNull();
      expect(component.isLoadingPayment).toBeTrue();
    });

    it('a pending event for the attempt\'s student, session and months locks exactly those months', () => {
      const attempt = startAttempt([6]);
      feesServiceSpy.getPendingConfirmations.and.returnValue(throwError(() => ({ status: 503 })));
      component.onPaymentPending({ attempt, paymentId: 'pay_6', months: [6] });
      expect(component.pendingFor(6)?.paymentId).toBe('pay_6');
      expect(component.pendingFor(5)).toBeNull();
      expect(component.isLoadingPayment).toBeFalse();
    });

    it('a context change abandons the attempt; its late events change nothing on the new screen', () => {
      const attempt = startAttempt([5]);
      feesServiceSpy.getStudentFees.and.returnValue(of([buildFee(7, { studentId: 'S2' })]));
      routeParams$.next({ studentId: 'S2' });
      expect(component.studentId).toBe('S2');
      expect(component.activeCheckout).toBeNull();
      expect(component.isLoadingPayment).toBeFalse();

      feesServiceSpy.getStudentFees.calls.reset();
      component.onPaymentPending({ attempt, paymentId: 'pay_A', months: [5] });
      component.handleSuccessfulPayment({ attempt, response: {} as any });
      component.onPaymentConflict({ attempt, conflict: { kind: 'retry-later', retryAfter: 'x', message: 'm' } });
      expect(component.localPendingPayment).toBeNull();
      expect(component.retryNotice).toBeNull();
      expect(feesServiceSpy.getStudentFees).not.toHaveBeenCalled();
      expect(toastSpy.success).not.toHaveBeenCalled();
    });
  });

  describe('parent paying for one child while trying to switch to another', () => {
    const childA = { studentId: 'S1', studentName: 'Asha', className: '5', canViewFees: true, canPayFees: true };
    const childB = { studentId: 'S2', studentName: 'Ravi', className: '3', canViewFees: true, canPayFees: true };
    const root = () => fixture.nativeElement as HTMLElement;

    it('child B cannot be picked while A\'s checkout is open, and A\'s delayed callback never touches B', async () => {
      authServiceSpy.getUserRole.and.returnValue('PARENT');
      authStateServiceSpy.getUserRole.and.returnValue('PARENT');
      authStateServiceSpy.getUserId.and.returnValue('P1');
      parentPortalServiceSpy.getMyProfile.and.returnValue(of({ parent: { parentId: 'P1' }, children: [childA, childB] } as any));
      routeParams$.next({ studentId: 'S1' });
      feesServiceSpy.getCheckoutQuote.and.returnValue(of({
        studentId: 'S1', session: '2026-2027', months: [5], schoolFeePaise: 580000, additionalChargesPaise: 0,
        lateFeePaise: 0, onlineConvenienceFeePaise: 8700, totalPayablePaise: 588700, currency: 'INR',
        onlinePaymentAvailable: true, unresolvedMonths: [] } as CheckoutQuote));
      razorpayServiceSpy.createOrder.and.returnValue(of({ razorpayKey: 'rzp_k', orderId: 'order_A', amount: 588700 }));
      fixture.detectChanges();
      component.toggleMonthSelection(component.months.find((m) => m.month === 5)!);
      fixture.detectChanges();

      const pay = root().querySelector('.pay-btn') as HTMLButtonElement;
      expect(pay.disabled).toBeFalse();
      pay.click();
      pay.click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(toastSpy.confirm).toHaveBeenCalledTimes(1);
      expect(razorpayServiceSpy.createOrder).toHaveBeenCalledTimes(1);
      expect(checkoutWindows.length).toBe(1);
      expect(component.activeCheckout).toEqual(jasmine.objectContaining({ studentId: 'S1', session: '2026-2027', months: [5] }));
      expect((root().querySelector('.pay-btn') as HTMLButtonElement).disabled).toBeTrue();

      // The child switcher is locked while A's checkout is open.
      const tabB = Array.from(root().querySelectorAll('.child-tab')).find((t) => t.textContent!.includes('Ravi')) as HTMLButtonElement;
      expect(tabB.disabled).toBeTrue();
      tabB.click();
      component.onChildTabSelected(childB as any);
      expect(component.studentId).toBe('S1');
      expect(root().querySelector('[data-testid="checkout-in-progress"]')!.textContent).toContain('Asha');

      // The URL moves to child B anyway (e.g. a deep link): A's attempt is abandoned for this screen.
      feesServiceSpy.getStudentFees.and.returnValue(of([buildFee(7, { studentId: 'S2' })]));
      routeParams$.next({ studentId: 'S2' });
      fixture.detectChanges();
      expect(component.studentId).toBe('S2');
      expect(component.isLoadingPayment).toBeFalse();

      // A's provider callback finally arrives: the server is still told, B's screen is untouched.
      razorpayServiceSpy.verifyPayment.and.returnValue(of({ success: false, pending: true, paymentId: 'pay_A' }));
      checkoutWindows[0].options.handler({ razorpay_payment_id: 'pay_A', razorpay_order_id: 'order_A', razorpay_signature: 's' });
      checkoutWindows[0].options.modal.ondismiss();
      fixture.detectChanges();
      expect(razorpayServiceSpy.verifyPayment).toHaveBeenCalledTimes(1);
      expect(component.localPendingPayment).toBeNull();
      expect(component.pendingConfirmations).toEqual([]);
      expect(component.months.map((m) => m.studentId)).toEqual(['S2']);
      expect(toastSpy.info).not.toHaveBeenCalled();
      expect(toastSpy.success).not.toHaveBeenCalled();
      expect(toastSpy.warning).not.toHaveBeenCalled();
    });
  });
});
