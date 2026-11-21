/**
 * Wall-clock times from the backend (attendance check-in/out, timetable periods, event times).
 * Shared by the web and Android clients — keep the two copies identical.
 *
 * Accepted forms, after trimming surrounding whitespace:
 *  - LocalTime:      "8:05", "08:05", "08:05:00", "08:05:00.123"
 *  - LocalDateTime:  "2026-10-14T08:05", "2026-10-14T08:05:00", "2026-10-14T08:05:00.123456"
 * Anything else — a trailing suffix ("08:05abc"), a zone or offset ("…Z", "…+05:30"), an
 * out-of-range hour/minute — is not a time: it is never classified (current/upcoming/done) and is
 * displayed as unknown. The backend sends school-local wall-clock values without a zone, so the
 * hour and minute are used as written, never shifted through the device time zone.
 */
const CLOCK_TIME = /^(?:\d{4}-\d{2}-\d{2}T)?(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?$/;

export interface ClockTime {
  hour: number;
  minute: number;
}

export function parseClockTime(value: string | null | undefined): ClockTime | null {
  if (typeof value !== 'string') return null;
  const match = CLOCK_TIME.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = match[3] === undefined ? 0 : Number(match[3]);
  if (hour > 23 || minute > 59 || second > 59) return null;
  return { hour, minute };
}

export function minutesSinceMidnight(value: string | null | undefined): number | null {
  const time = parseClockTime(value);
  return time ? time.hour * 60 + time.minute : null;
}

/** "13:07" → "1:07 PM"; midnight is "12:00 AM", noon "12:00 PM". Unknown → "—". */
export function formatClockTime12h(value: string | null | undefined): string {
  const time = parseClockTime(value);
  if (!time) return '—';
  const suffix = time.hour >= 12 ? 'PM' : 'AM';
  return `${time.hour % 12 || 12}:${String(time.minute).padStart(2, '0')} ${suffix}`;
}

/** "HH:mm" for a time input; '' when the value isn't a time. */
export function toTimeInputValue(value: string | null | undefined): string {
  const time = parseClockTime(value);
  return time ? `${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}` : '';
}
