import {
  buildTodayClasses,
  buildTodayClassesView,
  TeacherTimetableEntryLike,
  todayDayCode,
} from './teacher-timetable-today.util';

describe('teacher today-classes utilities', () => {
  const entry = (overrides: Partial<TeacherTimetableEntryLike>): TeacherTimetableEntryLike => ({
    id: overrides.id,
    day: 'THURSDAY',
    className: 'X',
    sectionName: null,
    subjectName: 'English',
    periodNumber: 1,
    startTime: '09:10',
    endTime: '09:50',
    ...overrides,
  });

  // 2026-09-17 is a Thursday.
  const at = (hour: number, minute: number) => new Date(2026, 8, 17, hour, minute, 0);

  it('maps the JS day-of-week index to the backend day code', () => {
    expect(todayDayCode(new Date(2026, 8, 17))).toBe('THURSDAY'); // Thursday
    expect(todayDayCode(new Date(2026, 8, 20))).toBe('SUNDAY');
  });

  it('filters entries down to today only', () => {
    const entries = [
      entry({ id: 1, day: 'THURSDAY' }),
      entry({ id: 2, day: 'FRIDAY' }),
      entry({ id: 3, day: 'MONDAY' }),
    ];
    const today = buildTodayClasses(entries, at(8, 0));
    expect(today.map(e => e.key)).toEqual(['1']);
  });

  it('detects the current class using startTime <= now < endTime', () => {
    const entries = [
      entry({ id: 1, periodNumber: 1, startTime: '09:10', endTime: '09:50' }),
      entry({ id: 2, periodNumber: 2, startTime: '10:00', endTime: '10:40' }),
    ];
    const view = buildTodayClassesView(entries, at(9, 30));
    expect(view.current?.key).toBe('1');
    expect(view.upcoming.map(e => e.key)).toEqual(['2']);
  });

  it('detects the next class as the earliest one whose startTime is after now', () => {
    const entries = [
      entry({ id: 1, periodNumber: 1, startTime: '09:10', endTime: '09:50' }),
      entry({ id: 2, periodNumber: 2, startTime: '10:00', endTime: '10:40' }),
      entry({ id: 3, periodNumber: 3, startTime: '11:30', endTime: '12:10' }),
    ];
    const view = buildTodayClassesView(entries, at(8, 30));
    expect(view.current).toBeNull();
    expect(view.upcoming.map(e => e.key)).toEqual(['1', '2', '3']);
  });

  it('caps the visible list and reserves a slot for the current class', () => {
    const entries = [
      entry({ id: 1, periodNumber: 1, startTime: '09:00', endTime: '09:40' }),
      entry({ id: 2, periodNumber: 2, startTime: '09:50', endTime: '10:30' }),
      entry({ id: 3, periodNumber: 3, startTime: '10:40', endTime: '11:20' }),
      entry({ id: 4, periodNumber: 4, startTime: '11:30', endTime: '12:10' }),
    ];
    const view = buildTodayClassesView(entries, at(9, 15), 3);
    expect(view.current?.key).toBe('1');
    expect(view.upcoming.map(e => e.key)).toEqual(['2', '3']); // limit 3 total, minus 1 for current
  });

  it('sorts upcoming classes by period number, not by array order', () => {
    const entries = [
      entry({ id: 2, periodNumber: 2, startTime: '10:00', endTime: '10:40' }),
      entry({ id: 1, periodNumber: 1, startTime: '09:10', endTime: '09:50' }),
    ];
    const view = buildTodayClassesView(entries, at(7, 0));
    expect(view.upcoming.map(e => e.key)).toEqual(['1', '2']);
  });

  it('sorts by actual startTime, not periodNumber, when a school\'s period numbering disagrees with its clock times', () => {
    // Period 3 is configured at 10:30, period 4 at 09:45 — periodNumber says 3 then 4,
    // but the real clock times run 09:45 before 10:30. The dashboard must show the
    // earlier clock time first regardless of the period label.
    const entries = [
      entry({ id: 30, periodNumber: 3, startTime: '10:30', endTime: '11:10' }),
      entry({ id: 40, periodNumber: 4, startTime: '09:45', endTime: '10:25' }),
    ];
    const view = buildTodayClassesView(entries, at(7, 0));
    expect(view.upcoming.map(e => e.key)).toEqual(['40', '30']);
  });

  it('places untimed entries after every timed entry, never letting a low period number jump an untimed class ahead of a known-time one', () => {
    const entries = [
      entry({ id: 1, periodNumber: 1, startTime: null, endTime: null }), // untimed, lowest period number
      entry({ id: 2, periodNumber: 3, startTime: '11:00', endTime: '11:40' }),
      entry({ id: 3, periodNumber: 2, startTime: '09:30', endTime: '10:10' }),
    ];
    const view = buildTodayClassesView(entries, at(7, 0), 5);
    // Timed entries first, ordered by actual clock time; untimed last, regardless of
    // its period number being lower than either timed entry's.
    expect(view.upcoming.map(e => e.key)).toEqual(['3', '2', '1']);
    expect(view.upcoming[2].status).toBe('scheduled');
    expect(view.upcoming[2].startTime).toBeNull();
    expect(view.current).toBeNull();
  });

  it('falls back to periodNumber ordering only among entries that are themselves untimed', () => {
    const entries = [
      entry({ id: 1, periodNumber: 5, startTime: null, endTime: null }),
      entry({ id: 2, periodNumber: 2, startTime: null, endTime: null }),
      entry({ id: 3, periodNumber: 8, startTime: '09:00', endTime: '09:40' }),
    ];
    const view = buildTodayClassesView(entries, at(7, 0), 5);
    expect(view.upcoming.map(e => e.key)).toEqual(['3', '2', '1']);
  });

  it('falls back to "scheduled" (Period N, never current) when start/end time is missing', () => {
    const entries = [entry({ id: 1, periodNumber: 3, startTime: null, endTime: null })];
    const today = buildTodayClasses(entries, at(9, 30));
    expect(today[0].status).toBe('scheduled');
    expect(today[0].startTime).toBeNull();
    expect(today[0].endTime).toBeNull();

    const view = buildTodayClassesView(entries, at(9, 30));
    expect(view.current).toBeNull();
    expect(view.upcoming.map(e => e.key)).toEqual(['1']);
  });

  it('treats an unparsable time string the same as a missing one', () => {
    const entries = [entry({ id: 1, startTime: 'not-a-time', endTime: '09:50' })];
    const today = buildTodayClasses(entries, at(9, 30));
    expect(today[0].status).toBe('scheduled');
  });

  it('reports no classes today when nothing matches the day code', () => {
    const view = buildTodayClassesView([entry({ id: 1, day: 'MONDAY' })], at(9, 0));
    expect(view.hasAnyToday).toBeFalse();
    expect(view.current).toBeNull();
    expect(view.upcoming).toEqual([]);
    expect(view.allDone).toBeFalse();
  });

  it('reports allDone once every timed class has ended and nothing is upcoming', () => {
    const entries = [
      entry({ id: 1, periodNumber: 1, startTime: '09:10', endTime: '09:50' }),
      entry({ id: 2, periodNumber: 2, startTime: '10:00', endTime: '10:40' }),
    ];
    const view = buildTodayClassesView(entries, at(11, 0));
    expect(view.current).toBeNull();
    expect(view.upcoming).toEqual([]);
    expect(view.allDone).toBeTrue();
    expect(view.hasAnyToday).toBeTrue();
  });

  it('does not report allDone while an untimed ("scheduled") entry is still unresolved', () => {
    const entries = [
      entry({ id: 1, periodNumber: 1, startTime: '09:10', endTime: '09:50' }),
      entry({ id: 2, periodNumber: 2, startTime: null, endTime: null }),
    ];
    const view = buildTodayClassesView(entries, at(11, 0));
    expect(view.current).toBeNull();
    expect(view.allDone).toBeFalse();
    expect(view.upcoming.map(e => e.key)).toEqual(['2']);
  });

  it('handles a single class today (both current and completed-day paths)', () => {
    const entries = [entry({ id: 1, periodNumber: 1, startTime: '09:10', endTime: '09:50' })];
    expect(buildTodayClassesView(entries, at(9, 20)).current?.key).toBe('1');
    expect(buildTodayClassesView(entries, at(10, 0)).allDone).toBeTrue();
  });

  it('carries className/sectionName/subjectName through unchanged for display', () => {
    const entries = [entry({ id: 1, className: 'IX', sectionName: 'B', subjectName: 'Science' })];
    const today = buildTodayClasses(entries, at(7, 0));
    expect(today[0].className).toBe('IX');
    expect(today[0].sectionName).toBe('B');
    expect(today[0].subjectName).toBe('Science');
  });

  // ─── Cover-class visibility — a substitution follows the same rules as any other
  //     period: once its time has passed, it's 'done' and drops off the list. ───

  it('a cover class whose period has already ended is not shown, same as a normal completed class', () => {
    const entries = [
      entry({ id: 9, periodNumber: 2, startTime: '09:00', endTime: '09:40', isSubstitution: true, originalTeacherName: 'Mr Original' }),
    ];
    const view = buildTodayClassesView(entries, at(12, 0)); // well past 09:40

    expect(view.current).toBeNull();
    expect(view.upcoming).toEqual([]);
    expect(view.allDone).toBeTrue();
  });

  it('a completed cover class alongside other completed classes still reports allDone', () => {
    const entries = [
      entry({ id: 1, periodNumber: 1, startTime: '08:00', endTime: '08:40' }),
      entry({ id: 9, periodNumber: 2, startTime: '09:00', endTime: '09:40', isSubstitution: true }),
    ];
    const view = buildTodayClassesView(entries, at(12, 0));
    expect(view.allDone).toBeTrue();
    expect(view.upcoming).toEqual([]);
  });

  it('an upcoming cover class is still subject to the normal visible-row cap, like any other period', () => {
    const entries = [
      entry({ id: 1, periodNumber: 1, startTime: '09:00', endTime: '09:40' }),
      entry({ id: 2, periodNumber: 2, startTime: '09:50', endTime: '10:30' }),
      entry({ id: 3, periodNumber: 3, startTime: '10:40', endTime: '11:20' }),
      entry({ id: 9, periodNumber: 4, startTime: '11:30', endTime: '12:10', isSubstitution: true }),
    ];
    const view = buildTodayClassesView(entries, at(9, 15), 3);
    expect(view.current?.key).toBe('1');
    expect(view.upcoming.map(e => e.key)).toEqual(['2', '3']);
    expect(view.upcoming.some(e => e.key === '9')).toBeFalse();
  });
  it('exposes the real timetable entry id: own periods use their id, covered periods their timetableEntryId', () => {
    const entries = buildTodayClasses([
      { id: 100, day: todayDayCode(new Date(2026, 8, 23)), className: '8', subjectName: 'Science', periodNumber: 1, startTime: '09:00', endTime: '09:40' },
      { id: -7, day: todayDayCode(new Date(2026, 8, 23)), className: '7', subjectName: 'English', periodNumber: 2,
        startTime: '10:00', endTime: '10:40', isSubstitution: true, timetableEntryId: 300 },
      { id: -8, day: todayDayCode(new Date(2026, 8, 23)), className: '6', subjectName: 'Art', periodNumber: 3,
        startTime: '11:00', endTime: '11:40', isSubstitution: true },
    ], new Date(2026, 8, 23, 8, 0));
    expect(entries.map(e => e.timetableEntryId)).toEqual([100, 300, null]);
  });

  it('classifies space-padded and malformed times the same way on every client', () => {
    const padded = buildTodayClasses([entry({ id: 1, startTime: ' 09:10 ', endTime: '09:50 ' })], at(9, 30))[0];
    expect(padded.status).toBe('current');
    const junk = buildTodayClasses([entry({ id: 2, startTime: '09:10abc', endTime: '09:50' })], at(9, 30))[0];
    expect(junk.status).toBe('scheduled');
    expect(junk.startTime).toBeNull();
    const withSeconds = buildTodayClasses([entry({ id: 3, startTime: '09:10:00', endTime: '09:50:00' })], at(9, 30))[0];
    expect(withSeconds.status).toBe('current');
  });
});
