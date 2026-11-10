export type AssessmentType = 'CLASS_TEST' | 'UNIT_TEST' | 'PRACTICAL' | 'PRE_BOARD' | 'INTERNAL_ASSESSMENT' | 'OTHER';

export interface AssessmentAttachment {
  fileName: string;
  contentType: string;
  fileSize: number;
  type: 'IMAGE' | 'PDF';
  /** Short-lived presigned download URL. */
  url: string;
  /** Only returned to editors (needed to keep the attachment on edit). */
  objectKey: string | null;
}

export interface AssessmentAttachmentRef {
  objectKey: string;
  fileName: string;
}

/** A section the caller may target (sectionId null = the whole class) and its subjects. */
export interface AssessmentContextSection {
  sectionId: number | null;
  sectionName: string | null;
  subjects: string[];
}

export interface AssessmentContextClass {
  classId: number;
  className: string;
  sections: AssessmentContextSection[];
}

export interface Assessment {
  id: number;
  assessmentType: AssessmentType;
  typeLabel: string;
  title: string;
  classId: number;
  className: string;
  sectionId: number | null;
  sectionName: string | null;
  subjectName: string;
  /** YYYY-MM-DD */
  assessmentDate: string;
  /** HH:mm or HH:mm:ss */
  startTime: string | null;
  endTime: string | null;
  syllabus: string;
  instructions: string | null;
  attachment: AssessmentAttachment | null;
  createdByUserId: string;
  createdByName: string | null;
  createdByRole: 'TEACHER' | 'ADMIN' | 'PRINCIPAL';
  createdAt: string;
  updatedAt: string;
  /** Effective permissions computed by the server — never inferred on the client. */
  canEdit: boolean;
  canDelete: boolean;
  createdByCurrentUser: boolean;
}

export interface CreateAssessmentRequest {
  assessmentType: AssessmentType;
  title: string;
  classId: number;
  sectionId: number | null;
  subjectName: string;
  assessmentDate: string;
  startTime: string | null;
  endTime: string | null;
  syllabus: string;
  instructions: string | null;
  attachment: AssessmentAttachmentRef | null;
}

/** Class/section/subject cannot change after creation. attachment null removes it. */
export interface UpdateAssessmentRequest {
  assessmentType: AssessmentType;
  title: string;
  assessmentDate: string;
  startTime: string | null;
  endTime: string | null;
  syllabus: string;
  instructions: string | null;
  attachment: AssessmentAttachmentRef | null;
}

export interface AssessmentTypeMeta {
  key: AssessmentType;
  label: string;
  icon: string;
  /** Colour theme index (tone-0…tone-5). */
  tone: number;
}

export const ASSESSMENT_TYPES: AssessmentTypeMeta[] = [
  { key: 'CLASS_TEST', label: 'Class Test', icon: 'quiz', tone: 0 },
  { key: 'UNIT_TEST', label: 'Unit Test', icon: 'assignment', tone: 5 },
  { key: 'PRACTICAL', label: 'Practical', icon: 'science', tone: 2 },
  { key: 'PRE_BOARD', label: 'Pre-Board', icon: 'workspace_premium', tone: 4 },
  { key: 'INTERNAL_ASSESSMENT', label: 'Internal', icon: 'fact_check', tone: 1 },
  { key: 'OTHER', label: 'Other', icon: 'event_note', tone: 3 },
];

export const ASSESSMENT_ATTACHMENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
export const ASSESSMENT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const ASSESSMENT_TITLE_MAX = 150;
export const ASSESSMENT_SYLLABUS_MAX = 3000;
export const ASSESSMENT_INSTRUCTIONS_MAX = 2000;

export function assessmentTypeMeta(type: AssessmentType): AssessmentTypeMeta {
  return ASSESSMENT_TYPES.find(t => t.key === type) ?? ASSESSMENT_TYPES[ASSESSMENT_TYPES.length - 1];
}

/** Local YYYY-MM-DD (never UTC-shifted). */
export function assessmentDateKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Whole days from today to the given YYYY-MM-DD (negative = past). */
export function daysUntil(isoDate: string, today: Date = new Date()): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  const target = Date.UTC(y, m - 1, d);
  const base = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target - base) / 86_400_000);
}

/** "Today", "Tomorrow", "In 3 days", "Yesterday", "5 days ago". */
export function countdownLabel(isoDate: string, today: Date = new Date()): string {
  const days = daysUntil(isoDate, today);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days > 1) return `In ${days} days`;
  if (days === -1) return 'Yesterday';
  return `${-days} days ago`;
}

/** Colour of a countdown: today, tomorrow, within a week, later, or past. */
export function countdownTone(isoDate: string, today: Date = new Date()): 'today' | 'tomorrow' | 'soon' | 'later' | 'past' {
  const days = daysUntil(isoDate, today);
  if (days < 0) return 'past';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return days <= 7 ? 'soon' : 'later';
}

/** "10:00 AM" from "10:00" / "10:00:00". */
export function formatAssessmentTime(time: string | null): string | null {
  if (!time) return null;
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** "10:00 AM – 11:00 AM", "10:00 AM", or null. */
export function assessmentTimeRange(start: string | null, end: string | null): string | null {
  const s = formatAssessmentTime(start);
  const e = formatAssessmentTime(end);
  if (s && e) return `${s} – ${e}`;
  return s;
}

/** "Class 8 – A" / "Class 8". */
export function assessmentClassLabel(className: string, sectionName?: string | null): string {
  return sectionName ? `Class ${className} – ${sectionName}` : `Class ${className}`;
}

/** Day / month / weekday parts of a YYYY-MM-DD for the date tile. */
export function dateParts(isoDate: string): { day: string; month: string; weekday: string } {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return {
    day: String(d),
    month: date.toLocaleDateString('en-IN', { month: 'short' }),
    weekday: date.toLocaleDateString('en-IN', { weekday: 'short' }),
  };
}
