/** Academic Coordinator: an appointment held by a TEACHER account (shared by web and Android). */

export interface CoordinatorScopeEntry {
  classId: number;
  className: string;
  sectionId: number | null;
  sectionName: string | null;
  streamId: number | null;
  streamName: string | null;
}

export interface CoordinatorAppointment {
  id: number;
  teacherId: string;
  teacherName: string | null;
  teacherEmail: string | null;
  classTeacher: string | null;
  active: boolean;
  appointedBy: string;
  appointedAt: string;
  updatedBy: string | null;
  updatedAt: string | null;
  removedBy: string | null;
  removedAt: string | null;
  removalReason: string | null;
  scope: CoordinatorScopeEntry[];
}

export interface CoordinatorScopeRequest {
  classId: number;
  sectionId: number | null;
  streamId: number | null;
}

/** The signed-in Coordinator's own appointment. */
export interface MyCoordinatorAppointment {
  id: number;
  appointedAt: string;
  scope: CoordinatorScopeEntry[];
  operations: string[];
  /** Classes covered in full — class-wide configuration (subjects, exams, groups) is open only for these. */
  fullClassIds: number[];
}

export interface CoordinatorUnit {
  classId: number;
  className: string;
  sectionId: number | null;
  sectionName: string | null;
}

export interface CoordinatorStudent {
  studentId: string;
  name: string;
  classId: number;
  className: string;
  sectionId: number | null;
  sectionName: string | null;
  streamName: string | null;
  status: string;
}

export interface CoordinatorTeacher {
  teacherId: string;
  name: string;
  email: string | null;
  phoneNumber: string | null;
  classTeacher: string | null;
  classTeacherSection: string | null;
  subjects: string[];
  self: boolean;
}

export interface CoordinatorAttendanceUnit extends CoordinatorUnit {
  submitted: boolean;
  present: number;
  absent: number;
  markedBy: string | null;
}

export interface CoordinatorAttention {
  kind: string;
  severity: 'danger' | 'warning' | 'info';
  title: string;
  detail: string;
  route: string;
}

export interface CoordinatorOverview {
  today: string;
  units: CoordinatorUnit[];
  students: number;
  teachers: number;
  attendance: CoordinatorAttendanceUnit[];
  assessments: { id: number; title: string; type: string; className: string; sectionName: string | null;
    subjectName: string; date: string }[];
  exams: { examId: number; examName: string; className: string; subjectName: string; date: string }[];
  substitutionsNeeded: number;
  substitutionsCovered: number;
  attention: CoordinatorAttention[];
  classTeacher: boolean;
  classTeacherOf: string | null;
}

export interface CoordinatorMarksCompletion {
  examId: number;
  examName: string;
  className: string;
  sectionId: number | null;
  sectionName: string | null;
  expected: number;
  entered: number;
  missing: number;
  published: boolean;
  gaps: { subjectName: string; missing: number }[];
}

export interface CoordinatorReportCardProgress {
  setupId: number;
  setupName: string;
  classId: number;
  className: string;
  sectionId: number | null;
  sectionName: string | null;
  students: number;
  complete: number;
  incomplete: number;
  noResult: number;
  missingTeacherRemarks: number;
  approvalStatus: string;
  correctionRequests: number;
}

export interface ReportCardCorrectionRequest {
  id: number;
  setupId: number;
  sectionId: number;
  studentId: string | null;
  studentName: string | null;
  teacherId: string;
  teacherName: string | null;
  requestedBy: string;
  reason: string;
  createdAt: string;
}

export interface CoordinatorClassroomPost {
  kind: 'HOMEWORK' | 'CLASS_UPDATE';
  id: number;
  teacherId: string;
  teacherName: string | null;
  className: string;
  sectionName: string | null;
  subjectName: string | null;
  title: string | null;
  date: string;
}

/** "Class 8-A", "Class 11 (Science)" or "Class 9 (all sections)". */
export function coordinatorScopeLabel(entry: CoordinatorScopeEntry): string {
  const section = entry.sectionName ? `-${entry.sectionName}` : '';
  const stream = entry.streamName ? ` (${entry.streamName})` : '';
  const whole = !entry.sectionName && !entry.streamName ? ' (all sections)' : '';
  return `Class ${entry.className}${section}${stream}${whole}`;
}

export function coordinatorUnitLabel(unit: { className: string; sectionName: string | null }): string {
  return `Class ${unit.className}${unit.sectionName ? '-' + unit.sectionName : ''}`;
}

/** Today's staff attendance for the whole school — the Principal's calculation (counts only). */
export interface CoordinatorStaffToday {
  date: string;
  presentCount: number;
  lateCount: number;
  absentCount: number;
  halfDayCount: number;
  onLeaveCount: number;
  /** Teachers expected to attend; 0 on a school holiday. */
  expectedCount?: number;
  notCheckedInCount?: number;
}

/** Pending student leave in the Coordinator's scope (from /leaves/attention-summary). */
export interface CoordinatorLeaveBucket { pending: number; overdue: number; attention: number; urgent: number; oldestDay: number | null; }
export interface CoordinatorLeaveSummary { today: string; student: CoordinatorLeaveBucket | null; teacher: CoordinatorLeaveBucket | null; }
