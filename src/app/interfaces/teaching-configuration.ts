import { AcademicSession } from './academic-session';

export interface SessionCopyRequest {
  sourceAcademicSessionId: number;
  targetAcademicSessionId: number;
}
export interface SessionCopyResult {
  sourceAcademicSessionId: number;
  targetAcademicSessionId: number;
  scanned: number;
  copied: number;
  alreadyCopied: number;
  skippedIneligibleTeacher: number;
  skippedInvalidClass: number;
  skippedInvalidSection: number;
  /** Only present on the class-teacher-responsibility copy result (a separate backend endpoint
   *  sharing this TS shape) — the timetable copy no longer has a conflict concept, since any
   *  number of rows may occupy the same target slot. */
  conflicts?: number;
  failures: number;
  details: { sourceEntryId?: number; targetEntryId?: number; sourceId?: number; targetId?: number; outcome: string; reason: string | null }[];
}
export interface ResponsibilityRequest {
  academicSessionId: number;
  classId: number;
  sectionId: number | null;
  teacherId: string;
}
export interface Responsibility {
  id: number;
  academicSessionId: number;
  classId: number;
  className: string | null;
  sectionId: number | null;
  sectionName: string | null;
  configuredTeacherId: string;
  configuredTeacherName: string | null;
  liveTeacherId: string | null;
  liveTeacherName: string | null;
  liveMatchesConfigured: boolean;
}
export type ActivationState = 'NEVER_APPLIED' | 'APPLIED_IN_SYNC' | 'APPLIED_BUT_DRIFTED';
export interface ActivationRow {
  classId: number | null;
  className: string | null;
  sectionId: number | null;
  sectionName: string | null;
  configuredTeacherId: string | null;
  configuredTeacherName: string | null;
  priorLiveTeacherId: string | null;
  priorLiveTeacherName: string | null;
  outcome: string;
  reason: string | null;
}
export interface ActivationResult {
  academicSessionId: number;
  activationState: ActivationState;
  lastAppliedAt: string | null;
  lastAppliedBy: string | null;
  unchanged: number;
  ineligibleTeacher: number;
  invalidClassOrSection: number;
  details: ActivationRow[];
}
export interface ActivationPreview extends ActivationResult {
  inSync: boolean;
  hasIssues: boolean;
  /** Raw class_teacher_responsibility row count for this session, BEFORE validity filtering —
   *  lets a caller distinguish "zero rows configured" from "rows configured but all ineligible/
   *  invalid" from "rows configured and valid but already matching live," none of which can be
   *  told apart from becomingLive/changing/clearing alone. Optional only so existing test
   *  literals need not be touched; always present on a real backend response. */
  configuredCount?: number;
  becomingLive: number;
  changing: number;
  clearing: number;
}
export interface ActivationApply extends ActivationResult { applied: number; cleared: number; }
export interface SessionActivationOutcome {
  session: AcademicSession;
  /** False only when the target was ALREADY the current session — a genuine no-op, not a
   *  redundant re-apply. {@code activation} is null in that case. */
  activationPerformed: boolean;
  activation: ActivationApply | null;
}
