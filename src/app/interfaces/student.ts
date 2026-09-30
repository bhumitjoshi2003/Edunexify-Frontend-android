export interface Student {
  studentId: string;
  name: string;
  className: string;
  classId?: number;
  sectionId?: number | null;
  sectionName?: string;
  phoneNumber?: string;
  email?: string;
  gender?: string;
  dob?: string;
  fatherName?: string;
  motherName?: string;
  takesBus?: boolean;
  distance?: number | null;
  joiningDate?: string;
  leavingDate?: string;
  status?: string;
  photoUrl?: string;
  reasonForLeaving?: string;
  conductAtLeaving?: string;
  exitRemarks?: string;
}

export interface StudentExitRequest {
  exitType: 'GRADUATED' | 'TRANSFERRED' | 'WITHDRAWN';
  reasonForLeaving: string;
  conductAtLeaving?: string;
  leavingDate: string;
  exitRemarks?: string;
}

export interface PendingDuesInfo {
  hasPendingDues: boolean;
  unpaidMonths: number;
}

/** Readmission choices; every field optional (defaults: previous class/section, today). */
export interface ReadmitRequest {
  classId?: number | null;
  sectionId?: number | null;
  readmissionDate?: string | null;
}

export type EnrollmentState = 'CURRENT' | 'UPCOMING' | 'CLOSED' | 'CANCELLED';

export interface EnrollmentHistoryItem {
  id: number;
  academicSessionId: number;
  sessionLabel?: string | null;
  classId: number;
  className: string;
  sectionId?: number | null;
  sectionName?: string | null;
  status: 'PLANNED' | 'ACTIVE' | 'CLOSED' | 'CANCELLED';
  state: EnrollmentState;
  effectiveFrom: string;
  effectiveUntil?: string | null;
  closureReason?: string | null;
}

export interface StudentLoginStatus {
  exists: boolean;
  active: boolean;
}

export interface RestorableParentLink {
  relationshipId: number;
  parentId: string;
  parentName: string;
  relationshipType: string;
  primaryGuardian: boolean;
  endedOn: string;
}
