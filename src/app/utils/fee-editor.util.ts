import { AuthStateService } from '../auth/auth-state.service';
import { FeeStructureRule } from '../interfaces/fee-rule';
import { AcademicSession } from '../interfaces/academic-session';
import { validDateKey } from './school-date.util';
export function feeSchoolKey(auth: AuthStateService): string { return `${auth.getUser?.()?.schoolSlug ?? ''}:${auth.getUserId?.() ?? ''}`; }
export function latestFeeRule(rows: FeeStructureRule[], head: number, cls: string): FeeStructureRule | undefined {
  return rows.filter(r => r.feeHeadId === head && r.className === cls).sort((a,b) => a.effectiveFrom.localeCompare(b.effectiveFrom)).pop();
}
/** Both editors use explicit dates for amount changes; initial configuration covers the session. */
export function feeRuleWrite(rows: FeeStructureRule[], history: FeeStructureRule[], session: AcademicSession, cls: string, date: string, today: string): FeeStructureRule[] {
 return rows.map(row => {
  if (!Number.isSafeInteger(row.amount) || row.amount < 0) throw new Error('Amounts must be nonnegative whole paise.');
  const prior = latestFeeRule(history, row.feeHeadId, cls);
  if (prior && prior.amount === row.amount) return { ...prior, academicSessionId: session.id, className: cls };
  let from = session.startDate;
  if (prior) {
   if (!validDateKey(date) || date < today || date <= prior.effectiveFrom || date < session.startDate || date > session.endDate)
    throw new Error('Choose an effective date within the session, on or after the school date and after the latest rule start.');
   from = date;
  }
  return { feeHeadId: row.feeHeadId, academicSessionId: session.id, className: cls, amount: row.amount, effectiveFrom: from };
 });
}
