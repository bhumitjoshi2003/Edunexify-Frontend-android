/**
 * Fee money units, made explicit. Shared by the web and Android clients — keep the two copies
 * identical.
 *
 *  - PAISE (integers): the backend checkout quote, create-order/verify payloads, payment records.
 *  - RUPEES (decimals): StudentFee rows (baseAmountDue, busFeeDue, amountPaid), fee-head breakdown
 *    lines, the admin manual-payment amount — the backend sends/accepts these as BigDecimal rupees.
 *
 * Convert only through these helpers — never `* 100` or `/ 100` inline — so a value can never be
 * scaled twice (the 100× bug) or rounded to whole rupees by accident. The backend stays the only
 * place money is priced; these helpers convert and compare, they never invent an amount.
 */

/** Integer paise → rupees for display (5887 → 58.87). */
export function paiseToRupees(paise: number): number {
  return paise / 100;
}

/** Rupees → integer paise (58.87 → 5887), absorbing binary floating-point noise. */
export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

/** A rupee value as exact paise, or null when it is missing / not a number. */
export function optionalRupeesToPaise(rupees: number | null | undefined): number | null {
  return rupees == null || !Number.isFinite(rupees) ? null : rupeesToPaise(rupees);
}

/**
 * What is still owed on one UNPAID month card, in paise: gross snapshot due (school fee + bus fee)
 * minus what is already allocated to the row, never negative. Done in integer paise so ₹100.50 −
 * ₹100.00 is exactly ₹0.50 (never 0.4999…). Late fee is not included — it is only part of the
 * backend checkout quote for a selection.
 */
export function remainingDuePaise(feeRupees: number | null | undefined, busFeeRupees: number | null | undefined,
                                  paidRupees: number | null | undefined): number {
  const gross = (optionalRupeesToPaise(feeRupees) ?? 0) + (optionalRupeesToPaise(busFeeRupees) ?? 0);
  return Math.max(0, gross - (optionalRupeesToPaise(paidRupees) ?? 0));
}
