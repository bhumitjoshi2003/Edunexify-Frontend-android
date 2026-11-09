export interface TeacherCheckinRequest {
  latitude: number;
  longitude: number;
}

export interface AdminMarkRequest {
  teacherId: string;
  date: string;       // yyyy-MM-dd
  status: string;
  checkInTime?: string;   // HH:mm
  checkOutTime?: string;  // HH:mm
}

export interface SchoolTiming {
  startTime: string | null;   // HH:mm
  lateThresholdMinutes: number;
}

export interface TeacherAttendanceRecord {
  id: number;
  teacherId: string;
  teacherName: string;
  schoolId: number;
  date: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  status: string;
  latitude: number | null;
  longitude: number | null;
  distanceFromSchool: number | null;
  method: string;
  markedByAdmin: boolean;
}

export interface TeacherAttendanceSummary {
  totalWorkingDays: number;
  presentDays: number;
  lateDays: number;
  absentDays: number;
  halfDayDays: number;
  onLeaveDays: number;
  onTimePercentage: number;
  attendancePercentage: number;
  trackingStartDate: string | null;
  /** Own current-month summary only: whether this teacher is expected to attend today
   *  (false on a holiday, their day off or approved leave); null/absent otherwise. */
  expectedToday?: boolean | null;
  records: TeacherAttendanceRecord[];
}

export interface TeacherAttendanceSessionMonth {
  month: number;
  year: number;
  summary: TeacherAttendanceSummary;
}

export interface TeacherAttendanceSessionSummary {
  session: string;
  teacherId: string;
  teacherName: string;
  totalWorkingDays: number;
  presentDays: number;
  lateDays: number;
  absentDays: number;
  halfDayDays: number;
  onLeaveDays: number;
  attendancePercentage: number;
  onTimePercentage: number;
  months: TeacherAttendanceSessionMonth[];
}

export interface TeacherAttendanceTodaySummary {
  date: string;
  presentCount: number;
  lateCount: number;
  absentCount: number;
  halfDayCount: number;
  onLeaveCount: number;
  /** Teachers expected to attend today — 0 on a holiday. */
  expectedCount: number;
  /** Expected teachers with no attendance record yet. */
  notCheckedInCount: number;
}

/** A teacher who can be marked on a date: expected to attend and not recorded yet. */
export interface MarkableTeacher {
  teacherId: string;
  name: string;
}
