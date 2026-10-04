export type ParentStatusFilter = 'ALL' | 'ACTIVE' | 'DISABLED';
export type ParentLinkedFilter = 'ALL' | 'LINKED' | 'UNLINKED' | 'NO_ACTIVE_CHILDREN';

export interface ParentSummary {
  parentId: string;
  name: string;
  email: string | null;
  phoneNumber: string;
  active: boolean;
  linkedChildren: number;
  /** Had linked children, but every link has ended (operational info — never auto-deactivated). */
  noActiveChildren?: boolean;
}

export interface ChildAccess {
  relationshipId: number;
  studentId: string;
  studentName: string;
  className: string;
  sectionName: string | null;
  relationshipType: string;
  primaryGuardian: boolean;
  canViewAttendance: boolean;
  canViewFees: boolean;
  canPayFees: boolean;
  canViewResults: boolean;
  canViewTimetable: boolean;
  canManageLeave: boolean;
  effectiveFrom: string;
  effectiveUntil: string | null;
}

export interface ParentProfile {
  parent: ParentSummary;
  children: ChildAccess[];
}

export interface ParentDirectoryStats {
  totalParents: number;
  activeParents: number;
  linkedStudents: number;
  unlinkedParents: number;
  parentsWithoutActiveChildren?: number;
}

/** Name, email and phone only — the parent ID, school, status, links and login aren't editable here. */
export interface UpdateParentRequest {
  name: string;
  email: string;
  phoneNumber: string;
}

/** One guardian of a student, for the admin's Student Details (no password/security data). */
export interface GuardianLink {
  relationshipId: number;
  parentId: string;
  parentName: string;
  phoneNumber: string;
  email: string | null;
  relationshipType: string;
  primaryGuardian: boolean;
  linkStatus: 'ACTIVE' | 'UPCOMING' | 'ENDED';
  effectiveFrom: string;
  effectiveUntil: string | null;
  canViewAttendance: boolean;
  canViewFees: boolean;
  canPayFees: boolean;
  canViewResults: boolean;
  canViewTimetable: boolean;
  canManageLeave: boolean;
  parentActive: boolean;
  loginState: 'ACTIVE' | 'DISABLED' | 'MISSING';
}

/** parentId is never supplied by the caller — Edunexify generates it (par_YYnnnnnn).
 *  email is required (unlike before): it's the only way to deliver the account setup link,
 *  since no temporary password is ever admin-typed or exposed (Option A onboarding). */
export interface CreateParentRequest {
  name: string;
  email: string;
  phoneNumber: string;
}

export interface LinkStudentRequest {
  studentId: string;
  relationshipType: string;
  primaryGuardian: boolean;
  canViewAttendance: boolean;
  canViewFees: boolean;
  canPayFees: boolean;
  canViewResults: boolean;
  canViewTimetable: boolean;
  canManageLeave: boolean;
  effectiveFrom: string;
  effectiveUntil?: string | null;
  /** True once the admin confirmed taking primary over from the current primary guardian. */
  replacePrimary?: boolean;
}
