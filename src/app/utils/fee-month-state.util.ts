import { PendingConfirmation } from '../interfaces/pending-confirmation';
import { optionalRupeesToPaise } from './fee-money.util';

/**
 * One fee month's display state. Shared by the web and Android clients — keep the two copies
 * identical, so both show the same state for the same row. Fulfilment comes only from the
 * backend `paid` flag; funding provenance never makes a part-paid month look paid; a month whose
 * amount isn't confirmed is never shown as ₹0 or as payable.
 */
export type FeeMonthStatus =
  | 'paid'          // fully fulfilled (backend paid = true)
  | 'confirming'    // an online payment for it is being confirmed with Razorpay
  | 'needs-review'  // an online payment for it needs school review
  | 'unavailable'   // amount not confirmed (no fee rule / no verified snapshot) — school review
  | 'selected'      // chosen for the current payment
  | 'partial'       // some money allocated, balance still owed
  | 'overdue'
  | 'due';

export interface FeeMonthFacts {
  paid: boolean;
  amountUnavailable: boolean;
  pending: PendingConfirmation | null | undefined;
  selected: boolean;
  late: boolean;
  /** Net amount already allocated to the row, in rupees (StudentFee.amountPaid). */
  amountPaidRupees: number | null | undefined;
}

export interface FeeMonthPresentation {
  status: FeeMonthStatus;
  /** Primary chip text. */
  chip: string;
  /** Overdue shown as a second, smaller chip when another state leads (unknown amount, part-paid). */
  secondaryOverdue: boolean;
  /** Some money allocated but not fulfilled. */
  partial: boolean;
  /** May be chosen for an online or manual payment. */
  selectable: boolean;
}

export function feeMonthPresentation(facts: FeeMonthFacts): FeeMonthPresentation {
  const partial = !facts.paid && (optionalRupeesToPaise(facts.amountPaidRupees) ?? 0) > 0;
  const base = { partial, secondaryOverdue: false, selectable: false };
  if (facts.paid) return { ...base, status: 'paid', chip: 'Paid' };
  if (facts.pending) {
    return facts.pending.status === 'NEEDS_REVIEW'
      ? { ...base, status: 'needs-review', chip: 'Needs review' }
      : { ...base, status: 'confirming', chip: 'Confirming' };
  }
  if (facts.amountUnavailable) {
    // Can't be paid until the school confirms the amount; overdue still visible, but secondary.
    return { ...base, status: 'unavailable', chip: 'Needs review', secondaryOverdue: facts.late };
  }
  if (facts.selected) return { ...base, status: 'selected', chip: 'Selected', selectable: true };
  if (partial) return { ...base, status: 'partial', chip: 'Partial', secondaryOverdue: facts.late, selectable: true };
  if (facts.late) return { ...base, status: 'overdue', chip: 'Overdue', selectable: true };
  return { ...base, status: 'due', chip: 'Due', selectable: true };
}
