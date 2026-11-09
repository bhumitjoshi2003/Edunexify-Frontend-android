import { ConfirmDialogData } from '../services/toast.service';
import { environment } from '../../environments/environment';

/**
 * Super-admin school create/edit payloads, slug generation and the activation action. Shared by
 * the web and Android clients — keep the two copies identical, so equivalent edits serialize the
 * same way from either client.
 *
 * Backend contract (PUT /super-admin/schools/{id}): a null field means "leave unchanged"; any
 * string (including '') is stored. So an edit sends every text field trimmed, and a field the
 * admin emptied is sent as '' — it is cleared, not silently kept. A select left on "none" (board,
 * plan) and an empty number/date are null (unchanged). Activation is never part of an edit: it is
 * a separate, confirmed, audited action, so a stale edit form can't undo a recent toggle.
 */

export interface SchoolEditFields {
  name: string;
  slug: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  contactPersonName?: string | null;
  boardType?: string | null;
  plan?: string | null;
  maxStudents?: number | null;
  expiryDate?: string | null;
}

export interface SchoolEditPayload {
  name: string;
  slug: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  email: string;
  website: string;
  contactPersonName: string;
  boardType: string | null;
  plan: string | null;
  maxStudents: number | null;
  expiryDate: string | null;
}

const text = (value: string | null | undefined): string => (value ?? '').trim();
const optional = (value: string | null | undefined): string | null => text(value) || null;

/** "St. Mary's & Sons  School" → "st-mary-s-sons-school". Accents are dropped; never starts or
 * ends with a hyphen; '' when nothing usable is left. Matches the backend slug rule. */
export function schoolSlugFromName(name: string | null | undefined): string {
  return text(name)
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function normalizeSlug(slug: string | null | undefined): string {
  return text(slug).toLowerCase();
}

export function schoolEditPayload(form: SchoolEditFields): SchoolEditPayload {
  return {
    name: text(form.name),
    slug: normalizeSlug(form.slug),
    address: text(form.address),
    city: text(form.city),
    state: text(form.state),
    pincode: text(form.pincode),
    phone: text(form.phone),
    email: text(form.email),
    website: text(form.website),
    contactPersonName: text(form.contactPersonName),
    boardType: optional(form.boardType),
    plan: optional(form.plan),
    maxStudents: form.maxStudents == null || Number.isNaN(form.maxStudents) ? null : form.maxStudents,
    expiryDate: optional(form.expiryDate),
  };
}

/** A new school: required text trimmed, optional fields that are empty sent as null. Board is
 * blank by default (no assumed board). Never carries a password: the first administrator sets
 * their own from the setup email, and the server refuses a supplied one. */
export function schoolOnboardPayload<T extends Record<string, any>>(form: T): T {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(form)) {
    if (key === 'adminPassword') continue;
    else if (typeof value === 'string') out[key] = value.trim() || null;
    else out[key] = value ?? null;
  }
  out['slug'] = normalizeSlug(form['slug']);
  out['name'] = text(form['name']);
  return out as T;
}

export function activationDialog(school: { name: string; active: boolean }): ConfirmDialogData {
  return school.active
    ? {
      title: 'Deactivate School?',
      message: `This will deactivate "${school.name}" and prevent login for all its users.`,
      icon: 'warning', danger: true, confirmText: 'Yes, deactivate', cancelText: 'Cancel',
    }
    : {
      title: 'Activate School?',
      message: `This will reactivate "${school.name}" and restore access for all its users.`,
      icon: 'warning', danger: false, confirmText: 'Yes, activate', cancelText: 'Cancel',
    };
}

export function activationResultMessage(school: { name: string }, nowActive: boolean): string {
  return `"${school.name}" has been ${nowActive ? 'activated' : 'deactivated'}.`;
}

/** Result of POST /api/admins/{adminId}/setup-link. */
export interface SetupLinkResult { status: 'SENT' | 'RECENTLY_SENT' | string; sentTo: string; }

/** What to tell the person who asked for an administrator setup link. Never a password or link. */
export function setupLinkFeedback(result: SetupLinkResult): { level: 'success' | 'info'; title: string; message: string } {
  if (result.status === 'RECENTLY_SENT') {
    return { level: 'info', title: 'Setup link already sent',
      message: `A setup link was emailed to ${result.sentTo} less than a minute ago. Ask them to check their inbox and spam folder.` };
  }
  return { level: 'success', title: 'Setup link sent',
    message: `A secure setup link was emailed to ${result.sentTo}. It works once and expires in 1 hour.` };
}

/** Readable reason a setup link could not be sent (server message when it gave one). */
export function setupLinkError(err: any): string {
  const msg = typeof err?.error === 'string' ? err.error : err?.error?.message;
  if (typeof msg === 'string' && msg.trim()) return msg;
  if (err?.status === 404) return 'Administrator not found.';
  if (err?.status === 403) return 'You can only send setup links for administrators of your own school.';
  return 'Could not send the setup link. Please try again.';
}

/** A school's own sign-in page (its subdomain). */
export function schoolSignInUrl(slug: string | null | undefined): string {
  const s = (slug ?? '').trim().toLowerCase();
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(s) ? `https://${s}.${environment.baseDomain}` : `https://${environment.baseDomain}`;
}

/**
 * What a SUPER_ADMIN sees after onboarding a school: who was emailed and where the school signs
 * in. The welcome goes to the school email only when it differs from the administrator's (the
 * server's rule). Contains no password or setup link — those exist only in the administrator's email.
 */
export function onboardingResultDialog(school: { name: string; slug?: string | null; email?: string | null },
                                       admin: { userId: string; email: string }): ConfirmDialogData {
  const schoolEmail = (school.email ?? '').trim();
  const adminEmail = (admin.email ?? '').trim();
  const welcome = schoolEmail && schoolEmail.toLowerCase() !== adminEmail.toLowerCase()
    ? ` A welcome email is being sent to the school at ${schoolEmail}.` : '';
  return {
    title: 'School onboarded',
    message: `${school.name} is set up on Edunexify. A secure setup email is being sent to the administrator `
      + `(${admin.userId}) at ${adminEmail}; its link expires in 1 hour, and Forgot password works after that.`
      + welcome + ` School sign-in page: ${schoolSignInUrl(school.slug)}`,
    icon: 'success',
    confirmText: 'Done',
  };
}
