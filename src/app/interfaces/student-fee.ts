export type SnapshotStatus = 'COMPUTED' | 'NO_ACTIVE_RULE_THIS_MONTH';

export interface StudentFee {
  amountUnavailableReason?: string | null;
  id?: number;
  studentId: string;
  className: string;
  month: number;
  year: string;
  paid: boolean;
  manuallyPaid: boolean;
  manualPaymentReceived?: number;
  amountPaid?: number;
  takesBus?: boolean;
  distance?: number;

  /** Backend-computed, stable snapshot fields — the school's actual charge for this month,
   * computed once at generation time and never recomputed on read. baseAmountDue/busFeeDue
   * are null when the row predates the snapshot model (never treat null as ₹0 — see
   * snapshotStatus). discountAmount reflects any waiver/discount already applied. */
  baseAmountDue?: number | null;
  busFeeDue?: number | null;
  discountAmount?: number | null;
  amountComputedAt?: string | null;
  snapshotStatus?: SnapshotStatus | null;

  /** The row's true funding source, read from the payment-allocation ledger (not the coarse
   * manuallyPaid flag) — one of a manual payment mode ('CASH' | 'CHEQUE' | 'BANK_TRANSFER' |
   * 'UPI' | 'OTHER'), 'RAZORPAY', 'MIXED' (net-positive money from more than one source), or
   * null/undefined when nothing is currently net-allocated. See
   * StudentFeesService.computePaymentProvenance on the backend. */
  paymentProvenance?: string | null;
}
