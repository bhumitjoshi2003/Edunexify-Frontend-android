import { CheckoutQuote } from '../interfaces/checkout-quote';
import { CreateOrderRequest, PaymentData } from '../interfaces/payment-data';
import { paiseToRupees } from './fee-money.util';

/**
 * Builds and serializes the checkout draft. Shared by the web and Android clients — keep the two
 * copies identical. Every amount comes from the backend checkout quote; nothing here prices fees.
 */

/** "000110000000" for months [4, 5]. Months outside 1–12 are ignored. */
export function monthSelectionString(months: readonly number[]): string {
  const bits = Array.from({ length: 12 }, () => '0');
  for (const month of months) {
    if (Number.isInteger(month) && month >= 1 && month <= 12) bits[month - 1] = '1';
  }
  return bits.join('');
}

export function emptyPaymentData(): PaymentData {
  return {
    studentId: '',
    studentName: '',
    className: '',
    session: '',
    months: [],
    monthSelectionString: monthSelectionString([]),
    totalPayablePaise: 0,
    schoolFeePaise: 0,
    additionalChargesPaise: 0,
    lateFeePaise: 0,
    onlineConvenienceFeePaise: 0,
    legacyReceipt: {
      tuitionFeeRupees: 0,
      busFeeRupees: 0,
      annualChargesRupees: 0,
      labChargesRupees: 0,
      ecaProjectRupees: 0,
      examinationFeeRupees: 0,
    },
  };
}

export interface PaymentDraftContext {
  studentId: string;
  studentName: string;
  className: string;
  session: string;
  months: readonly number[];
  /** Sum of the selected months' bus fee, in rupees — only for the legacy receipt bucket. */
  busFeeRupees: number;
}

/** The checkout draft for a current, fully resolved quote. Money is copied, never recomputed. */
export function paymentDataFromQuote(quote: CheckoutQuote, context: PaymentDraftContext): PaymentData {
  const months = [...context.months].sort((a, b) => a - b);
  const additionalChargesPaise = quote.additionalChargesPaise ?? 0;
  const lateFeePaise = quote.lateFeePaise ?? 0;
  return {
    studentId: context.studentId,
    studentName: context.studentName,
    className: context.className,
    session: context.session,
    months,
    monthSelectionString: monthSelectionString(months),
    totalPayablePaise: quote.totalPayablePaise,
    schoolFeePaise: quote.schoolFeePaise,
    additionalChargesPaise,
    lateFeePaise,
    onlineConvenienceFeePaise: quote.onlineConvenienceFeePaise,
    legacyReceipt: {
      // The school fee alone (without leave charges / late fee), rounded to the backend's integer
      // rupee receipt column. Display-only on the server.
      tuitionFeeRupees: Math.round(paiseToRupees(quote.schoolFeePaise - additionalChargesPaise - lateFeePaise)),
      busFeeRupees: Math.round(context.busFeeRupees),
      annualChargesRupees: 0,
      labChargesRupees: 0,
      ecaProjectRupees: 0,
      examinationFeeRupees: 0,
    },
  };
}

/** The checkout draft can be sent: a student, at least one month, and a positive quoted total. */
export function isPayable(data: PaymentData | null | undefined): data is PaymentData {
  return !!data && !!data.studentId && data.months.length > 0
    && Number.isInteger(data.totalPayablePaise) && data.totalPayablePaise > 0;
}

/** The one place the backend's legacy key names are produced. Paise stay paise; no scaling. */
export function toCreateOrderRequest(data: PaymentData): CreateOrderRequest {
  return {
    totalAmount: data.totalPayablePaise,
    studentId: data.studentId,
    studentName: data.studentName,
    className: data.className,
    session: data.session,
    monthSelectionString: data.monthSelectionString,
    totalTuitionFee: data.legacyReceipt.tuitionFeeRupees,
    totalBusFee: data.legacyReceipt.busFeeRupees,
    totalAnnualCharges: data.legacyReceipt.annualChargesRupees,
    totalLabCharges: data.legacyReceipt.labChargesRupees,
    totalEcaProject: data.legacyReceipt.ecaProjectRupees,
    totalExaminationFee: data.legacyReceipt.examinationFeeRupees,
    additionalCharges: data.additionalChargesPaise,
    lateFees: data.lateFeePaise,
    platformFee: data.onlineConvenienceFeePaise,
  };
}
