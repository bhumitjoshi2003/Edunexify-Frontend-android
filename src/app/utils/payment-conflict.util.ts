import { PendingConfirmation } from '../interfaces/pending-confirmation';

/* Shared by the web and Android clients — keep the two copies identical. */

/** What a refused fee payment (HTTP 409 from order creation or manual payment) means for the UI. */
export type PaymentConflict =
  | { kind: 'pending'; status: PendingConfirmation['status']; paymentId: string | null; message: string }
  | { kind: 'retry-later'; retryAfter: string; message: string }
  | { kind: 'other'; message: string | null };

export const CONFIRMING_COPY = 'Payment received. We’re confirming it with Razorpay. Please don’t pay again.';
export const NEEDS_REVIEW_COPY =
  'This payment needs to be checked by the school before it can be recorded. Please don’t pay again — contact the school office.';
/** No online payment route (or online pricing) for this school — not a failure, not retryable now. */
export const ONLINE_PAYMENT_UNAVAILABLE_COPY =
  'Online payments are temporarily unavailable. Please contact the school office.';

/**
 * The server's human-readable explanation from an error body ({ error } / { message } / plain
 * text), or null. Long bodies (stack traces, HTML error pages) are never shown to a parent.
 */
export function serverMessage(error: any): string | null {
  const body = error?.error;
  const msg = typeof body === 'string' ? body : (body?.error ?? body?.message);
  return typeof msg === 'string' && msg.trim() && msg.length < 300 ? msg.trim() : null;
}

/**
 * retryAfter arrives as a timezone-less timestamp in the server's clock, which the backend pins to
 * Asia/Kolkata (IasManagementApplication sets the JVM default zone). It is never reinterpreted as
 * device-local time — a device outside India would show a wrong clock — so the time is shown as
 * it is, explicitly labelled IST.
 */
export function serverTime(value: string | null | undefined): string | null {
  const match = /T(\d{2}):(\d{2})/.exec(value ?? '');
  return match ? `${match[1]}:${match[2]} IST` : null;
}

export function retryLaterCopy(retryAfter: string): string {
  const at = serverTime(retryAfter);
  return `An online payment for these fees was started recently. Please ${at ? `wait until ${at}` : 'wait a few minutes'} `
    + 'or check the existing checkout before trying again.';
}

/** A manual payment refused because a parent's online checkout for these months may still be
 * completed. Built here (not the server's text) so the time is labelled IST like everywhere else. */
export function manualRetryLaterCopy(retryAfter: string): string {
  const at = serverTime(retryAfter);
  return 'An online payment for some of these months was started recently and may still be completed. '
    + `${at ? `Wait until ${at}` : 'Wait a few minutes'}, or check with the parent, before recording a manual payment.`;
}

/** Reads a 409 body: { error, pending?, paymentId?, status?, retryAfter? }. */
export function paymentConflict(error: any): PaymentConflict {
  const body = error?.error;
  const message = serverMessage(error);
  if (body?.pending === true) {
    const status: PendingConfirmation['status'] = body.status === 'NEEDS_REVIEW' ? 'NEEDS_REVIEW' : 'CONFIRMING';
    return {
      kind: 'pending', status, paymentId: typeof body.paymentId === 'string' ? body.paymentId : null,
      message: message || (status === 'NEEDS_REVIEW' ? NEEDS_REVIEW_COPY : CONFIRMING_COPY),
    };
  }
  if (typeof body?.retryAfter === 'string') {
    return { kind: 'retry-later', retryAfter: body.retryAfter, message: retryLaterCopy(body.retryAfter) };
  }
  return { kind: 'other', message };
}
