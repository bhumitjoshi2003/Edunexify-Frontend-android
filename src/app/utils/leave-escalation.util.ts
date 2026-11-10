/**
 * Leave approval escalation — shared by web and Android (parity/shared-files.json).
 *
 * The server owns the calendar (school time zone, rollout cutoff): a PENDING leave carries
 * `escalation` with its calendar day (1 = first day of leave). From day 3 it is overdue; after seven
 * full calendar days a pending request is approved automatically and marked SYSTEM_AUTO_APPROVAL.
 */
export interface LeaveEscalation {
  day: number;
  overdue: boolean;
  /** Date the request will be approved automatically; null for leave outside the workflow. */
  autoApprovalDate: string | null;
  automatic: boolean;
}

export interface LeaveAttentionBucket {
  pending: number;
  overdue: number;
  attention?: number;
  urgent?: number;
  oldestDay: number | null;
}

/** GET /api/leaves/attention-summary — counts in the caller's own scope. */
export interface LeaveAttentionSummary {
  today: string;
  student: LeaveAttentionBucket | null;
  teacher: LeaveAttentionBucket | null;
}

export interface EscalatableLeave {
  status?: string | null;
  urgent?: boolean;
  escalation?: LeaveEscalation | null;
  decisionSource?: string | null;
}

export const AUTO_APPROVAL_SOURCE = 'SYSTEM_AUTO_APPROVAL';
export const NEEDS_ATTENTION_BADGE = 'Needs Attention';
export const OVERDUE_BADGE = 'Overdue · Action Required';
export const AUTO_APPROVED_LABEL = 'Automatically Approved';
export const AUTO_APPROVED_NOTE = 'No action was taken within the seven-day review period.';

const SHORT_DATE = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Red styling only for a request that is still pending and has reached day 3. */
export function isLeaveOverdue(leave: EscalatableLeave | null | undefined): boolean {
  return !!leave && leave.status === 'PENDING' && !!leave.escalation?.overdue;
}

/** Urgent requests demand immediate attention; normal ones from their first leave day. */
export function isLeaveNeedsAttention(leave: EscalatableLeave | null | undefined): boolean {
  return !!leave && leave.status === 'PENDING' && (leave.urgent === true || (leave.escalation?.day ?? 0) >= 1);
}

export function isLeaveAutoApproved(leave: EscalatableLeave | null | undefined): boolean {
  return !!leave && leave.status === 'APPROVED' && leave.decisionSource === AUTO_APPROVAL_SOURCE;
}

/** "Day 4 since leave started · Auto-approves 20 Nov" */
export function overdueDetail(leave: EscalatableLeave | null | undefined): string {
  const escalation = leave?.escalation;
  if (!escalation) return '';
  const day = escalation.day;
  const timing = day < 0 ? `Leave starts in ${1 - day} days`
    : day === 0 ? 'Leave starts tomorrow'
    : day === 1 ? 'Leave starts today' : `Day ${day} since leave started`;
  const parts = [timing];
  if (escalation.autoApprovalDate) parts.push(`Auto-approves ${formatShortDate(escalation.autoApprovalDate)}`);
  return parts.join(' · ');
}

/** "2 overdue · oldest on day 5", or '' when nothing is overdue. */
export function attentionOverdueLabel(bucket: LeaveAttentionBucket | null | undefined): string {
  const count = bucket?.attention ?? bucket?.overdue ?? 0;
  if (count <= 0) return '';
  return `${count} need attention` + (bucket?.oldestDay ? ` · oldest on day ${bucket.oldestDay}` : '');
}

export function formatShortDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) return isoDate;
  return SHORT_DATE.format(new Date(Date.UTC(year, month - 1, day)));
}
