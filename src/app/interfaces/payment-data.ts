/**
 * Online fee payment contracts. Shared by the web and Android clients — keep the two copies
 * identical.
 *
 * PaymentData is what the fee screen hands to checkout for the CURRENT selection. Every money
 * field is integer PAISE copied unchanged from the backend checkout quote: the client never prices
 * anything, and the server recomputes the real charge when it creates the order. The legacy receipt
 * buckets are kept apart, in whole RUPEES, because the backend stores them as display-only integers.
 *
 * CreateOrderRequest is the wire body of POST /api/payments/create. Its key names (totalAmount,
 * additionalCharges, totalTuitionFee, ...) are fixed by the backend CreateOrderRequest DTO, so they
 * are produced in exactly one place — toCreateOrderRequest() in utils/fee-payment.util.ts.
 */
export interface PaymentData {
  studentId: string;
  studentName: string;
  className: string;
  classId?: number;
  session: string;
  /** Selected academic months (1 = the session's first month), ascending. */
  months: number[];
  /** 12-character academic-month bitmask for the same months ("100000000000" = month 1). */
  monthSelectionString: string;
  /** Whole-selection total the parent pays (quote.totalPayablePaise). */
  totalPayablePaise: number;
  /** School amount: school fee + leave charges + late fee (quote.schoolFeePaise). */
  schoolFeePaise: number;
  /** Leave-related charges included in schoolFeePaise (quote.additionalChargesPaise). */
  additionalChargesPaise: number;
  /** Late fee included in schoolFeePaise (quote.lateFeePaise). */
  lateFeePaise: number;
  /** Online convenience fee on top of the school amount (quote.onlineConvenienceFeePaise). */
  onlineConvenienceFeePaise: number;
  /** Display-only receipt buckets the backend still stores on the order. */
  legacyReceipt: LegacyReceiptBuckets;
}

/** Whole RUPEES. Stored on the order for old-style receipts; never used to price or charge. */
export interface LegacyReceiptBuckets {
  tuitionFeeRupees: number;
  busFeeRupees: number;
  annualChargesRupees: number;
  labChargesRupees: number;
  ecaProjectRupees: number;
  examinationFeeRupees: number;
}

/** Body of POST /api/payments/create — key names and units fixed by the backend DTO. */
export interface CreateOrderRequest {
  /** PAISE, integer ≥ 1. The server validates it, then prices the order itself. */
  totalAmount: number;
  studentId: string;
  studentName: string;
  className: string;
  session: string;
  monthSelectionString: string;
  /** Legacy receipt buckets — whole RUPEES, display-only on the server. */
  totalTuitionFee: number;
  totalBusFee: number;
  totalAnnualCharges: number;
  totalLabCharges: number;
  totalEcaProject: number;
  totalExaminationFee: number;
  /** PAISE — informational only; the server recomputes leave charges itself. */
  additionalCharges: number;
  /** PAISE — informational only; the server recomputes the late fee itself. */
  lateFees: number;
  /** PAISE — informational only; the server recomputes the convenience fee itself. */
  platformFee: number;
}
