import { PendingConfirmation } from '../interfaces/pending-confirmation';

/**
 * Keeps a just-taken online payment visible until the server knows about it. Shared by the web
 * and Android clients — keep the two copies identical.
 *
 * When verification says "pending" (or can't be reached, or Razorpay's result was unreadable), this
 * screen remembers the payment ID and its months. Until the server's pending-confirmations list
 * includes that payment — or the months come back paid — those months are shown as being
 * confirmed and can't be selected again. A failed or slow refresh never turns them back into
 * "safe to pay": the backend still refuses a duplicate order, but the screen must not invite one.
 */
export interface LocalPendingPayment {
  /** Razorpay payment ID; null when Razorpay didn't return a readable one. */
  paymentId: string | null;
  months: number[];
}

export interface ReconciledPendingState {
  /** What the screen shows and locks: the server's list plus the local payment while unresolved. */
  confirmations: PendingConfirmation[];
  /** The local payment if it is still unresolved, otherwise null. */
  local: LocalPendingPayment | null;
}

export function localPendingPayment(paymentId: string | null | undefined, months: readonly number[]): LocalPendingPayment | null {
  const uniqueMonths = [...new Set(months)].filter((m) => Number.isInteger(m)).sort((a, b) => a - b);
  if (!uniqueMonths.length) return null;
  return { paymentId: paymentId?.trim() ? paymentId.trim() : null, months: uniqueMonths };
}

export function reconcilePendingConfirmations(server: readonly PendingConfirmation[],
                                              local: LocalPendingPayment | null,
                                              paidMonths: ReadonlySet<number>): ReconciledPendingState {
  const confirmations = [...server];
  if (!local) return { confirmations, local: null };
  // The server lists this payment: its state (CONFIRMING or NEEDS_REVIEW) governs from now on.
  if (local.paymentId && server.some((p) => p.paymentId === local.paymentId)) {
    return { confirmations, local: null };
  }
  const covered = new Set(server.flatMap((p) => p.months));
  const months = local.months.filter((m) => !paidMonths.has(m) && !covered.has(m));
  if (!months.length) return { confirmations, local: null };
  confirmations.push({ paymentId: local.paymentId ?? '', months, pendingSince: null, status: 'CONFIRMING' });
  return { confirmations, local };
}
