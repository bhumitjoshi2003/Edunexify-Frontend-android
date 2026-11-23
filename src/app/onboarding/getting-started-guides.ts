import { FEATURES, FeatureKey } from '../auth/feature-keys';
import { HelpTopicId } from '../help/help-content';
import { ChildAccess } from '../interfaces/parent-portal';

/**
 * Role-specific getting-started guides: short, optional checklists on each role's home page.
 * Shared by the web and Android clients — keep the two copies identical.
 *
 * The Teacher guide (TeacherGettingStartedComponent) is separate and unchanged; a Coordinator in the
 * Teacher workspace keeps seeing it. These guides cover everyone else, and the Coordinator workspace.
 *
 * A step is shown only when the viewer could act on it now: its page passes the same checks as
 * contextual help (role, workspace, plan feature, Principal permission, page present on this
 * platform), its plan feature is on and, for a parent, at least one child allows it.
 *
 * How a step completes — never by pressing its button:
 *  - `data`:   the step's page loaded its own data successfully (a 2xx response from the page's API
 *              while that page is open). Failed, refused or redirected loads never count.
 *  - `route`:  the page opened (navigation finished on it, after guards and redirects). Used only
 *              where finding the page is the whole point of the step.
 *  - `setup`:  the school's readiness item is complete on the server (Admin only).
 *  - `event`:  the viewer did the thing itself (chose a child; switched to the Teacher workspace).
 *  - `device`: the device permission is granted (Android notifications).
 */
export type GuideAudience = 'ADMIN' | 'SUB_ADMIN' | 'PRINCIPAL' | 'COORDINATOR' | 'PARENT' | 'STUDENT';

export type ChildPermission = Extract<keyof ChildAccess,
  'canViewAttendance' | 'canViewFees' | 'canViewResults' | 'canManageLeave' | 'canViewTimetable'>;

/** A response that shows the step's page has loaded its data (path is relative to the API base). */
export interface ApiMatcher {
  method?: 'GET' | 'PUT' | 'POST';
  path: RegExp;
  /** Extra condition on the response body (e.g. a signature is actually saved). */
  when?: (body: unknown) => boolean;
}

export type StepCompletion =
  | { kind: 'data'; api: readonly ApiMatcher[] }
  | { kind: 'route' }
  | { kind: 'setup'; setupKey: string }
  | { kind: 'event'; event: GuideEvent }
  | { kind: 'device'; permission: 'notifications' };

export type GuideEvent = 'child-chosen' | 'teacher-workspace';

/** A page the step opens. `:studentId` in the path or a query value is the selected child. */
export interface GuideAction {
  label: string;
  path: string;
  queryParams?: Readonly<Record<string, string>>;
}

export interface GuideStep {
  id: string;
  title: string;
  description: string;
  icon: string;
  /** Pages to open; the first one the viewer may open is used. Empty for event and device steps. */
  actions: readonly GuideAction[];
  completion: StepCompletion;
  /** Label of the button for an event or device step. */
  actionLabel?: string;
  feature?: FeatureKey;
  /** Parent only: the child access this step needs (at least one child must have it). */
  childPermission?: ChildPermission;
  /** Parent only: shown only when more than one child is linked. */
  multipleChildrenOnly?: boolean;
  /** Contextual help topic for the step's small help button. */
  help?: HelpTopicId;
}

export interface GuideDefinition {
  audience: GuideAudience;
  /** Small heading above "Getting started". */
  kicker: string;
  /** The page the guide lives on (where "Show getting-started guide" returns to). */
  home: string;
  steps: readonly GuideStep[];
}

const NOTIFICATIONS: GuideStep = {
  id: 'notifications', title: 'Turn on notifications', icon: 'notifications_none',
  description: 'Get school notices, attendance and leave updates on this phone.',
  actions: [], actionLabel: 'Turn on', completion: { kind: 'device', permission: 'notifications' },
};

export const GUIDES: Readonly<Record<GuideAudience, GuideDefinition>> = {
  ADMIN: {
    audience: 'ADMIN', kicker: 'Admin', home: '/dashboard/admin-dashboard',
    steps: [
      { id: 'readiness', title: 'Check school readiness', icon: 'fact_check', help: 'school-settings',
        description: 'See what is set up and what still needs attention.',
        actions: [{ label: 'Open School Setup', path: 'school-setup' }, { label: 'Open School Settings', path: 'school-settings' }],
        completion: { kind: 'data', api: [{ path: /^\/school\/setup-health$/ }, { path: /^\/school\/settings$/ }] } },
      { id: 'teachers', title: 'Add your teachers', icon: 'badge',
        description: 'Done when your school has at least one teacher.',
        actions: [{ label: 'Add teachers', path: 'register' }],
        completion: { kind: 'setup', setupKey: 'TEACHERS' } },
      { id: 'students', title: 'Add your students', icon: 'groups',
        description: 'Done when your school has students on record.',
        actions: [{ label: 'Add students', path: 'register' }],
        completion: { kind: 'setup', setupKey: 'STUDENTS' } },
      { id: 'fees', title: 'Set up fees', icon: 'account_balance_wallet', feature: FEATURES.FEE_MANAGEMENT, help: 'fees',
        description: 'Done when fee heads and amounts are configured.',
        actions: [{ label: 'Open Fee Structure', path: 'fee-structure' }],
        completion: { kind: 'setup', setupKey: 'FEE_CONFIGURATION' } },
      { id: 'leave', title: 'Review leave requests', icon: 'event_note', help: 'leave',
        description: 'Find student leave waiting for a decision.',
        actions: [{ label: 'Open leave', path: 'view-leaves' }],
        completion: { kind: 'data', api: [{ path: /^\/leaves\/student(\/|$)/ }] } },
      { id: 'staff-app', title: 'Bring teachers onto the app', icon: 'phone_android',
        description: 'See who has signed in and remind the rest.',
        actions: [{ label: 'Open Staff Adoption', path: 'staff-adoption' }],
        completion: { kind: 'data', api: [{ path: /^\/admin\/staff-adoption$/ }] } },
    ],
  },
  SUB_ADMIN: {
    audience: 'SUB_ADMIN', kicker: 'Sub-admin', home: '/dashboard/admin-dashboard',
    steps: [
      { id: 'classes', title: 'Review classes and sections', icon: 'class',
        description: 'Check the classes and sections your school uses.',
        actions: [{ label: 'Open classes', path: 'class-management' }],
        completion: { kind: 'data', api: [{ path: /^\/school\/classes\/manage$/ }] } },
      { id: 'timetable', title: 'Open the timetable', icon: 'calendar_month', help: 'timetable',
        description: 'See and build each section’s weekly schedule.',
        actions: [{ label: 'Open timetable', path: 'timetable' }],
        completion: { kind: 'data', api: [{ path: /^\/timetable\/class\// }] } },
      { id: 'substitutions', title: 'Cover absent teachers', icon: 'swap_horiz', help: 'timetable',
        description: 'Find periods that need a substitute today.',
        actions: [{ label: 'Open substitutions', path: 'teacher-substitutions' }],
        completion: { kind: 'data', api: [{ path: /^\/substitutions\/overview$/ }] } },
      { id: 'attendance', title: 'Find attendance', icon: 'fact_check', help: 'attendance',
        description: 'Know where class attendance summaries are.',
        actions: [{ label: 'Open attendance', path: 'attendance-summary' }],
        completion: { kind: 'route' } },
      { id: 'notices', title: 'Read the notice board', icon: 'campaign',
        description: 'See notices shared with the school.',
        actions: [{ label: 'Open notices', path: 'notice' }],
        completion: { kind: 'data', api: [{ path: /^\/notification\/(user|all)$/ }] } },
    ],
  },
  PRINCIPAL: {
    audience: 'PRINCIPAL', kicker: 'Principal', home: '/dashboard/principal-dashboard',
    steps: [
      { id: 'signature', title: 'Add your signature', icon: 'draw', feature: FEATURES.REPORT_CARDS, help: 'report-cards',
        description: 'Done when your signature is saved for report cards.',
        actions: [{ label: 'Open signature', path: 'my-signature' }],
        completion: { kind: 'data', api: [
          { method: 'GET', path: /^\/signatures\/me$/, when: body => (body as { saved?: unknown } | null)?.saved === true },
          { method: 'PUT', path: /^\/signatures\/me$/ },
        ] } },
      { id: 'leave', title: 'Review student leave', icon: 'event_note', help: 'leave',
        description: 'See leave requests waiting for a decision.',
        actions: [{ label: 'Open leave', path: 'view-leaves' }],
        completion: { kind: 'data', api: [{ path: /^\/leaves\/student(\/|$)/ }] } },
      { id: 'staff-attendance', title: 'Check staff attendance', icon: 'how_to_reg', help: 'attendance',
        description: 'See who has checked in today.',
        actions: [{ label: 'Open staff attendance', path: 'staff-attendance' }],
        completion: { kind: 'data', api: [{ path: /^\/principal\/staff-attendance\/date\// }] } },
      { id: 'attendance', title: 'Find student attendance', icon: 'fact_check', help: 'attendance',
        description: 'Know where class attendance summaries are.',
        actions: [{ label: 'Open attendance', path: 'attendance-summary' }],
        completion: { kind: 'route' } },
      { id: 'report-cards', title: 'Review report cards', icon: 'school', feature: FEATURES.REPORT_CARDS, help: 'report-cards',
        description: 'Follow report cards through review and publication.',
        actions: [{ label: 'Open review', path: 'report-card-review' }],
        completion: { kind: 'data', api: [{ path: /^\/principal\/report-cards$/ }] } },
    ],
  },
  COORDINATOR: {
    audience: 'COORDINATOR', kicker: 'Coordinator workspace', home: '/dashboard/coordinator-dashboard',
    steps: [
      { id: 'staff-attendance', title: 'Check staff attendance', icon: 'how_to_reg', help: 'attendance',
        description: 'See who has checked in today.',
        actions: [{ label: 'Open staff attendance', path: 'staff-attendance' }],
        completion: { kind: 'data', api: [{ path: /^\/coordinator\/staff-attendance\/date\// }] } },
      { id: 'substitutions', title: 'Cover absent teachers', icon: 'swap_horiz', help: 'timetable',
        description: 'Find periods in your scope that need a substitute.',
        actions: [{ label: 'Open substitutions', path: 'teacher-substitutions' }],
        completion: { kind: 'data', api: [{ path: /^\/substitutions\/overview$/ }] } },
      { id: 'report-cards', title: 'Review report-card progress', icon: 'school', feature: FEATURES.REPORT_CARDS, help: 'report-cards',
        description: 'See where your classes’ report cards stand.',
        actions: [{ label: 'Open review', path: 'report-card-review' }],
        completion: { kind: 'data', api: [{ path: /^\/coordinator\/report-cards$/ }] } },
      { id: 'student-search', title: 'Find a student', icon: 'person_search',
        description: 'Know where to look up any student.',
        actions: [{ label: 'Open search', path: 'student-search' }],
        completion: { kind: 'route' } },
      { id: 'teacher-workspace', title: 'Switch to your Teacher workspace', icon: 'swap_horiz',
        description: 'Your own classes, check-in and leave live there.',
        actions: [], actionLabel: 'Switch', completion: { kind: 'event', event: 'teacher-workspace' } },
    ],
  },
  PARENT: {
    audience: 'PARENT', kicker: 'Parent', home: '/dashboard/parent-dashboard',
    steps: [
      { id: 'choose-child', title: 'Choose a child', icon: 'family_restroom', multipleChildrenOnly: true,
        description: 'Pick whose information to see. You can switch any time.',
        actions: [], actionLabel: 'Choose', completion: { kind: 'event', event: 'child-chosen' } },
      { id: 'attendance', title: 'Check attendance', icon: 'fact_check', childPermission: 'canViewAttendance', help: 'attendance',
        description: 'See your child’s monthly attendance.',
        actions: [{ label: 'Open attendance', path: 'attendance-summary', queryParams: { studentId: ':studentId' } }],
        completion: { kind: 'data', api: [{ path: /^\/attendance\/summary\/student\// }] } },
      { id: 'fees', title: 'See fees', icon: 'account_balance_wallet', feature: FEATURES.FEE_MANAGEMENT, childPermission: 'canViewFees', help: 'fees',
        description: 'See dues and what has been paid.',
        actions: [{ label: 'Open fees', path: 'fees/:studentId' }],
        completion: { kind: 'data', api: [{ path: /^\/student-fees\/(?!sessions\/)[^/]+\/[^/]+$/ }] } },
      { id: 'results', title: 'See results', icon: 'workspace_premium', feature: FEATURES.EXAMS_RESULTS, childPermission: 'canViewResults', help: 'results',
        description: 'Results appear after the school publishes them.',
        actions: [{ label: 'Open results', path: 'my-results', queryParams: { studentId: ':studentId' } }],
        completion: { kind: 'data', api: [{ path: /^\/marks\/student\/[^/]+\/results$/ }] } },
      { id: 'leave', title: 'Find where to apply for leave', icon: 'event_available', childPermission: 'canManageLeave', help: 'leave',
        description: 'Apply for and track your child’s leave.',
        actions: [{ label: 'Open leave', path: 'apply-leave', queryParams: { studentId: ':studentId' } }],
        completion: { kind: 'route' } },
      NOTIFICATIONS,
    ],
  },
  STUDENT: {
    audience: 'STUDENT', kicker: 'Student', home: '/dashboard/student-dashboard',
    steps: [
      { id: 'timetable', title: 'See your timetable', icon: 'calendar_month', help: 'timetable',
        description: 'Your periods for each day of the week.',
        actions: [{ label: 'Open timetable', path: 'timetable' }],
        completion: { kind: 'data', api: [{ path: /^\/timetable\/class\// }] } },
      { id: 'attendance', title: 'Check your attendance', icon: 'fact_check', help: 'attendance',
        description: 'See your attendance for the month.',
        actions: [{ label: 'Open attendance', path: 'attendance-summary' }],
        completion: { kind: 'data', api: [{ path: /^\/attendance\/summary\/student\// }] } },
      { id: 'homework', title: 'See homework', icon: 'menu_book', feature: FEATURES.CLASSROOM,
        description: 'Work your teachers have set.',
        actions: [{ label: 'Open homework', path: 'homework' }],
        completion: { kind: 'data', api: [{ path: /^\/homework-classwork\/student$/ }] } },
      { id: 'fees', title: 'See your fees', icon: 'account_balance_wallet', feature: FEATURES.FEE_MANAGEMENT, help: 'fees',
        description: 'See dues and what has been paid.',
        actions: [{ label: 'Open fees', path: 'fees' }],
        completion: { kind: 'data', api: [{ path: /^\/student-fees\/(?!sessions\/)[^/]+\/[^/]+$/ }] } },
      { id: 'results', title: 'See your results', icon: 'workspace_premium', feature: FEATURES.EXAMS_RESULTS, help: 'results',
        description: 'Results appear after your school publishes them.',
        actions: [{ label: 'Open results', path: 'my-results' }],
        completion: { kind: 'data', api: [{ path: /^\/marks\/student\/[^/]+\/results$/ }] } },
      NOTIFICATIONS,
    ],
  },
};

/** Turns a route path (e.g. `fees/:studentId`) into a matcher for a /dashboard URL path. */
export function routePattern(path: string): RegExp {
  const body = path.split('/').map(s => s.startsWith(':') ? '[^/]+' : s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('/');
  return new RegExp(`^${body}$`);
}

/** Fills `:studentId` in a guide action. Null when the action needs a child and none is given. */
export function resolveAction(action: GuideAction, studentId: string | null): { commands: string[]; queryParams?: Record<string, string> } | null {
  const fill = (v: string) => v === ':studentId' ? studentId : v;
  const segments = action.path.split('/').map(fill);
  const query = action.queryParams ? Object.fromEntries(Object.entries(action.queryParams).map(([k, v]) => [k, fill(v)])) : undefined;
  if (segments.some(s => s === null) || (query && Object.values(query).some(v => v === null))) return null;
  return { commands: ['/dashboard', ...(segments as string[])], queryParams: query as Record<string, string> | undefined };
}
