import { FeeWorkflowChangeResult } from '../interfaces/fee-workflow';

/**
 * What a fee change (discount, waiver, transport, opt-out…) actually did, for the admin. Shared by
 * the web and Android clients — keep the two copies identical. Counted from the per-student
 * `changeSaved` flags the server returns; "Completed" is only ever said when every student's change
 * was saved, and a run that saved nothing is never reported as success.
 */
export type FeeChangeOutcomeKind = 'all-saved' | 'saved-none-changed' | 'partial' | 'none-saved';

export interface FeeChangeOutcome {
  kind: FeeChangeOutcomeKind;
  /** Toast level to use. */
  level: 'success' | 'info' | 'warning' | 'error';
  title: string;
  message: string;
}

export function summarizeFeeChange(result: FeeWorkflowChangeResult, actionMessage: string): FeeChangeOutcome {
  const students = result.students ?? [];
  const total = students.length || result.requestedStudents || 0;
  const saved = students.length ? students.filter((s) => s.changeSaved).length : (result.savedStudents ?? 0);
  const failed = students.filter((s) => !s.changeSaved);
  const firstError = failed.find((s) => s.message)?.message;

  if (saved === 0) {
    return {
      kind: 'none-saved', level: 'error', title: 'Nothing was saved',
      message: firstError || 'No students were updated. Please review and try again.',
    };
  }
  if (saved < total) {
    return {
      kind: 'partial', level: 'warning', title: 'Partly saved',
      message: `${saved} of ${total} student(s) updated; ${total - saved} not saved`
        + (firstError ? `: ${firstError}` : '.') + ' Review the results below.',
    };
  }
  if (!result.recalculatedMonths && result.skippedMonths > 0) {
    return {
      kind: 'saved-none-changed', level: 'info', title: 'Saved — no months recalculated',
      message: `${actionMessage} All ${result.skippedMonths} affected month(s) were left unchanged because they were paid, `
        + 'part-paid or otherwise protected. Use Fee Recalculation to review them.',
    };
  }
  return {
    kind: 'all-saved', level: 'success', title: 'Completed',
    message: `${actionMessage} ${result.recalculatedMonths} month(s) updated; ${result.skippedMonths} month(s) left unchanged because they were protected or ineligible.`,
  };
}
