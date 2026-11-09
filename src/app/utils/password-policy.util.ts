import { AbstractControl, ValidationErrors } from '@angular/forms';

/**
 * The password-strength rule, mirrored from the backend (util/PasswordPolicy.java), which stays
 * authoritative. Shared by the web and Android clients — keep the two copies identical.
 *
 * Rule: at least 8 characters, with at least one uppercase letter (A–Z), one lowercase letter
 * (a–z) and one digit (0–9). The password is checked and sent exactly as typed — never trimmed or
 * otherwise changed — so leading/trailing spaces are part of the password.
 */
export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_RULE_HINT = 'At least 8 characters, with an uppercase letter, a lowercase letter and a number.';

/** The first rule the password breaks ("<subject> must …"), or null when it is acceptable. */
export function passwordPolicyViolation(password: string | null | undefined, subject = 'Password'): string | null {
  if (!password || password.length < PASSWORD_MIN_LENGTH) return `${subject} must be at least ${PASSWORD_MIN_LENGTH} characters long.`;
  if (!/[A-Z]/.test(password)) return `${subject} must contain at least one uppercase letter.`;
  if (!/[a-z]/.test(password)) return `${subject} must contain at least one lowercase letter.`;
  if (!/[0-9]/.test(password)) return `${subject} must contain at least one digit.`;
  return null;
}

/** Reactive-forms validator for the same rule: `{ passwordPolicy: '<message>' }` when broken. An
 * empty value is left to Validators.required. */
export function passwordPolicyValidator(control: AbstractControl): ValidationErrors | null {
  const value = control.value;
  if (value === null || value === undefined || value === '') return null;
  const violation = passwordPolicyViolation(String(value));
  return violation ? { passwordPolicy: violation } : null;
}
