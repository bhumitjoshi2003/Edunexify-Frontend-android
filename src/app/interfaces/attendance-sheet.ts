/** Student Attendance V2: one explicit status per rostered student; no LATE/HALF_DAY/EXCUSED. */
export type AttendanceStatus = 'PRESENT' | 'ABSENT';

export interface SheetStudent {
  studentId: string;
  name: string;
  /** Saved status; null until attendance is submitted for the day. */
  status: AttendanceStatus | null;
  /** True only for APPROVED leave on that date (pending/rejected never show). */
  approvedLeave: boolean;
}

/** The server-derived roster for one class (section) day. */
export interface AttendanceSheet {
  classId: number;
  className: string;
  sectionId: number | null;
  sectionName: string | null;
  date: string;
  submitted: boolean;
  markedBy: string | null;
  markedAt: string | null;
  updatedAt: string | null;
  /** False with a blockedReason when the date cannot be submitted (future, holiday, non-working day, outside session). */
  markable: boolean;
  blockedReason: string | null;
  students: SheetStudent[];
}

export interface AttendanceSubmission {
  classId: number | null;
  sectionId: number | null;
  date: string;
  students: { studentId: string; status: AttendanceStatus }[];
  /** Required when a Principal or Coordinator corrects a class that is not their own. */
  correctionReason?: string | null;
}
