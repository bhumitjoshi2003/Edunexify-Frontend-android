/**
 * Admin-submitted manual payment — mirrors ManualPaymentRequest on the Spring Boot side.
 * Carries only what the admin actually observed (student, months, amount received, mode,
 * reference); the backend re-derives the authoritative amount owed from each selected
 * month's StudentFees snapshot and validates amountReceived against it. The frontend must
 * never compute or submit a fee-component breakdown of its own; additionalCharges is copied
 * from the checkout quote and only confirms which leave charges the office collected.
 */
export interface ManualPaymentRequest {
  studentId: string;
  studentName: string;
  className: string;
  session: string;
  /** 12-char '0'/'1' bitmask, bit i = academic month i+1. */
  monthSelectionString: string;
  /** What the admin says was physically received, in rupees. */
  amountReceived: number;
  paymentMode: 'CASH' | 'CHEQUE' | 'BANK_TRANSFER' | 'UPI' | 'OTHER';
  referenceNumber?: string;
  /** The quote's leave charges (additionalChargesPaise) in rupees, included in amountReceived.
   * The backend recomputes them and refuses the payment when they differ. */
  additionalCharges?: number;
}
