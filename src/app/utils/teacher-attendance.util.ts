import { formatClockTime12h } from './clock-time.util';

export function localDateKey(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Check-in/out and period times as "h:mm AM/PM" (see utils/clock-time.util.ts for accepted forms). */
export function formatTeacherAttendanceTime(value: string | null | undefined): string {
  return formatClockTime12h(value);
}

export function teacherAttendanceErrorMessage(error: any, fallback: string): string {
  const candidates = [
    error?.error?.message,
    typeof error?.error === 'string' ? error.error : null,
    error?.error?.detail,
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const message = candidate.trim();
    if (!message || message.length > 500) continue;
    if (/<\/?[a-z][\s\S]*>/i.test(message)) continue;
    if (/^\s*[\[{]/.test(message)) continue;
    if (/\b(?:exception|stack trace|org\.springframework|java\.)\b/i.test(message)) continue;
    return message;
  }
  return fallback;
}
