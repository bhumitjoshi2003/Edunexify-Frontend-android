export interface TimetableEntry {
  id?: number;
  academicSessionId?: number;
  className: string;
  classId?: number;
  sectionId?: number | null;
  sectionName?: string | null;
  day: string;           // 'MONDAY' | 'TUESDAY' | ... | 'SATURDAY'
  periodNumber: number;  // 1–8
  startTime: string;     // 'HH:mm'
  endTime: string;       // 'HH:mm'
  subjectName: string;
  teacherId: string;
  teacherName?: string;
  isSubstitution?: boolean;
  originalTeacherName?: string | null;
  /** Covered periods only: the admin's optional note for the substitute. */
  substitutionNote?: string | null;
  /** Covered periods only: the real timetable entry id (their `id` is a negative display key). */
  timetableEntryId?: number | null;
}

/** Exact create/update body; display names are response-only. */
export interface TimetableEntryRequest {
  academicSessionId?: number;
  classId: number;
  sectionId: number | null;
  day: string;
  periodNumber: number;
  startTime: string;
  endTime: string;
  subjectName: string;
  teacherId: string;
}
