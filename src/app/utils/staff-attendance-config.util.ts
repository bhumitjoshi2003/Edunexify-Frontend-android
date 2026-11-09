/**
 * GPS staff check-in configuration bounds (School Settings → Staff Attendance). Mirrors the
 * backend's StaffAttendanceRules, which stays authoritative. Shared by the web and Android
 * clients — keep the two copies identical.
 */
export const STAFF_ATTENDANCE_LIMITS = { minRadius: 50, maxRadius: 5000, maxLateMinutes: 60 } as const;

export interface StaffAttendanceConfig {
  schoolLatitude?: number | string | null;
  schoolLongitude?: number | string | null;
  geofenceRadius?: number | string | null;
  lateThresholdMinutes?: number | string | null;
  schoolStartTime?: string | null;
  checkinWindowStart?: string | null;
  checkinWindowEnd?: string | null;
}

const isBlank = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
const num = (v: unknown) => (typeof v === 'number' ? v : Number(String(v).trim()));
const minutes = (t: string) => {
  const m = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(t.trim());
  return m && +m[1] <= 23 && +m[2] <= 59 ? +m[1] * 60 + +m[2] : null;
};

/** The first out-of-range value, as a user-facing message; null when every supplied value is valid. */
export function staffAttendanceConfigError(f: StaffAttendanceConfig): string | null {
  const { minRadius, maxRadius, maxLateMinutes } = STAFF_ATTENDANCE_LIMITS;
  if (!isBlank(f.schoolLatitude)) {
    const lat = num(f.schoolLatitude);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) return 'Latitude must be a number between -90 and 90.';
  }
  if (!isBlank(f.schoolLongitude)) {
    const lng = num(f.schoolLongitude);
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) return 'Longitude must be a number between -180 and 180.';
  }
  if (!isBlank(f.geofenceRadius)) {
    const radius = num(f.geofenceRadius);
    if (!Number.isInteger(radius) || radius < minRadius || radius > maxRadius) {
      return `Geofence radius must be between ${minRadius} and ${maxRadius} metres.`;
    }
  }
  if (!isBlank(f.lateThresholdMinutes)) {
    const late = num(f.lateThresholdMinutes);
    if (!Number.isInteger(late) || late < 0 || late > maxLateMinutes) {
      return `Late threshold must be between 0 and ${maxLateMinutes} minutes.`;
    }
  }
  if (!isBlank(f.schoolStartTime) && minutes(f.schoolStartTime!) === null) return 'School start time must be a valid time (HH:mm).';
  const start = isBlank(f.checkinWindowStart) ? null : minutes(f.checkinWindowStart!);
  const end = isBlank(f.checkinWindowEnd) ? null : minutes(f.checkinWindowEnd!);
  if (!isBlank(f.checkinWindowStart) && start === null) return 'Check-in window start must be a valid time (HH:mm).';
  if (!isBlank(f.checkinWindowEnd) && end === null) return 'Check-in window end must be a valid time (HH:mm).';
  if (start !== null && end !== null && start >= end) return 'Check-in window start must be before its end.';
  return null;
}

/** True only when the saved configuration can actually support GPS check-in. */
export function isStaffAttendanceUsable(s: StaffAttendanceConfig | null | undefined): boolean {
  return !!s && !isBlank(s.schoolLatitude) && !isBlank(s.schoolLongitude) && !isBlank(s.schoolStartTime)
    && !isBlank(s.checkinWindowStart) && !isBlank(s.checkinWindowEnd) && staffAttendanceConfigError(s) === null;
}
