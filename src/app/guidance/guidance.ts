import { HelpAudience } from '../help/help-content';

/**
 * Actionable page states: what happened and what to do next, for the person reading.
 * Shared by the web and Android clients — keep the two copies identical.
 *
 * The seven kinds are deliberately distinct. A failed request or a refused permission is never
 * shown as "nothing here": only a successful, empty answer is `empty` (or `no-match` when the
 * viewer's own filters hide everything).
 *
 * Actions are route paths under /dashboard. The guidance component shows an action only when the
 * viewer could open that page now (the same rules as contextual help: role, workspace, plan feature
 * and Principal permission). When no action is shown, `fallback` says whom to ask or when the
 * information appears.
 */
export type GuidanceKind =
  | 'empty'          // the request worked and there is nothing yet
  | 'prerequisite'   // something must be set up first
  | 'load-error'     // the request failed; Retry
  | 'no-permission'  // the server refused this viewer
  | 'plan'           // the school's plan does not include the feature
  | 'unpublished'    // the data exists but is not released to this viewer yet
  | 'no-match';      // the viewer's filters hide every record

export interface GuidanceAction {
  label: string;
  path: string;
  queryParams?: Record<string, string>;
  /** Only for these audiences (omitted = whoever may open the page). */
  for?: readonly HelpAudience[];
}

/** Whom to ask, by audience; `default` for everyone else. */
export type GuidanceFallback = Partial<Record<HelpAudience | 'default', string>>;

export interface Guidance {
  kind: GuidanceKind;
  title: string;
  message?: string;
  actions?: readonly GuidanceAction[];
  fallback?: GuidanceFallback;
}

const ASK_ADMIN: GuidanceFallback = {
  default: 'Ask your school admin to set this up.',
  STUDENT: 'Your school has not set this up yet. Please check again later.',
  PARENT: 'Your school has not set this up yet. Please check again later.',
};

/** Standard states, so the same situation reads the same on every page. */
export const GUIDANCE = {
  noClasses: (): Guidance => ({
    kind: 'prerequisite',
    title: 'No classes yet',
    message: 'Classes and sections are needed before subjects can be added.',
    actions: [{ label: 'Open Class Management', path: 'class-management' }],
    fallback: ASK_ADMIN,
  }),
  noSubjectsForClass: (className?: string): Guidance => ({
    kind: 'prerequisite',
    title: className ? `No subjects for Class ${className} yet` : 'No subjects for this class yet',
    message: 'Add the class\'s subjects in Subject Configuration first.',
    actions: [{ label: 'Open Subject Configuration', path: 'subject-config' }],
    fallback: ASK_ADMIN,
  }),
  noExamSubjects: (): Guidance => ({
    kind: 'prerequisite',
    title: 'This exam has no subjects yet',
    message: 'Add the exam\'s subjects and maximum marks in Exam Configuration.',
    actions: [{ label: 'Open Exam Configuration', path: 'exam-config' }],
    fallback: ASK_ADMIN,
  }),
  noExams: (className?: string, session?: string): Guidance => ({
    kind: 'empty',
    title: 'No exams yet',
    message: className
      ? `Class ${className}${session ? `, ${session}` : ''} has no exams. Type an exam name above and press + Add Exam.`
      : 'Type an exam name above and press + Add Exam.',
  }),
  noReportCardSetup: (): Guidance => ({
    kind: 'prerequisite',
    title: 'No report card for this class yet',
    message: 'A report card is created in Report Card Setup.',
    actions: [{ label: 'Open Report Card Setup', path: 'report-cards-v2/setup' }],
    fallback: { default: 'Ask your school admin to create it in Report Card Setup.' },
  }),
  noSession: (): Guidance => ({
    kind: 'prerequisite',
    title: 'No academic session yet',
    message: 'Add an academic session in School Settings first.',
    actions: [{ label: 'Open School Settings', path: 'school-settings' }],
    fallback: ASK_ADMIN,
  }),
  noFeeHeads: (): Guidance => ({
    kind: 'prerequisite',
    title: 'No fee heads yet',
    message: 'Fee heads (for example Tuition) are needed before amounts can be set.',
    actions: [{ label: 'Open Fee Heads', path: 'fee-head-management' }],
    fallback: ASK_ADMIN,
  }),
  noFeesGenerated: (): Guidance => ({
    kind: 'prerequisite',
    title: 'No fees generated yet',
    message: 'This student has no fee charges for the selected session.',
    actions: [{ label: 'Open Fee Assignment', path: 'fee-assignment', for: ['ADMIN'] }],
    fallback: {
      default: 'The school office adds fees for each session.',
      STUDENT: 'Your school has not added fees for this session yet. Please check again later or ask the school office.',
      PARENT: 'The school has not added fees for this session yet. Please check again later or ask the school office.',
    },
  }),
  notClassTeacher: (): Guidance => ({
    kind: 'prerequisite',
    title: 'You are not a class teacher yet',
    message: 'This page shows your own class. A school admin makes you the class teacher of a class.',
    fallback: { default: 'Ask your school admin to assign you a class.' },
  }),
  noStudentsInClass: (): Guidance => ({
    kind: 'prerequisite',
    title: 'No students in this class',
    message: 'No students are placed in this class and section on this date.',
    actions: [{ label: 'Open Students', path: 'student-list', for: ['ADMIN'] }],
    fallback: { default: 'Ask your school admin to check the student records.' },
  }),
  noTimetable: (): Guidance => ({
    kind: 'empty',
    title: 'No periods assigned to you yet',
    message: 'Your schedule appears here once periods list you as the teacher.',
    fallback: { default: 'Ask your school admin to set up your timetable.' },
  }),
  resultsNotPublished: (): Guidance => ({
    kind: 'unpublished',
    title: 'No published results yet',
    message: 'Results appear here after your school publishes them.',
  }),
  reportCardsNotPublished: (): Guidance => ({
    kind: 'unpublished',
    title: 'No report cards yet',
    message: 'Report cards appear here after your school publishes them.',
  }),
  noMatches: (what: string): Guidance => ({
    kind: 'no-match',
    title: `No ${what} match these filters`,
    message: 'Clear or change the filters to see more.',
  }),
  noRecords: (title: string, message?: string): Guidance => ({ kind: 'empty', title, message }),
} as const;

interface HttpLikeError { status?: number; error?: unknown }

/** The server's own short message, when it gave one. */
function serverMessage(err: HttpLikeError): string | null {
  const body = err.error as { message?: unknown; code?: unknown } | string | null | undefined;
  const text = typeof body === 'string' ? body : typeof body?.message === 'string' ? body.message : null;
  return text && text.length <= 200 && !text.trim().startsWith('<') ? text.trim() : null;
}

/**
 * A failed request as guidance — never as "empty". `what` names the data, e.g. "leave applications".
 * 403 is a refused permission (or, with FEATURE_NOT_AVAILABLE, the school plan); network and
 * server failures can be retried.
 */
export function errorGuidance(err: unknown, what: string): Guidance {
  const e = (err ?? {}) as HttpLikeError;
  const status = typeof e.status === 'number' ? e.status : -1;
  const code = typeof e.error === 'object' && e.error ? (e.error as { code?: unknown }).code : undefined;
  if (status === 403 && code === 'FEATURE_NOT_AVAILABLE') {
    return { kind: 'plan', title: 'Not part of your school\'s plan', message: serverMessage(e) ?? undefined,
      fallback: { default: 'Ask your school admin about upgrading the plan.' } };
  }
  if (status === 403) {
    return { kind: 'no-permission', title: `You can't open these ${what}`, message: serverMessage(e) ?? undefined,
      fallback: { default: 'If you need access, ask your school admin.' } };
  }
  if (status === 0) {
    return { kind: 'load-error', title: `Couldn't load ${what}`, message: 'Edunexify could not be reached. Check your internet connection and try again.' };
  }
  if (status >= 400 && status < 500) {
    return { kind: 'load-error', title: `Couldn't load ${what}`, message: serverMessage(e) ?? 'Please try again.' };
  }
  return { kind: 'load-error', title: `Couldn't load ${what}`, message: 'Edunexify could not load this right now. Please try again in a moment.' };
}
