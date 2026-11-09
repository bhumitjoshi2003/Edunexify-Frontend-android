import { AcademicSession } from '../../interfaces/academic-session';
import { feeMonthLabel, feeAcademicMonth } from '../../utils/fee-session.util';
import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import {
  CheckoutAttemptIdentity, OnlinePaymentUnavailableEvent, PaymentAttemptFailedEvent, PaymentComponent,
  PaymentConflictEvent, PaymentSuccessEvent, PendingPaymentEvent,
} from '../payment/payment.component';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  NgZone,
} from '@angular/core';
import { FeesService } from '../../services/fees.service';
import { StudentService } from '../../services/student.service';
import { ToastService } from '../../services/toast.service';
import { PaymentData } from '../../interfaces/payment-data';
import { StudentFee } from '../../interfaces/student-fee';
import { CheckoutQuote } from '../../interfaces/checkout-quote';
import { MonthFeeBreakdown } from '../../interfaces/month-fee-breakdown';
import { ManualPaymentRequest } from '../../interfaces/manual-payment-request';
import { AuthStateService } from '../../auth/auth-state.service';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, forkJoin, of, takeUntil } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthService } from '../../auth/auth.service';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ComingSoonComponent } from '../coming-soon/coming-soon.component';
import { MODULE_MESSAGES } from '../../config/module-messages.config';
import { FeesCalculationService } from '../../services/fees-calculation.service';
import { FeeBreakdownComponent, SelectionQuoteSummary } from './fee-breakdown.component';
import { InrPaisePipe, InrPipe, formatInr } from '../../pipes/inr.pipe';
import { LoggerService } from '../../services/logger.service';
import { SchoolService } from '../../services/school.service';
import { AcademicSessionService } from '../../services/academic-session.service';
import { take } from 'rxjs/operators';
import { ParentPortalService } from '../../services/parent-portal.service';
import { ParentChildContextComponent } from '../parent-child-context/parent-child-context.component';
import { PendingConfirmation } from '../../interfaces/pending-confirmation';
import {
  CONFIRMING_COPY, NEEDS_REVIEW_COPY, ONLINE_PAYMENT_UNAVAILABLE_COPY, manualRetryLaterCopy, serverMessage,
} from '../../utils/payment-conflict.util';
import { ChildAccess } from '../../interfaces/parent-portal';
import { emptyPaymentData, monthSelectionString, paymentDataFromQuote } from '../../utils/fee-payment.util';
import { paiseToRupees, remainingDuePaise, rupeesToPaise } from '../../utils/fee-money.util';
import { FeeMonthPresentation, feeMonthPresentation } from '../../utils/fee-month-state.util';
import { LocalPendingPayment, localPendingPayment, reconcilePendingConfirmations } from '../../utils/pending-payment.util';

export interface FeeLineItem {
  name: string;
  /** Rupees, from the backend's per-fee-head month breakdown. */
  amount: number;
}

export interface MonthViewModel extends StudentFee {
  monthNumber: number;
  name: string;
  /** Backend-computed school fee for this month in rupees (baseAmountDue, net of any discount). */
  fee: number;
  /** Backend-computed bus fee for this month in rupees (busFeeDue). */
  busFee: number;
  selected: boolean;
  /** True when baseAmountDue is null or snapshotStatus isn't COMPUTED — the amount shown is
   * NOT confidently known. Never treated as ₹0; selection is disabled for such months. */
  amountUnavailable: boolean;
  /** An online payment for this month was taken but isn't recorded yet: the month is shown as
   * being confirmed / needing review and can't be selected for payment. */
  pendingConfirmation?: PendingConfirmation | null;
}

/** Fee-head lines for ONE selected month. Selection-wide money (late fee, leave charges,
 * convenience fee, total) comes only from the checkout quote — see SelectionQuoteSummary. */
export interface MonthBreakdownDetails {
  studentId: string;
  studentClass: string;
  studentName: string;
  monthName: string;
  /** Built from the backend's authoritative StudentFeesLineItem breakdown (fee-head name +
   * gross, and a following discount row when that fee head had one). Never computed from
   * baseAmountDue/discountAmount on the client. */
  feeLineItems: FeeLineItem[];
  /** True when the backend has no per-fee-head breakdown for this month (a historical row
   * generated before line items existed) — show "breakdown unavailable" rather than inventing
   * components. feeLineItems may still carry a single trusted-total row in this case. */
  breakdownUnavailable: boolean;
}

/** Whether the fee ledger (sessions + month rows) was read: 'loading' until the first answer for
 * the current student/session, 'ready' after a successful read (rows or a genuine []), 'failed'
 * when that read failed. A failed read is never shown as "no fees". */
export type FeeLedgerState = 'loading' | 'ready' | 'failed';
/** What the month area shows. Rows from an earlier successful read of the SAME context stay
 * visible while refreshing and after a failed refresh (marked stale and not selectable). */
export type FeeLedgerDisplay = 'loading' | 'error' | 'empty' | 'rows';

/**
 * The fee screen. Shared by the web and Android clients — keep the TypeScript identical
 * (templates and styles are per platform). Money rules:
 *  - The backend checkout quote for the CURRENT selection is the only source of payable amounts
 *    (paise); nothing is priced here — leave charges included (the quote's additionalChargesPaise).
 *  - Row amounts (StudentFee) are rupees and are compared in integer paise.
 *  - Nothing can be paid until the current selection has a current, fully resolved quote.
 */
@Component({
  selector: 'app-payment-tracker',
  standalone: true,
  imports: [
    ComingSoonComponent,
    FormsModule,
    CommonModule,
    PaymentComponent,
    MatFormFieldModule,
    MatInputModule,
    FeeBreakdownComponent,
    ParentChildContextComponent,
    InrPipe,
    InrPaisePipe,
  ],
  templateUrl: './fees.component.html',
  styleUrls: ['./fees.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentTrackerComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private context$ = new Subject<void>();
  private quoteRequest$ = new Subject<void>();
  /** Fires when a parent switches child: cancels the previous child's in-flight fee reads. */
  private readonly childRequest$ = new Subject<void>();
  private contextVersion = 0;
  private quoteVersion = 0;
  sessions: AcademicSession[] = [];
  private initialized = false;
  quoteValid = false;
  quoteLoading = false;
  /** The current selection's quote (paise), for the payment summary; null whenever it changes. */
  quoteSummary: SelectionQuoteSummary | null = null;
  ledgerState: FeeLedgerState = 'loading';
  /** A same-context reload (after a payment, or Retry) is in flight with earlier rows on screen. */
  ledgerRefreshing = false;
  /** The latest same-context reload failed: the rows on screen may be out of date. */
  ledgerRefreshFailed = false;
  /** Which read failed, so Retry repeats the right one. */
  private ledgerFailedStep: 'sessions' | 'fees' | null = null;
  private ledgerVersion = 0;
  /** The online checkout attempt this screen started and still owns (null when none). Every
   * payment event is checked against it — student, session, months and attempt id. */
  activeCheckout: CheckoutAttemptIdentity | null = null;
  /** Razorpay reported a failed try for the active attempt; its window may still be open for retry. */
  checkoutFailureMessage: string | null = null;
  @ViewChild(PaymentComponent) private paymentComponent?: PaymentComponent;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
    private feesService: FeesService,
    private studentService: StudentService,
    private authService: AuthService,
    private authStateService: AuthStateService,
    private feesCalc: FeesCalculationService,
    private logger: LoggerService,
    private toast: ToastService,
    private schoolService: SchoolService,
    private academicSessionService: AcademicSessionService,
    private parentPortalService: ParentPortalService,
  ) {}

  comingSoonConfig = MODULE_MESSAGES.fees;
  showFeesModule: boolean = true;
  unpaidCurrentMonthName: string = '';
  pastUnpaidMonthNames: string[] = [];
  selectedYear: number = new Date().getFullYear();
  months: MonthViewModel[] = [];
  /** True once the current context's ledger was read successfully (rows or a genuine []). */
  get feesLoaded(): boolean {
    return this.ledgerState === 'ready';
  }

  get ledgerDisplay(): FeeLedgerDisplay {
    if (this.months.length > 0) return 'rows';
    if (this.ledgerState === 'failed') return 'error';
    return this.ledgerState === 'ready' ? 'empty' : 'loading';
  }

  /** Rows on screen are not a current, successful read (refreshing or refresh failed). */
  get ledgerStale(): boolean {
    return this.ledgerRefreshing || this.ledgerRefreshFailed;
  }
  /** Whole-selection total from the current quote, in PAISE (0 until a quote arrives). */
  totalPayablePaise: number = 0;
  selectedMonthsByYear: { [year: number]: number[] } = {};
  studentId: string = '';
  className: string = '';
  session: string = '';
  years: string[] = [];
  selectedMonthDetails: MonthBreakdownDetails | null = null;
  lastSelectedMonth: MonthViewModel | null = null;
  studentName: string = '';
  role: string = '';
  parentCanPay = false;
  /** Admin manual-payment form value, in RUPEES (what the office actually received). */
  manualPaymentAmount: number = 0;
  manualPaymentMode: ManualPaymentRequest['paymentMode'] = 'CASH';
  manualPaymentReference: string = '';
  readonly manualPaymentModes: ManualPaymentRequest['paymentMode'][] = [
    'CASH',
    'CHEQUE',
    'BANK_TRANSFER',
    'UPI',
    'OTHER',
  ];
  isLoadingPayment: boolean = false;
  /** No online payment route for this school (quote onlinePaymentAvailable=false, or a 409 from
   * the quote/order): the Pay button is replaced by an explanation, never a retry prompt. Manual
   * recording by the office is unaffected. */
  onlinePaymentUnavailable: boolean = false;
  onlinePaymentUnavailableMessage: string | null = null;
  readonly onlinePaymentUnavailableCopy = ONLINE_PAYMENT_UNAVAILABLE_COPY;
  /** A checkout for these months was started recently (409 retryAfter): explained until the
   * selection changes. */
  retryNotice: string | null = null;
  /** Online payments taken but not yet recorded: the server's list plus this screen's own
   * just-taken payment until the server lists it (see utils/pending-payment.util.ts). */
  pendingConfirmations: PendingConfirmation[] = [];
  private serverPendingConfirmations: PendingConfirmation[] = [];
  /** This screen's own payment that verification couldn't confirm yet. */
  localPendingPayment: LocalPendingPayment | null = null;
  readonly confirmingCopy = CONFIRMING_COPY;
  readonly needsReviewCopy = NEEDS_REVIEW_COPY;

  currentMonth = new Date().getMonth() + 1;
  academicCurrentMonth: number = 0;
  currentAcademicYear: string = '';
  paymentData: PaymentData = emptyPaymentData();

  monthLabel(month: number): string {
    return feeMonthLabel(this.sessions.find(s => s.label === this.session)?.startDate, month);
  }

  ngOnInit() {
    this.paymentData = this.feesCalc.createEmptyPaymentData();
    this.role = this.authService.getUserRole();
    this.route.params.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      const studentIdFromParams = params['studentId'];
      if (studentIdFromParams && this.studentId !== studentIdFromParams) {
        this.studentId = studentIdFromParams;
        if (this.initialized) { this.fetchSessions(); if (this.role === 'PARENT') this.loadParentChildAccess(); }
      }
    });
    if (this.role === 'STUDENT') this.getStudentId();
    if (this.role === 'PARENT') this.loadParentChildAccess();

    this.initialized = true;
    this.initCalendarState();
  }

  private initCalendarState(): void {
    this.academicSessionService.getAllSessions().pipe(take(1), takeUntil(this.destroy$)).subscribe({
      next: sessions => {
        this.sessions = sessions;
        this.currentAcademicYear = sessions.find(s => s.current)?.label ?? '';
        this.fetchSessions();
      },
      error: err => {
        this.logger.error('Session dates unavailable', err);
        this.fetchSessions();
      },
    });
  }

  ngOnDestroy(): void {
    this.activeCheckout = null;
    this.context$.next();
    this.quoteRequest$.next();
    this.destroy$.next();
    this.destroy$.complete();
  }

  private clearPaymentContext(): void {
    this.quoteRequest$.next();
    this.quoteVersion++;
    this.quoteValid = false;
    this.quoteSummary = null;
    this.quoteLoading = false;
    this.totalPayablePaise = 0;
    this.manualPaymentAmount = 0;
    this.selectedMonthDetails = null;
    this.lastSelectedMonth = null;
    this.onlinePaymentUnavailable = false;
    this.onlinePaymentUnavailableMessage = null;
    this.retryNotice = null;
    this.initPaymentData();
  }

  private resetContext(): void {
    this.context$.next();
    this.contextVersion++;
    // The student/session changed (e.g. a route change while a checkout was open): the old
    // attempt can no longer change anything here.
    this.abandonCheckout();
    this.ledgerVersion++;
    this.ledgerState = 'loading';
    this.ledgerRefreshing = false;
    this.ledgerRefreshFailed = false;
    this.ledgerFailedStep = null;
    this.clearPaymentContext();
    this.selectedMonthsByYear = {};
    this.months = [];
    this.pendingConfirmations = [];
    this.serverPendingConfirmations = [];
    this.localPendingPayment = null;
    this.pastUnpaidMonthNames = [];
    this.unpaidCurrentMonthName = '';
    this.cdr.markForCheck();
  }

  private abandonCheckout(): void {
    if (!this.activeCheckout && !this.isLoadingPayment) return;
    this.paymentComponent?.abandonAttempt();
    this.activeCheckout = null;
    this.checkoutFailureMessage = null;
    this.isLoadingPayment = false;
  }

  getStudentId(): void {
    this.studentId = this.authStateService.getUserId();
  }

  private loadParentChildAccess(): void {
    this.parentPortalService.getMyProfile().pipe(takeUntil(this.destroy$)).subscribe({
      next: profile => {
        const child = profile.children.find(item => item.studentId === this.studentId);
        if (!child) {
          // The child switcher shows this child is unavailable and offers the others.
          this.childRequest$.next();
          this.toast.error('Student unavailable', 'You no longer have access to this student.');
          return;
        }
        if (!child.canViewFees) {
          this.toast.error('Fee access unavailable', 'Please contact the school administrator.');
          return;
        }
        this.studentName = child.studentName;
        this.className = child.className;
        this.parentCanPay = child.canPayFees;
        this.cdr.markForCheck();
      },
      error: () => this.toast.error('Could not verify parent access', 'Please try again.'),
    });
  }

  onChildTabSelected(child: ChildAccess): void {
    if (!child.canViewFees) {
      this.toast.error('Fee access unavailable', 'Please contact the school administrator.');
      return;
    }
    if (this.isLoadingPayment) return;
    this.childRequest$.next();
    this.studentId = child.studentId;
    this.studentName = child.studentName;
    this.className = child.className;
    this.parentCanPay = child.canPayFees;
    this.router.navigate(['/dashboard/fees', child.studentId], { replaceUrl: true });
    this.fetchSessions();
    this.cdr.markForCheck();
  }

  fetchSessions(): void {
    this.resetContext();
    const version = this.ledgerVersion;
    this.feesService
      .getDistinctYearsByStudentId(this.studentId)
      .pipe(takeUntil(this.context$), takeUntil(this.destroy$), takeUntil(this.childRequest$))
      .subscribe({
        next: (sessions) => {
          if (version !== this.ledgerVersion) return;
          this.years = sessions;
          if (this.years.length > 0) {
            this.session = this.years.includes(this.session) ? this.session : this.years.includes(this.currentAcademicYear) ? this.currentAcademicYear : this.years[0];
            this.selectedYear = parseInt(this.session.split('-')[0]);
            this.cdr.markForCheck();
            this.fetchFees();
          } else {
            // No fee session is expected for a newly registered student until an admin
            // generates charges. Avoid requesting fees/attendance with an empty session.
            this.session = '';
            this.months = [];
            this.ledgerState = 'ready';
            this.cdr.markForCheck();
          }
        },
        error: (error) => {
          if (version !== this.ledgerVersion) return;
          this.logger.error('Error fetching sessions:', error);
          this.ledgerState = 'failed';
          this.ledgerFailedStep = 'sessions';
          this.cdr.markForCheck();
        },
      });
  }

  onYearChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    if (this.isLoadingPayment) return;
    this.session = select.value;
    this.selectedYear = parseInt(this.session.split('-')[0]);
    this.resetContext();
    this.fetchFees();
  }

  /** Reads the ledger for the current student + session. With rows already on screen for this
   * same context (after a payment, or Retry) it is a refresh: the rows stay, marked stale and not
   * selectable, until the read succeeds; a failed refresh keeps them and says so. Without rows it
   * is a first load. A context change (resetContext) always clears rows first. */
  fetchFees(): void {
    if (!this.session) {
      this.months = [];
      this.ledgerState = 'ready';
      this.cdr.markForCheck();
      return;
    }
    this.context$.next();
    this.clearPaymentContext();
    this.selectedMonthsByYear = {};
    for (const month of this.months) month.selected = false;
    const version = ++this.ledgerVersion;
    const refreshing = this.months.length > 0;
    if (!refreshing) this.ledgerState = 'loading';
    this.ledgerRefreshing = refreshing;
    this.ledgerRefreshFailed = false;
    this.ledgerFailedStep = null;
    this.academicCurrentMonth = feeAcademicMonth(this.sessions.find(s => s.label === this.session)?.startDate);
    this.cdr.markForCheck();

    forkJoin([
      this.feesService.getStudentFees(this.studentId, this.session),
      // Server state, so it survives reload, app restart and other devices. If it can't be read,
      // the server still refuses a second order for these months (409), and this screen's own
      // unconfirmed payment stays locked locally — a failed refresh never means "not paid".
      this.feesService.getPendingConfirmations(this.studentId, this.session).pipe(
        catchError((error) => {
          this.logger.error('Could not load pending payment confirmations:', error);
          return of([] as PendingConfirmation[]);
        }),
      ),
    ])
      .pipe(takeUntil(this.context$), takeUntil(this.destroy$), takeUntil(this.childRequest$))
      .subscribe({
        next: ([fees, pending]) => {
          if (version !== this.ledgerVersion) return;
          this.className = fees.length > 0 ? fees[0].className : '';
          const paidMonths = new Set(fees.filter((f) => f.paid).map((f) => f.month));
          this.applyPendingState(pending ?? [], paidMonths);
          this.dropPendingMonthsFromSelection();
          this.months = fees.map((fee) => this.buildMonthViewModel(fee));
          this.ledgerState = 'ready';
          this.ledgerRefreshing = false;
          this.ledgerRefreshFailed = false;
          this.checkAndDisplayFeeWarnings();
          this.cdr.markForCheck();
        },
        error: (error) => {
          if (version !== this.ledgerVersion) return;
          this.logger.error('Error fetching fees:', error);
          this.ledgerRefreshing = false;
          if (this.months.length > 0) {
            // Keep the last good rows for this same context; they stay unselectable until a
            // successful read. Never replaced by an empty ledger.
            this.ledgerRefreshFailed = true;
          } else {
            this.ledgerState = 'failed';
            this.ledgerFailedStep = 'fees';
          }
          this.cdr.markForCheck();
        },
      });
  }

  /** Retry after a failed ledger read. Only re-reads; never starts an order or a payment. */
  retryLedger(): void {
    if (this.isLoadingPayment) return;
    if (this.ledgerState === 'failed' && this.ledgerFailedStep === 'sessions') {
      this.fetchSessions();
      return;
    }
    this.fetchFees();
  }

  /** Server list + this screen's unconfirmed payment, re-applied to every loaded month. */
  private applyPendingState(server: PendingConfirmation[], paidMonths: ReadonlySet<number>): void {
    this.serverPendingConfirmations = server;
    const reconciled = reconcilePendingConfirmations(server, this.localPendingPayment, paidMonths);
    this.pendingConfirmations = reconciled.confirmations;
    this.localPendingPayment = reconciled.local;
    for (const month of this.months) month.pendingConfirmation = this.pendingFor(month.month);
  }

  /** Reads the backend-computed snapshot directly off the fetched StudentFee row — no
   * client-side fee-rule recomputation. A row with no trustworthy snapshot (baseAmountDue
   * null, or snapshotStatus isn't COMPUTED) is flagged amountUnavailable and never silently
   * shown/treated as ₹0. */
  private buildMonthViewModel(fee: StudentFee): MonthViewModel {
    const amountUnavailable =
      fee.baseAmountDue == null || fee.snapshotStatus !== 'COMPUTED';
    return {
      ...fee,
      monthNumber: fee.month,
      name: this.monthLabel(fee.month),
      selected: this.isMonthSelected(fee.month, this.selectedYear),
      fee: fee.baseAmountDue ?? 0,
      busFee: fee.busFeeDue ?? 0,
      amountUnavailable,
      amountUnavailableReason: fee.amountUnavailableReason || (fee.snapshotStatus === 'NO_ACTIVE_RULE_THIS_MONTH'
        ? 'No fee rule covers this billing month. Ask the school to review rule effective dates.'
        : 'This historical month has no verified amount snapshot. School review is required.'),
      pendingConfirmation: this.pendingFor(fee.month),
    };
  }

  /** The unresolved online payment covering {@code month}, if any. */
  pendingFor(month: number): PendingConfirmation | null {
    return this.pendingConfirmations.find((p) => p.months.includes(month)) ?? null;
  }

  /** Month names of a pending payment, for its notice. */
  pendingMonthNames(pending: PendingConfirmation): string {
    return pending.months.map((m) => this.monthLabel(m)).join(', ');
  }

  /** A month that is being confirmed can never stay selected (e.g. selected before a reload). */
  private dropPendingMonthsFromSelection(): void {
    const selected = this.selectedMonthsByYear[this.selectedYear];
    if (!selected?.length) return;
    const kept = selected.filter((m) => !this.pendingFor(m));
    if (kept.length !== selected.length) {
      this.selectedMonthsByYear[this.selectedYear] = kept;
      if (!kept.length) {
        this.lastSelectedMonth = null;
        this.selectedMonthDetails = null;
      }
      this.recalculateTotals();
    }
  }

  /** selectedYear/currentYear here only ever gate WHICH warnings are shown (display), never
   * an amount — the late fee itself always comes from the backend checkout quote. If no current
   * session is configured, both comparisons below are false and this falls through to treating
   * the viewed session as current — a deliberate, safe default. */
  checkAndDisplayFeeWarnings(): void {
    if (this.role === 'STUDENT') {
      const selectedYear = this.feesCalc.getSessionStartYear(this.session);
      const currentYear = this.feesCalc.getSessionStartYear(
        this.currentAcademicYear,
      );

      if (selectedYear > currentYear) {
        this.pastUnpaidMonthNames = [];
        this.unpaidCurrentMonthName = '';
        return;
      }

      const currentAcademicMonth = this.academicCurrentMonth;
      const currentMonthFee = this.months.find(
        (month) => month.monthNumber === currentAcademicMonth,
      );

      this.unpaidCurrentMonthName =
        currentMonthFee && !currentMonthFee.paid
          ? this.monthLabel(currentMonthFee.monthNumber)
          : '';

      this.pastUnpaidMonthNames = this.months
        .filter(
          (month) => !month.paid && month.monthNumber < currentAcademicMonth,
        )
        .map((m) => this.monthLabel(m.monthNumber));
    }
    this.cdr.markForCheck();
  }

  isMonthSelected(monthNumber: number, year: number): boolean {
    return this.selectedMonthsByYear[year]?.includes(monthNumber) || false;
  }

  /** Backend-authoritative recompute: whenever the selection changes, fetch the checkout quote
   * for every currently-selected month and use its amounts as-is. Older replies are ignored. */
  private recalculateTotals(): void {
    const selectedMonths = [...(this.selectedMonthsByYear[this.selectedYear] || [])];
    this.quoteRequest$.next();
    const version = ++this.quoteVersion;
    this.quoteValid = false;
    this.quoteSummary = null;
    this.quoteLoading = selectedMonths.length > 0;
    this.totalPayablePaise = 0;
    this.manualPaymentAmount = 0;
    this.retryNotice = null;
    this.initPaymentData();
    if (selectedMonths.length === 0) {
      this.cdr.markForCheck();
      return;
    }

    this.onlinePaymentUnavailable = false;
    this.onlinePaymentUnavailableMessage = null;
    this.feesService
      .getCheckoutQuote(this.studentId, this.session, selectedMonths)
      .pipe(takeUntil(this.quoteRequest$), takeUntil(this.context$), takeUntil(this.destroy$), takeUntil(this.childRequest$))
      .subscribe({
        next: quote => {
          if (version !== this.quoteVersion) return;
          this.quoteLoading = false;
          this.applyCheckoutQuote(quote, selectedMonths);
        },
        error: (error) => {
          if (version !== this.quoteVersion) return;
          this.quoteLoading = false;
          this.logger.error('Error fetching checkout quote:', error);
          if (error?.status === 409 && this.role !== 'ADMIN') {
            // No online payment route / pricing for this school right now — explain, don't retry.
            this.markOnlinePaymentUnavailable(serverMessage(error));
            return;
          }
          this.cdr.markForCheck();
          this.toast.error(
            'Error',
            'Could not calculate the payment amount. Please try again.',
          );
        },
      });
  }

  private applyCheckoutQuote(
    quote: CheckoutQuote,
    selectedMonths: number[],
  ): void {
    if (quote.unresolvedMonths?.length) {
      this.logger.error(
        'Checkout quote has unresolved months:',
        quote.unresolvedMonths,
      );
      this.toast.error(
        'Error',
        'The fee amount for one or more selected months could not be determined. Please contact the school office.',
      );
      this.cdr.markForCheck();
      return;
    }

    // No connected Razorpay account and no temporary fallback: fees are shown, online payment isn't.
    if (quote.onlinePaymentAvailable === false && this.role !== 'ADMIN') {
      this.markOnlinePaymentUnavailable(null);
    }

    // Every amount below is copied from the quote, in paise — never recomputed.
    const leaveChargesPaise = quote.additionalChargesPaise ?? 0;
    const lateFeePaise = quote.lateFeePaise ?? 0;
    this.quoteValid = true;
    this.totalPayablePaise = quote.totalPayablePaise;
    this.quoteSummary = {
      monthNames: [...selectedMonths].sort((a, b) => a - b).map((m) => this.monthLabel(m)),
      schoolFeePaise: quote.schoolFeePaise - leaveChargesPaise - lateFeePaise,
      lateFeePaise,
      leaveChargesPaise,
      convenienceFeePaise: quote.onlineConvenienceFeePaise,
      totalPaise: quote.totalPayablePaise,
    };
    // Manual collection is the school amount only — the online convenience fee is never
    // collected in person (schoolFeePaise already includes late fee and leave charges).
    if (this.role === 'ADMIN') this.manualPaymentAmount = paiseToRupees(quote.schoolFeePaise);

    const busFeeRupees = selectedMonths.reduce(
      (sum, m) => sum + (this.months.find((mm) => mm.month === m)?.busFee || 0), 0);
    this.paymentData = paymentDataFromQuote(quote, {
      studentId: this.studentId,
      studentName: this.studentName,
      className: this.className,
      session: this.session,
      months: selectedMonths,
      busFeeRupees,
    });

    this.cdr.markForCheck();
  }

  toggleMonthSelection(month: MonthViewModel): void {
    if (month.paid || this.isLoadingPayment || this.ledgerStale || month.amountUnavailable || month.pendingConfirmation) return;

    const year = this.selectedYear;
    if (!this.selectedMonthsByYear[year]) {
      this.selectedMonthsByYear[year] = [];
    }

    const index = this.selectedMonthsByYear[year].indexOf(month.month);
    if (index === -1) {
      this.selectedMonthsByYear[year].push(month.month);
      this.cdr.markForCheck();
      this.lastSelectedMonth = month;
      month.selected = true;

      this.recalculateTotals();
      this.populateMonthDetails(month)
        .catch((error) => {
          this.logger.error('Error during populateMonthDetails:', error);
        });
    } else {
      this.selectedMonthsByYear[year].splice(index, 1);
      this.cdr.markForCheck();
      this.recalculateTotals();

      if (this.lastSelectedMonth === month) {
        const remaining = this.selectedMonthsByYear[year];
        if (remaining.length > 0) {
          const lastIndex = remaining[remaining.length - 1];
          const lastMonth = this.months.find((m) => m.month === lastIndex);
          if (lastMonth) {
            this.lastSelectedMonth = lastMonth;
            this.populateMonthDetails(lastMonth);
          } else {
            this.selectedMonthDetails = null;
            this.lastSelectedMonth = null;
          }
        } else {
          this.selectedMonthDetails = null;
          this.lastSelectedMonth = null;
        }
      }
    }
    month.selected = this.isMonthSelected(month.month, this.selectedYear);
  }

  /** Builds the month's fee-head lines from the backend's authoritative per-fee-head breakdown.
   * Never fabricates a breakdown for a historical month with no line items: falls back to the
   * trusted total (schoolFeeDue) alone when available, or to nothing at all when even the total
   * is genuinely unknown. */
  private buildFeeLineItems(breakdown: MonthFeeBreakdown | null): {
    feeLineItems: FeeLineItem[];
    breakdownUnavailable: boolean;
  } {
    if (breakdown?.lineItemBreakdownAvailable) {
      const feeLineItems: FeeLineItem[] = [];
      for (const li of breakdown.lineItems) {
        feeLineItems.push({ name: li.feeHeadName, amount: li.grossAmount });
        if (li.discountAmount) {
          feeLineItems.push({
            name: `${li.feeHeadName} Discount`,
            amount: -li.discountAmount,
          });
        }
      }
      return { feeLineItems, breakdownUnavailable: false };
    }
    if (breakdown?.schoolFeeDue != null) {
      return {
        feeLineItems: [
          {
            name: 'School Fee (breakdown unavailable)',
            amount: breakdown.schoolFeeDue,
          },
        ],
        breakdownUnavailable: true,
      };
    }
    return { feeLineItems: [], breakdownUnavailable: true };
  }

  populateMonthDetails(month: MonthViewModel): Promise<void> {
    const context = this.contextVersion;
    return new Promise((resolve) => {
      const student$ = this.role === 'PARENT'
        ? of({ name: this.studentName || this.studentId, className: this.className || '' })
        : this.studentService.getStudent(this.studentId);
      forkJoin({
        student: student$,
        breakdown: this.feesService
          .getMonthFeeBreakdown(this.studentId, this.session, month.month)
          .pipe(
            catchError((error) => {
              this.logger.error('Error fetching month fee breakdown:', error);
              return of(null);
            }),
          ),
      })
        .pipe(takeUntil(this.context$), takeUntil(this.destroy$), takeUntil(this.childRequest$))
        .subscribe({
          next: ({ student, breakdown }) => {
            if (context !== this.contextVersion || this.lastSelectedMonth !== month || !this.isMonthSelected(month.month, this.selectedYear)) { resolve(); return; }
            this.studentName = student.name;
            if (this.quoteValid) this.paymentData = { ...this.paymentData, studentName: student.name };
            const { feeLineItems, breakdownUnavailable } =
              this.buildFeeLineItems(breakdown);
            this.selectedMonthDetails = {
              studentId: this.studentId,
              studentClass: student.className,
              studentName: this.studentName,
              monthName: month.name,
              feeLineItems,
              breakdownUnavailable,
            };
            this.cdr.markForCheck();
            resolve();
          },
          error: (error) => {
            this.logger.error('Error populating month details:', error);
            this.selectedMonthDetails = null;
            this.cdr.markForCheck();
            resolve();
          },
        });
    });
  }

  /** A checkout attempt started for the selection on screen: this screen now owns it. */
  onPaymentProcessingStarted(attempt: CheckoutAttemptIdentity): void {
    this.ngZone.run(() => {
      if (attempt.studentId !== this.studentId || attempt.session !== this.session) {
        // Not this screen's student/session (should not happen): it must not run from here.
        this.paymentComponent?.abandonAttempt();
        return;
      }
      this.activeCheckout = attempt;
      this.checkoutFailureMessage = null;
      this.isLoadingPayment = true;
      this.cdr.markForCheck();
    });
  }

  /** True only for an event of the attempt this screen started, for the student, session and
   * months it still shows. Anything else (an abandoned or older attempt) is ignored. */
  private ownsAttempt(attempt: CheckoutAttemptIdentity | null | undefined, months?: readonly number[]): boolean {
    const active = this.activeCheckout;
    if (!active || !attempt || attempt.attemptId !== active.attemptId) return false;
    if (attempt.studentId !== this.studentId || attempt.session !== this.session) return false;
    if (!sameMonths(attempt.months, active.months)) return false;
    return !months || sameMonths(months, active.months);
  }

  /** The attempt is over: release the screen's lock exactly once. */
  private endCheckout(): void {
    this.activeCheckout = null;
    this.checkoutFailureMessage = null;
    this.isLoadingPayment = false;
  }

  onPaymentProcessCompleted(attempt: CheckoutAttemptIdentity): void {
    this.ngZone.run(() => {
      if (!this.ownsAttempt(attempt)) return;
      this.endCheckout();
      this.cdr.detectChanges();
    });
  }

  /** Razorpay reported a failed try; its window may stay open for another try, so the attempt —
   * and the lock on Pay, months, session and child — stays until it really ends. */
  onPaymentAttemptFailed(event: PaymentAttemptFailedEvent): void {
    this.ngZone.run(() => {
      if (!this.ownsAttempt(event.attempt)) return;
      this.checkoutFailureMessage = event.message;
      this.cdr.markForCheck();
    });
  }

  /** Order creation was refused (409) because online payment isn't available for this school. */
  onOnlinePaymentUnavailable(event: OnlinePaymentUnavailableEvent): void {
    this.ngZone.run(() => {
      if (!this.ownsAttempt(event.attempt)) return;
      this.endCheckout();
      this.markOnlinePaymentUnavailable(event.message);
      this.cdr.detectChanges();
    });
  }

  /** Money may have been taken but isn't confirmed yet: lock those months locally right away,
   * then reload the server state. They stay locked until the server lists the payment or shows
   * the months paid — never unlocked just because a refresh failed. */
  onPaymentPending(event: PendingPaymentEvent): void {
    this.ngZone.run(() => {
      if (!this.ownsAttempt(event.attempt, event.months)) return;
      this.endCheckout();
      this.localPendingPayment = localPendingPayment(event.paymentId, event.months) ?? this.localPendingPayment;
      this.applyPendingState(this.serverPendingConfirmations, new Set(this.months.filter((m) => m.paid).map((m) => m.month)));
      this.reloadAfterEarlierPayment();
      this.cdr.detectChanges();
    });
  }

  /** The server refused a new order because of an earlier payment for these months. */
  onPaymentConflict(event: PaymentConflictEvent): void {
    this.ngZone.run(() => {
      if (!this.ownsAttempt(event.attempt)) return;
      this.endCheckout();
      const conflict = event.conflict;
      if (conflict.kind === 'pending') {
        this.localPendingPayment = localPendingPayment(conflict.paymentId, event.attempt.months) ?? this.localPendingPayment;
        this.reloadAfterEarlierPayment();
      } else if (conflict.kind === 'retry-later') {
        this.retryNotice = conflict.message;
      }
      this.cdr.detectChanges();
    });
  }

  /** Reload the server state, which now marks the months as being confirmed; clear the selection. */
  private reloadAfterEarlierPayment(): void {
    this.selectedMonthsByYear = {};
    this.lastSelectedMonth = null;
    this.selectedMonthDetails = null;
    this.totalPayablePaise = 0;
    this.initPaymentData();
    this.fetchFees();
  }

  private markOnlinePaymentUnavailable(message: string | null): void {
    this.onlinePaymentUnavailable = true;
    this.onlinePaymentUnavailableMessage = message;
    this.cdr.markForCheck();
  }

  handleSuccessfulPayment(event: PaymentSuccessEvent): void {
    this.ngZone.run(() => {
      if (!this.ownsAttempt(event.attempt)) return;
      this.endCheckout();
      this.localPendingPayment = null;
      this.initPaymentData();
      this.fetchFees();
      this.selectedMonthsByYear = {};
      this.totalPayablePaise = 0;
      this.cdr.detectChanges();

      this.toast.success(
        'Payment Successful!',
        'Your payment has been processed successfully.',
      );
    });
  }

  initPaymentData(): void {
    this.paymentData = this.feesCalc.createEmptyPaymentData();
  }

  /** The quote's leave charges, which a manual payment always includes in full (never editable here). */
  get manualLeaveChargesPaise(): number {
    return this.quoteSummary?.leaveChargesPaise ?? 0;
  }

  /** Submits only what the admin observed (student, months, amount received, mode,
   * reference) plus the quote's leave charges — the backend recomputes the authoritative amount
   * owed and the leave charges, refuses the payment when either disagrees, covers the leave
   * charges first and allocates the rest to the months. A partial receipt stays outstanding;
   * unresolved months and duplicate references are rejected by the backend. */
  markAsManuallyPaid(): void {
    const selectedMonths = this.selectedMonthsByYear[this.selectedYear] || [];
    if (
      this.role !== 'ADMIN' ||
      !this.quoteValid || this.quoteLoading ||
      !this.manualPaymentAmount ||
      !selectedMonths.length
    ) {
      this.toast.warning(
        'Warning',
        'Please select months and enter the amount received.',
      );
      return;
    }

    const leaveChargesPaise = this.manualLeaveChargesPaise;
    const amountPaise = rupeesToPaise(this.manualPaymentAmount);
    if (leaveChargesPaise > 0 && amountPaise <= leaveChargesPaise) {
      this.toast.warning('Warning',
        `The amount received must cover the leave charges of ${formatInr(paiseToRupees(leaveChargesPaise))} and part of the fee.`);
      return;
    }
    if (this.quoteSummary && amountPaise > this.totalPayablePaise) {
      this.toast.warning('Warning',
        `The amount received is more than the ${formatInr(paiseToRupees(this.totalPayablePaise))} due for the selected months.`);
      return;
    }

    const context = this.contextVersion;
    const quoteVersion = this.quoteVersion;
    const breakdown = leaveChargesPaise > 0
      ? ` (${formatInr(paiseToRupees(amountPaise - leaveChargesPaise))} fee + ${formatInr(paiseToRupees(leaveChargesPaise))} leave charges)`
      : '';
    this.toast
      .confirm({
        title: 'Confirm Manual Payment',
        message: `Record a payment for selected months with an amount of ${formatInr(this.manualPaymentAmount)}${breakdown}?`,
        icon: 'warning',
        confirmText: 'Record payment',
        cancelText: 'Cancel',
      })
      .then((confirmed) => {
        if (!confirmed || context !== this.contextVersion || quoteVersion !== this.quoteVersion || !this.quoteValid) return;

        const request: ManualPaymentRequest = {
          studentId: this.studentId,
          studentName: this.studentName,
          className: this.className,
          session: this.session,
          monthSelectionString: monthSelectionString(selectedMonths),
          amountReceived: this.manualPaymentAmount,
          paymentMode: this.manualPaymentMode,
          referenceNumber: this.manualPaymentReference?.trim() || undefined,
          additionalCharges: paiseToRupees(leaveChargesPaise),
        };

        this.feesService
          .recordManualPayment(request)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: () => {
              this.initPaymentData();
              this.fetchFees();
              this.selectedMonthsByYear = {};
              this.totalPayablePaise = 0;
              this.manualPaymentAmount = 0;
              this.manualPaymentReference = '';
              this.cdr.detectChanges();
              this.toast.success(
                'Payment recorded',
                'Balances have been updated from the recorded payment.',
              );
            },
            error: (err) => {
              const message =
                err?.error?.error || 'Failed to record manual payment.';
              if (err?.status === 409) {
                // An online payment for these months is being confirmed, needs review, or was just
                // started: the server's message tells the office what to check first.
                const retryAfter = err?.error?.retryAfter;
                this.toast.warning('Online payment in progress',
                  typeof retryAfter === 'string' ? manualRetryLaterCopy(retryAfter) : message);
                this.fetchFees();
                return;
              }
              this.toast.error('Error!', message);
            },
          });
      });
  }

  /** Display-only "late" styling gate — never affects the actual late fee amount charged
   * (that's always the backend checkout quote). */
  isLate(month: MonthViewModel): boolean {
    const selectedYear = this.feesCalc.getSessionStartYear(this.session);
    const currentYear = this.feesCalc.getSessionStartYear(
      this.currentAcademicYear,
    );

    if (selectedYear > currentYear) return false;
    if (selectedYear < currentYear) return !month.paid;

    return (
      !month.paid &&
      month.month <= this.academicCurrentMonth
    );
  }

  /** The month's shared display state (see utils/fee-month-state.util.ts). */
  presentation(month: MonthViewModel): FeeMonthPresentation {
    return feeMonthPresentation({
      paid: !!month.paid,
      amountUnavailable: month.amountUnavailable,
      pending: month.pendingConfirmation,
      selected: month.selected,
      late: this.isLate(month),
      amountPaidRupees: month.amountPaid,
    });
  }

  /** Some money allocated but the month isn't fulfilled: still payable, never shown as Paid. */
  isPartial(month: MonthViewModel): boolean {
    return this.presentation(month).partial;
  }

  trackByPaymentId(index: number, pending: PendingConfirmation): string {
    return `${pending.paymentId}:${pending.months.join(',')}`;
  }

  trackByMonth(index: number, month: MonthViewModel): number {
    return month.month;
  }
  trackByYear(index: number, year: string): string {
    return year;
  }
  trackByIndex(index: number): number {
    return index;
  }

  /** Maps the ledger-derived paymentProvenance value to a human-readable label. A paid month
   * with no provenance (a historical row predating the allocation ledger) falls back to the
   * generic "Paid" — never fabricates a specific mode it doesn't actually know. */
  private static readonly PROVENANCE_LABELS: Record<string, string> = {
    CASH: 'Cash',
    CHEQUE: 'Cheque',
    BANK_TRANSFER: 'Bank Transfer',
    UPI: 'UPI',
    OTHER: 'Other',
    RAZORPAY: 'Razorpay',
    MIXED: 'Mixed',
  };

  paymentProvenanceLabel(month: MonthViewModel): string {
    const provenance = month.paymentProvenance;
    if (!provenance) return 'Paid';
    return PaymentTrackerComponent.PROVENANCE_LABELS[provenance] ?? provenance;
  }

  /** The row's authoritative net amount paid in rupees, from the ledger-derived
   * StudentFees.amountPaid — never manualPaymentReceived, which is only the manual-sourced slice
   * of a row's funding. Reflects partial and full refunds. Never null for display. */
  netAmountPaid(month: MonthViewModel): number {
    return month.amountPaid ?? 0;
  }

  /** Rupees still owed on an UNPAID month card: gross snapshot due (fee + bus fee) minus what is
   * already allocated, never negative — computed in integer paise so paise survive exactly
   * (₹100.50 − ₹100.00 = ₹0.50). Late fee is only part of the selection's checkout quote. */
  remainingAmountDue(month: MonthViewModel): number {
    return paiseToRupees(remainingDuePaise(month.fee, month.busFee, month.amountPaid));
  }
}

function sameMonths(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort((x, y) => x - y);
  const sortedB = [...b].sort((x, y) => x - y);
  return sortedA.every((m, i) => m === sortedB[i]);
}
