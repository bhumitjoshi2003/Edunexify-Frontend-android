/**
 * Backend-authoritative checkout quote — mirrors CheckoutQuoteDto on the Spring Boot side. Shared
 * by the web and Android clients — keep the two copies identical.
 *
 * Every monetary value is integer PAISE computed server-side; the clients only display or copy
 * them, never recompute. A non-empty unresolvedMonths means the quote is partial (one or more
 * selected months' fee couldn't be confidently determined) — totalPayablePaise must not be treated
 * as covering those months, and nothing may be paid against it.
 *
 * schoolFeePaise is the parent-facing school aggregate: school fee due + leave charges
 * (additionalChargesPaise) + late fee (lateFeePaise). totalPayablePaise = schoolFeePaise +
 * onlineConvenienceFeePaise. On a school's own Razorpay gateway the convenience fee is 0.
 */
export interface CheckoutQuote {
  studentId: string;
  session: string;
  months: number[];
  schoolFeePaise: number;
  /** Leave-related charges included in schoolFeePaise. */
  additionalChargesPaise: number;
  /** Late fee included in schoolFeePaise. */
  lateFeePaise: number;
  onlineConvenienceFeePaise: number;
  totalPayablePaise: number;
  currency: 'INR' | string;
  unresolvedMonths: number[];
  /** false = no online payment route for this school (no connected Razorpay account and no
   * temporary Edunexify fallback): fees are shown but can only be paid offline. Absent/null for
   * ADMIN quotes. */
  onlinePaymentAvailable?: boolean | null;
}
