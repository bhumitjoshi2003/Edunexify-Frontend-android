import { DOCUMENT } from '@angular/common';
import { Inject, Injectable } from '@angular/core';

/**
 * Loads Razorpay Checkout on demand. Shared by the web and Android clients — keep the two copies
 * identical (the Android WebView loads the same script).
 *
 *  - Bounded: load() always settles — it rejects after RAZORPAY_LOAD_TIMEOUT_MS instead of leaving a
 *    payment stuck in "processing" when the CDN is slow or blocked.
 *  - Retryable: a failed or timed-out script tag is removed, so the next attempt starts fresh.
 *  - Verified: a script that "loads" without defining window.Razorpay counts as a failure.
 */

export interface RazorpayCheckoutInstance {
  open(): void;
  on?(event: string, handler: (response: any) => void): void;
}
export type RazorpayConstructor = new (options: any) => RazorpayCheckoutInstance;

export const RAZORPAY_CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';
export const RAZORPAY_SCRIPT_ID = 'razorpay-checkout-js';
export const RAZORPAY_LOAD_TIMEOUT_MS = 15000;

export type RazorpayUnavailableReason = 'error' | 'timeout' | 'missing-global' | 'no-document';

export class RazorpayCheckoutUnavailableError extends Error {
  constructor(readonly reason: RazorpayUnavailableReason) {
    super(`Razorpay Checkout unavailable (${reason})`);
  }
}

@Injectable({ providedIn: 'root' })
export class RazorpayCheckoutService {
  private inFlight: Promise<RazorpayConstructor> | null = null;

  constructor(@Inject(DOCUMENT) private document: Document) {}

  load(timeoutMs: number = RAZORPAY_LOAD_TIMEOUT_MS): Promise<RazorpayConstructor> {
    const ready = this.razorpayGlobal();
    if (ready) return Promise.resolve(ready);
    if (this.inFlight) return this.inFlight;
    const attempt = this.loadScript(timeoutMs);
    this.inFlight = attempt;
    const forget = () => { if (this.inFlight === attempt) this.inFlight = null; };
    attempt.then(forget, forget);
    return attempt;
  }

  private loadScript(timeoutMs: number): Promise<RazorpayConstructor> {
    return new Promise<RazorpayConstructor>((resolve, reject) => {
      const doc = this.document;
      if (!doc?.body || !doc.defaultView) {
        reject(new RazorpayCheckoutUnavailableError('no-document'));
        return;
      }
      let script = doc.getElementById(RAZORPAY_SCRIPT_ID) as HTMLScriptElement | null;
      if (script && script.getAttribute('data-state') === 'failed') {
        script.remove();
        script = null;
      }
      if (!script) {
        script = doc.createElement('script');
        script.id = RAZORPAY_SCRIPT_ID;
        script.src = RAZORPAY_CHECKOUT_SRC;
        script.async = true;
        doc.body.appendChild(script);
      }
      const tag = script;
      let settled = false;
      const settle = (ctor: RazorpayConstructor | null, reason: RazorpayUnavailableReason) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        tag.removeEventListener('load', onLoad);
        tag.removeEventListener('error', onError);
        if (ctor) {
          tag.setAttribute('data-state', 'loaded');
          resolve(ctor);
          return;
        }
        tag.setAttribute('data-state', 'failed');
        tag.remove();
        reject(new RazorpayCheckoutUnavailableError(reason));
      };
      const onLoad = () => {
        const ctor = this.razorpayGlobal();
        settle(ctor, 'missing-global');
      };
      const onError = () => settle(null, 'error');
      const timer = setTimeout(() => settle(null, 'timeout'), timeoutMs);
      tag.addEventListener('load', onLoad);
      tag.addEventListener('error', onError);
    });
  }

  private razorpayGlobal(): RazorpayConstructor | null {
    const ctor = (this.document?.defaultView as any)?.Razorpay;
    return typeof ctor === 'function' ? ctor : null;
  }
}
