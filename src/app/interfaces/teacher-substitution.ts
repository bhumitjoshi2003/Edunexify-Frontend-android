export type SubstitutionReasonCode = 'SAME_SUBJECT' | 'KNOWS_CLASS' | 'BACK_TO_BACK' | string; // plus COVERING_<n>

export interface FreeSubstituteTeacher {
  teacherId: string;
  name: string;
  sameSubject?: boolean;
  knowsClass?: boolean;
  coveringToday?: number;
  backToBack?: boolean;
  /** Ranking explanation: SAME_SUBJECT, KNOWS_CLASS, COVERING_<n>, BACK_TO_BACK. */
  reasons?: SubstitutionReasonCode[];
}

export interface TeacherSubstitution {
  id: number;
  revision: number;
  date: string;
  timetableEntryId: number;
  originalTeacherId: string;
  originalTeacherName: string;
  substituteTeacherId: string;
  substituteTeacherName: string;
  className: string;
  sectionName?: string | null;
  subjectName: string;
  periodNumber: number;
  startTime: string;
  endTime: string;
  status: 'ACTIVE' | 'CANCELLED';
  assignedBy: string;
  assignedAt: string;
  updatedAt: string;
  note?: string | null;
  reasonSource?: 'LEAVE' | 'ABSENCE' | null;
  cancelledBy?: string | null;
  cancelledAt?: string | null;
}

export type SubstitutionState = 'NEEDS_SUBSTITUTE' | 'COVERED' | 'NO_LONGER_NEEDED';
export type UnavailabilityReason = 'APPROVED_LEAVE' | 'ABSENT' | 'ON_LEAVE' | 'LEFT' | 'NOT_JOINED';

export interface UncoveredPeriod {
  timetableEntryId: number;
  originalTeacherId: string;
  originalTeacherName: string;
  className: string;
  sectionName?: string | null;
  subjectName: string;
  periodNumber: number;
  startTime: string;
  endTime: string;
  assignment?: TeacherSubstitution | null;
  freeTeachers: FreeSubstituteTeacher[];
  state?: SubstitutionState;
  unavailabilityReason?: UnavailabilityReason | null;
  leaveStart?: string | null;
  leaveEnd?: string | null;
  suggested?: FreeSubstituteTeacher | null;
}

export interface SubstitutionWorkloadRow {
  teacherId: string;
  teacherName: string;
  covers: number;
}

export interface SubstitutionDayOverview {
  date: string;
  /** Set when the school is closed that day (holiday / non-working day). */
  closedReason?: string | null;
  periods: UncoveredPeriod[];
  workload: SubstitutionWorkloadRow[];
  needingSubstitute: number;
  covered: number;
  noLongerNeeded: number;
}

export interface SubstitutionFillProposal {
  timetableEntryId: number;
  periodNumber: number;
  className: string;
  sectionName?: string | null;
  subjectName: string;
  originalTeacherName: string;
  substituteTeacherId: string;
  substituteTeacherName: string;
  reasons: SubstitutionReasonCode[];
}

export interface SubstitutionFillPreview {
  date: string;
  proposals: SubstitutionFillProposal[];
  unfillable: UncoveredPeriod[];
}

export interface SubstitutionBulkItem {
  timetableEntryId: number;
  substituteTeacherId: string;
  note?: string | null;
}

export interface SubstitutionBulkOutcome {
  timetableEntryId: number;
  status: 'ASSIGNED' | 'CONFLICT' | 'FAILED';
  message?: string | null;
  assignment?: TeacherSubstitution | null;
}

export interface SubstitutionBulkResult {
  assigned: number;
  conflicts: number;
  failed: number;
  outcomes: SubstitutionBulkOutcome[];
}

export interface MyCoveragePeriod {
  timetableEntryId: number;
  periodNumber: number;
  startTime: string;
  endTime: string;
  className: string;
  sectionName?: string | null;
  subjectName: string;
  covered: boolean;
  substituteTeacherName?: string | null;
}

export interface MyCoverage {
  date: string;
  unavailable: boolean;
  unavailabilityReason?: UnavailabilityReason | null;
  periods: MyCoveragePeriod[];
}
