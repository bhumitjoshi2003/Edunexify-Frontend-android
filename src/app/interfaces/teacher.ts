export interface Teacher {
  teacherId: string;
  name: string;
  email?: string;
  phoneNumber?: string;
  dob?: string;
  gender?: string;
  classTeacher?: string | null;
  /**
   * Section/group this teacher is class teacher of. Required by the backend when the
   * class named in `classTeacher` has active sections configured, and must be null
   * when it has none.
   */
  classTeacherSectionId?: number | null;
  joiningDate?: string;
  photoUrl?: string;
  /** UPCOMING: joining (or rejoining) date still ahead — not working yet, login inactive. */
  status?: 'ACTIVE' | 'UPCOMING' | 'LEFT';
  /** Most recent rejoining date after an exit (the original joiningDate is kept). */
  rejoinDate?: string | null;
  leavingDate?: string;
  reasonForLeaving?: string;
  exitRemarks?: string;
}

export interface TeacherExitRequest {
  reasonForLeaving: string;
  leavingDate: string;
  exitRemarks?: string;
}

/** Rejoin choices; all optional (date defaults to today). No earlier class-teacher role is restored. */
export interface TeacherRejoinRequest {
  rejoinDate?: string | null;
  classTeacher?: string | null;
  classTeacherSectionId?: number | null;
}

export interface TeacherLoginStatus {
  exists: boolean;
  active: boolean;
}

export interface TeacherTimetablePeriod {
  timetableEntryId: number;
  day?: string | null;
  periodNumber?: number | null;
  startTime?: string | null;
  endTime?: string | null;
  className?: string | null;
  sectionName?: string | null;
  subjectName?: string | null;
}

export interface TeacherClassGrant {
  id: number;
  className: string;
  sectionName?: string | null;
}

/** Read-only responsibility overview for Teacher Details (admin). */
export interface TeacherOverview {
  teacherId: string;
  status: 'ACTIVE' | 'UPCOMING' | 'LEFT';
  joiningDate?: string | null;
  rejoinDate?: string | null;
  startsOn?: string | null;
  leavingDate?: string | null;
  exitScheduled: boolean;
  reasonForLeaving?: string | null;
  classTeacher?: string | null;
  classTeacherSectionId?: number | null;
  classTeacherSectionName?: string | null;
  classTeacherConfigurationExists: boolean;
  timetablePeriods: TeacherTimetablePeriod[];
  grants: TeacherClassGrant[];
  login: TeacherLoginStatus;
  pendingLeaveCount: number;
  upcomingCoverCount: number;
}

export interface ClassTeacherConfigurationStatus {
  configurationExists: boolean;
  sessionLabel?: string | null;
}
