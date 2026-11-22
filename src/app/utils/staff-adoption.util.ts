import { StaffAdoptionResponse, StaffAdoptionTeacherRow } from '../interfaces/staff-adoption';
import { ConfirmDialogData } from '../services/toast.service';

/**
 * Staff adoption filters, summary and relative activity. Shared by the web and Android clients —
 * keep the two copies identical, so the same query selects the same teachers and the same
 * timestamp reads the same ("Today", "Yesterday", "3 days ago") on both. Layouts stay per platform.
 *
 * Days are local calendar days, not elapsed 24-hour blocks: activity at 23:59 yesterday is
 * "Yesterday" at 00:01 today. "Active in last 7 days" is today plus the six previous calendar days —
 * exactly the rows labelled Today / Yesterday / "N days ago".
 */
export type AdoptionAccountFilter = 'ALL' | 'STARTED' | 'NOT_STARTED';
export type AdoptionAttendanceFilter = 'ALL' | 'USED' | 'NOT_USED';
export type AdoptionActivityFilter = 'ALL' | 'LAST_7_DAYS' | 'OLDER' | 'NEVER';

export interface StaffAdoptionQuery {
  search: string;
  account: AdoptionAccountFilter;
  attendance: AdoptionAttendanceFilter;
  activity: AdoptionActivityFilter;
}

export const RECENT_ACTIVITY_DAYS = 7;

/** Whole local calendar days between the timestamp and `now` (0 = today); null if unknown. A
 * timestamp slightly in the future (clock skew) counts as today. */
export function calendarDaysAgo(value: string | null | undefined, now: Date): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  // Rounding absorbs a daylight-saving hour; India has none, but the device may be elsewhere.
  return Math.max(0, Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000));
}

/** Today / Yesterday / "N days ago" (within a week) / "Oct 3, 2026"; unknown is "Never". */
export function relativeActivityLabel(value: string | null | undefined, now: Date): string {
  const days = calendarDaysAgo(value, now);
  if (days === null) return 'Never';
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < RECENT_ACTIVITY_DAYS) return `${days} days ago`;
  return new Date(value!).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Every filter applies independently; together they narrow the list (AND). */
export function filterStaffAdoption(teachers: readonly StaffAdoptionTeacherRow[], query: StaffAdoptionQuery,
                                    now: Date): StaffAdoptionTeacherRow[] {
  const term = query.search.trim().toLowerCase();
  return teachers.filter((teacher) => {
    if (term && !teacher.name.toLowerCase().includes(term) && !teacher.teacherId.toLowerCase().includes(term)) return false;
    if (query.account === 'STARTED' && teacher.accountStatus !== 'STARTED') return false;
    if (query.account === 'NOT_STARTED' && teacher.accountStatus === 'STARTED') return false;
    if (query.attendance === 'USED' && !teacher.hasUsedAttendance) return false;
    if (query.attendance === 'NOT_USED' && teacher.hasUsedAttendance) return false;
    const days = calendarDaysAgo(teacher.lastActiveAt, now);
    if (query.activity === 'LAST_7_DAYS' && (days === null || days >= RECENT_ACTIVITY_DAYS)) return false;
    if (query.activity === 'OLDER' && (days === null || days < RECENT_ACTIVITY_DAYS)) return false;
    if (query.activity === 'NEVER' && days !== null) return false;
    return true;
  });
}

/** "Not started" in the summary folds in disabled accounts, so the summary adds up to the total. */
export function notStartedForSummary(data: StaffAdoptionResponse | null): number {
  return data ? data.summary.notStartedTeachers + data.summary.disabledTeachers : 0;
}

/** Share of teachers who have started, 0–100. */
export function adoptionRatePercent(data: StaffAdoptionResponse | null): number {
  if (!data || data.summary.totalTeachers === 0) return 0;
  return Math.round((data.summary.startedTeachers / data.summary.totalTeachers) * 100);
}

export function accountStatusLabel(status: StaffAdoptionTeacherRow['accountStatus']): string {
  switch (status) {
    case 'STARTED': return 'Started';
    case 'DISABLED': return 'Disabled';
    case 'ACCOUNT_PENDING': return 'Account pending';
    default: return 'Not started';
  }
}

export function appVersionLabel(teacher: StaffAdoptionTeacherRow): string {
  switch (teacher.appVersionStatus) {
    case 'UP_TO_DATE': return 'Up to date';
    case 'UPDATE_AVAILABLE': return 'Update available';
    case 'UPDATE_REQUIRED': return 'Update required';
    default: return 'No version reported';
  }
}

/** Confirmation for a previewed reminder: plain text (teacher names are never rendered as HTML). */
export function reminderConfirmDialog(count: number, names: readonly string[]): ConfirmDialogData {
  const shown = names.slice(0, 8);
  const more = names.length > shown.length ? ` … and ${names.length - shown.length} more` : '';
  return {
    title: `Send reminder to ${count} teacher${count === 1 ? '' : 's'}?`,
    message: `${shown.join(', ')}${more}`,
    icon: 'question',
    confirmText: 'Send reminder',
    cancelText: 'Cancel',
  };
}

/** Truthful wording: "sent" means accepted for delivery, never a claim it was received. */
export function reminderSendResult(sentCount: number, skippedRecentCount: number): { level: 'info' | 'success'; title: string; message: string } {
  if (sentCount === 0 && skippedRecentCount > 0) {
    return { level: 'info', title: 'Already reminded',
      message: `All ${skippedRecentCount} teacher${skippedRecentCount > 1 ? 's were' : ' was'} reminded recently.` };
  }
  let message = `Reminder sent to ${sentCount} teacher${sentCount === 1 ? '' : 's'}.`;
  if (skippedRecentCount > 0) message += ` ${skippedRecentCount} skipped because they were reminded recently.`;
  return { level: 'success', title: 'Reminder sent', message };
}
