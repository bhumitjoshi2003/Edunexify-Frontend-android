import { Pipe, PipeTransform } from '@angular/core';
import { paiseToRupees } from '../utils/fee-money.util';

/**
 * Rupees with Indian digit grouping (₹1,23,456) — whole rupees without decimals, any paise kept
 * to two places (₹1,234.50). A negative amount (a discount line) reads -₹500. Display only:
 * values are never rounded away or re-priced. A missing amount is a dash, never ₹0.
 *
 * Shared by the web and Android clients — keep the two copies identical.
 */
export function formatInr(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const magnitude = Math.abs(value);
  const whole = Math.abs(magnitude - Math.round(magnitude)) < 1e-9;
  const digits = magnitude.toLocaleString('en-IN', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  });
  return (value < 0 && digits !== '0' ? '-' : '') + '₹' + digits;
}

/** The same format for an integer-paise amount (checkout quote / payment record fields). */
export function formatInrPaise(paise: number | null | undefined): string {
  if (paise == null || !Number.isFinite(paise)) return '—';
  return formatInr(paiseToRupees(paise));
}

/** Rupee-domain values (StudentFee rows, fee-head breakdown lines, manual payment amounts). */
@Pipe({ name: 'inr', standalone: true, pure: true })
export class InrPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    return formatInr(value);
  }
}

/** Paise-domain values (checkout quote, payment summary). */
@Pipe({ name: 'inrPaise', standalone: true, pure: true })
export class InrPaisePipe implements PipeTransform {
  transform(paise: number | null | undefined): string {
    return formatInrPaise(paise);
  }
}
