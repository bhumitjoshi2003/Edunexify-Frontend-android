export interface OverdueStudent {
  studentId: string;
  studentName: string;
  className: string;
  parentPhone?: string;
  parentEmail?: string;
  unpaidMonths: string[];   // e.g. ["April", "May", "June"]
  /** null means amount unknown (no fee structure configured for this class/session) —
   * not the same as a genuine ₹0 due. */
  totalDue: number | null;
  lastPaymentDate?: string;
  daysOverdue: number;      // days since oldest unpaid month's due date
}

/** Mirrors FeeReminderService.ReminderOutcome.key() on the backend. */
export type ReminderOutcome = 'sent' | 'skipped_not_active' | 'skipped_no_email' | 'failed';

/** Response of POST /student-fees/reminders/send. */
export interface ReminderSendResult {
  status: ReminderOutcome;
  message: string;
}

/** One entry of POST /student-fees/reminders/send-bulk's skipped list. reason is usually a
 * ReminderOutcome key ("skipped_not_active"/"skipped_no_email"), or "error" for a per-student
 * exception caught mid-batch. */
export interface SkippedReminder {
  studentId: string;
  reason: string;
}

/** Response of POST /student-fees/reminders/send-bulk. */
export interface BulkReminderResult {
  sent: number;
  skipped: SkippedReminder[];
}
