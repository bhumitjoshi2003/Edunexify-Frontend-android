import { StaffAdoptionTeacherRow } from '../interfaces/staff-adoption';
import {
  adoptionRatePercent, calendarDaysAgo, filterStaffAdoption, notStartedForSummary, relativeActivityLabel,
  reminderConfirmDialog, reminderSendResult,
} from './staff-adoption.util';

/** Shared by the web and Android clients — keep the two copies identical. */
describe('staff adoption', () => {
  const now = new Date(2026, 9, 14, 0, 1, 0);   // 14 Oct 2026, 00:01 local
  const local = (y: number, m: number, d: number, h = 12, min = 0) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${y}-${pad(m)}-${pad(d)}T${pad(h)}:${pad(min)}:00`;
  };
  const row = (over: Partial<StaffAdoptionTeacherRow>): StaffAdoptionTeacherRow => ({
    teacherId: 'T1', name: 'Asha', accountStatus: 'STARTED', lastActiveAt: null, hasUsedAttendance: false, lastAttendanceAt: null, ...over,
  });
  const all = { search: '', account: 'ALL', attendance: 'ALL', activity: 'ALL' } as const;

  it('uses local calendar days: yesterday 23:59 is "Yesterday" two minutes later', () => {
    expect(calendarDaysAgo(local(2026, 10, 13, 23, 59), now)).toBe(1);
    expect(relativeActivityLabel(local(2026, 10, 13, 23, 59), now)).toBe('Yesterday');
    expect(relativeActivityLabel(local(2026, 10, 14, 0, 0), now)).toBe('Today');
    expect(relativeActivityLabel(local(2026, 10, 11), now)).toBe('3 days ago');
    expect(relativeActivityLabel(null, now)).toBe('Never');
    expect(relativeActivityLabel('garbage', now)).toBe('Never');
  });

  it('the seven-day boundary: 6 calendar days ago is recent, 7 is older', () => {
    const six = local(2026, 10, 8, 0, 0);
    const seven = local(2026, 10, 7, 23, 59);
    expect(relativeActivityLabel(six, now)).toBe('6 days ago');
    expect(relativeActivityLabel(seven, now)).toBe('Oct 7, 2026');
    const rows = [row({ teacherId: 'A', lastActiveAt: six }), row({ teacherId: 'B', lastActiveAt: seven }), row({ teacherId: 'C' })];
    expect(filterStaffAdoption(rows, { ...all, activity: 'LAST_7_DAYS' }, now).map((r) => r.teacherId)).toEqual(['A']);
    expect(filterStaffAdoption(rows, { ...all, activity: 'OLDER' }, now).map((r) => r.teacherId)).toEqual(['B']);
    expect(filterStaffAdoption(rows, { ...all, activity: 'NEVER' }, now).map((r) => r.teacherId)).toEqual(['C']);
  });

  it('independent filters combine (AND), including disabled and pending accounts as not started', () => {
    const rows = [
      row({ teacherId: 'A', name: 'Asha', accountStatus: 'STARTED', hasUsedAttendance: true, lastActiveAt: local(2026, 10, 13) }),
      row({ teacherId: 'B', name: 'Bala', accountStatus: 'STARTED', hasUsedAttendance: false, lastActiveAt: local(2026, 10, 13) }),
      row({ teacherId: 'C', name: 'Chetan', accountStatus: 'DISABLED' }),
      row({ teacherId: 'D', name: 'Divya', accountStatus: 'ACCOUNT_PENDING' }),
    ];
    expect(filterStaffAdoption(rows, { ...all, account: 'STARTED', attendance: 'NOT_USED', activity: 'LAST_7_DAYS' }, now)
      .map((r) => r.teacherId)).toEqual(['B']);
    expect(filterStaffAdoption(rows, { ...all, account: 'NOT_STARTED' }, now).map((r) => r.teacherId)).toEqual(['C', 'D']);
    expect(filterStaffAdoption(rows, { ...all, search: ' div ' }, now).map((r) => r.teacherId)).toEqual(['D']);
    expect(filterStaffAdoption(rows, { ...all, search: 'b' }, now).map((r) => r.teacherId)).toEqual(['B']);
  });

  it('summary: not started includes disabled; adoption percent', () => {
    const data = { summary: { totalTeachers: 3, startedTeachers: 2, notStartedTeachers: 0, disabledTeachers: 1, attendanceUsedTeachers: 1 }, teachers: [] };
    expect(notStartedForSummary(data)).toBe(1);
    expect(adoptionRatePercent(data)).toBe(67);
    expect(adoptionRatePercent({ ...data, summary: { ...data.summary, totalTeachers: 0 } })).toBe(0);
    expect(adoptionRatePercent(null)).toBe(0);
  });

  it('reminder confirmation lists recipients as plain text; send result wording is truthful', () => {
    const dialog = reminderConfirmDialog(10, ['<b>A</b>', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']);
    expect(dialog.title).toBe('Send reminder to 10 teachers?');
    expect(dialog.html).toBeUndefined();
    expect(dialog.message).toContain('<b>A</b>');
    expect(dialog.message).toContain('… and 2 more');
    expect(reminderConfirmDialog(1, ['A']).title).toBe('Send reminder to 1 teacher?');
    expect(reminderSendResult(0, 3)).toEqual({ level: 'info', title: 'Already reminded', message: 'All 3 teachers were reminded recently.' });
    expect(reminderSendResult(2, 1).message).toBe('Reminder sent to 2 teachers. 1 skipped because they were reminded recently.');
  });
});
