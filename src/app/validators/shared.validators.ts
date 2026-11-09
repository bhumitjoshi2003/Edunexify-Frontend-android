import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** Stricter email: requires TLD */
export function strictEmailValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    if (!control.value) return null;
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(control.value.trim());
    return valid ? null : { invalidEmail: true };
  };
}

/** Required text that is more than whitespace (Validators.required accepts "   "). */
export function nonBlankValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null =>
    typeof control.value === 'string' && control.value.trim() === '' ? { required: true } : null;
}

/** 10-digit Indian mobile number */
export function phoneValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    if (!control.value) return null;
    const valid = /^[0-9]{10}$/.test(control.value.trim());
    return valid ? null : { invalidPhone: true };
  };
}

/** Date of birth must be in the past */
export function pastDateValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    if (!control.value) return null;
    const entered = new Date(control.value);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return entered < today ? null : { futureDate: true };
  };
}

/** Date must not be in the future (for leaving dates, etc.) */
export function notFutureDateValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    if (!control.value) return null;
    const entered = new Date(control.value);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return entered <= today ? null : { futureDate: true };
  };
}

/** Value must be >= 0 (for amounts, distances) */
export function nonNegativeValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    if (control.value === null || control.value === undefined || control.value === '') return null;
    return +control.value >= 0 ? null : { negative: true };
  };
}

/** Value must be > 0 */
export function positiveValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    if (control.value === null || control.value === undefined || control.value === '') return null;
    return +control.value > 0 ? null : { notPositive: true };
  };
}
