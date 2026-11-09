/** Platform Admin (SUPER_ADMIN)-facing view of one payment pricing version. Unlike the
 * parent-facing checkout quote, this intentionally exposes the full gateway rate/tax/Edunexify
 * component split — these users manage the pricing model itself, never a school-scoped ADMIN. */
export interface PaymentPricingConfig {
  id: number;
  gatewayProvider: string;
  gatewayRateBps: number;
  gatewayTaxRateBps: number;
  edunexifyTransactionFeePaise: number;
  /** ISO-8601 instant with offset. */
  effectiveFrom: string;
  createdAt: string;
  createdBy: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  /** Derived server-side, against the same clock the pricing resolution itself uses. */
  status: 'CURRENT' | 'SCHEDULED' | 'HISTORICAL' | 'CANCELLED';
}

/** Request to schedule a new immutable pricing version — there is no "edit" request; changing
 * pricing is always a new version with a later effectiveFrom. */
export interface PaymentPricingConfigRequest {
  gatewayProvider: string;
  gatewayRateBps: number;
  gatewayTaxRateBps: number;
  edunexifyTransactionFeePaise: number;
  /** Null/omitted means "effective immediately", resolved against the server clock. */
  effectiveFrom?: string | null;
}
