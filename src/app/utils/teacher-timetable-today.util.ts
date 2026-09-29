/**
 * Pure, testable "what do I teach today" logic for the teacher dashboard's Today's
 * Classes section. Consumes whatever TimetableService.getTeacherTimetable already
 * returns (day/period/start/end/class/section/subject) — no new backend call shape,
 * no invented timing data.
 */

export type TeacherTodayClassStatus = 'current' | 'upcoming' | 'done' | 'scheduled';

/** The subset of TimetableEntry this view needs — kept structural so tests don't
 * have to construct a full TimetableEntry for every case. */
export interface TeacherTimetableEntryLike {
  id?: number;
  day: string;
  className: string;
  sectionName?: string | null;
  subjectName: string;
  periodNumber: number;
  startTime?: string | null;
  endTime?: string | null;
  isSubstitution?: boolean;
  originalTeacherName?: string | null;
  substitutionNote?: string | null;
  /** The real timetable entry id (a covered period's entry for substitutions). */
  timetableEntryId?: number | null;
}

export interface TeacherTodayClassEntry {
  key: string;
  className: string;
  sectionName: string | null;
  subjectName: string;
  periodNumber: number;
  /** Present only when both startTime and endTime parsed as valid HH:mm; null means
   * "time unknown" — render as "Period N", never as a current/done class. */
  startTime: string | null;
  endTime: string | null;
  status: TeacherTodayClassStatus;
  isSubstitution: boolean;
  originalTeacherName: string | null;
  substitutionNote: string | null;
  timetableEntryId: number | null;
}

export interface TeacherTodayClassesView {
  current: TeacherTodayClassEntry | null;
  upcoming: TeacherTodayClassEntry[];
  /** True once every one of today's timed classes has ended and none is upcoming —
   * i.e. genuinely nothing left to show, not just "we don't know". */
  allDone: boolean;
  /** False when the teacher has zero entries for today at all (weekend/holiday/gap). */
  hasAnyToday: boolean;
}

const DAY_CODES = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

/** Mirrors the exact day-of-week mapping already used in timetable.component.ts. */
export function todayDayCode(date: Date): string {
  return DAY_CODES[date.getDay()];
}

function parseMinutesSinceMidnight(time: string | null | undefined): number | null {
  if (!time) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

/**
 * Today's entries, classified and ordered with the timetable's actual clock times as
 * the authority whenever they're present: an entry with a valid startTime always
 * sorts strictly by that time, ascending. periodNumber is only a fallback — used to
 * order entries that lack a reliable time relative to each other — and never
 * overrides a real time (a school's period numbering is not guaranteed to agree with
 * its configured start times, and this must never invent or assume a time to force
 * one). Entries without a reliable time are placed after every timed entry, since we
 * cannot know where in the day they truly belong; that's the least misleading option,
 * as opposed to letting a low period number wrongly jump an untimed class ahead of a
 * timed one we know is happening sooner.
 */
export function buildTodayClasses(entries: TeacherTimetableEntryLike[], now: Date): TeacherTodayClassEntry[] {
  const today = todayDayCode(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  return entries
    .filter(entry => entry.day === today)
    .map((entry, index) => {
      const start = parseMinutesSinceMidnight(entry.startTime);
      const end = parseMinutesSinceMidnight(entry.endTime);
      let status: TeacherTodayClassStatus;
      if (start === null || end === null) {
        status = 'scheduled';
      } else if (start <= nowMinutes && nowMinutes < end) {
        status = 'current';
      } else if (end <= nowMinutes) {
        status = 'done';
      } else {
        status = 'upcoming';
      }
      return {
        key: entry.id != null ? String(entry.id) : `${entry.periodNumber}-${index}`,
        className: entry.className,
        sectionName: entry.sectionName ?? null,
        subjectName: entry.subjectName,
        periodNumber: entry.periodNumber,
        startTime: start !== null ? entry.startTime! : null,
        endTime: end !== null ? entry.endTime! : null,
        status,
        isSubstitution: !!entry.isSubstitution,
        originalTeacherName: entry.originalTeacherName ?? null,
        substitutionNote: entry.substitutionNote ?? null,
        timetableEntryId: entry.timetableEntryId
          ?? (entry.id != null && entry.id > 0 && !entry.isSubstitution ? entry.id : null),
        sortMinutes: start,
      };
    })
    .sort((a, b) => {
      if (a.sortMinutes !== null && b.sortMinutes !== null) return a.sortMinutes - b.sortMinutes;
      if (a.sortMinutes !== null) return -1;
      if (b.sortMinutes !== null) return 1;
      return a.periodNumber - b.periodNumber;
    })
    .map(({ sortMinutes, ...visible }) => visible);
}

/**
 * Builds the dashboard-ready view: at most one "current" class plus a capped list of
 * what's next. `visibleLimit` counts the current class itself when one is active, so
 * the total number of rows shown never exceeds it.
 */
export function buildTodayClassesView(
  entries: TeacherTimetableEntryLike[],
  now: Date,
  visibleLimit = 3
): TeacherTodayClassesView {
  const today = buildTodayClasses(entries, now);
  const current = today.find(entry => entry.status === 'current') ?? null;
  // A cover assignment follows the same visibility rule as any other period — once its
  // time has passed it's 'done' and drops off Today's Classes, it does not linger.
  const pending = today.filter(entry => entry.status === 'upcoming' || entry.status === 'scheduled');
  const remainingSlots = Math.max(0, current ? visibleLimit - 1 : visibleLimit);
  const upcoming = pending.slice(0, remainingSlots);
  const allDone = today.length > 0 && !current && pending.length === 0;

  return { current, upcoming, allDone, hasAnyToday: today.length > 0 };
}
