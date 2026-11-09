/** An online fee payment that was taken but is not yet recorded (GET /api/payments/pending-confirmations).
 * CONFIRMING: Razorpay is still being asked; it will show as paid automatically.
 * NEEDS_REVIEW: automatic confirmation stopped; the school office has to resolve it.
 * Either way, its months must not be offered for payment again. */
export interface PendingConfirmation {
  paymentId: string;
  /** Academic months (1 = the school's first month), the same numbering as StudentFee.month. */
  months: number[];
  pendingSince: string | null;
  status: 'CONFIRMING' | 'NEEDS_REVIEW';
}
