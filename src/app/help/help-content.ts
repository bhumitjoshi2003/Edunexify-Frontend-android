import { FEATURES, FeatureKey } from '../auth/feature-keys';

/**
 * Contextual help: static, typed content for the "?" button in page headers.
 * Shared by the web and Android clients — keep the two copies identical.
 *
 * Written for school staff, students and parents in plain English. Every line describes what the
 * page really does today; when a page changes, change its help in the same commit.
 *
 * `for` limits a line to some audiences (omitted = everyone who can open the page). Links are
 * route paths under /dashboard; HelpService shows a link only if the viewer could open it right now
 * (role, workspace, Principal permission and school plan), so a link is never a way in.
 */
export type HelpAudience = 'ADMIN' | 'SUB_ADMIN' | 'PRINCIPAL' | 'COORDINATOR' | 'TEACHER' | 'PARENT' | 'STUDENT';

export type HelpTopicId =
  | 'subjects' | 'timetable' | 'attendance' | 'leave' | 'exams'
  | 'marks' | 'results' | 'report-cards' | 'fees' | 'school-settings';

export interface HelpLine { text: string; for?: readonly HelpAudience[] }
export interface HelpWorkflow { title: string; steps: readonly string[]; for?: readonly HelpAudience[] }
export interface HelpProblem { problem: string; solution: string; for?: readonly HelpAudience[] }
export interface HelpLink { label: string; path: string; for?: readonly HelpAudience[] }

export interface HelpTopic {
  id: HelpTopicId;
  title: string;
  /** Pages (route paths under /dashboard) whose header shows this topic. */
  pages: readonly string[];
  /** Plan feature the topic depends on; core features are always available. */
  feature?: FeatureKey;
  about: readonly HelpLine[];
  prerequisites: readonly HelpLine[];
  workflows: readonly HelpWorkflow[];
  problems: readonly HelpProblem[];
  links: readonly HelpLink[];
}

const STAFF_SETUP: readonly HelpAudience[] = ['ADMIN', 'PRINCIPAL', 'COORDINATOR'];
const LEADERS: readonly HelpAudience[] = ['ADMIN', 'PRINCIPAL'];
const FAMILY: readonly HelpAudience[] = ['STUDENT', 'PARENT'];

export const HELP_TOPICS: Readonly<Record<HelpTopicId, HelpTopic>> = {
  subjects: {
    id: 'subjects',
    title: 'Subjects',
    pages: ['subject-config'],
    about: [
      { text: 'Subject Configuration lists the subjects each class studies. Timetable periods, exams and marks can only use subjects listed here.' },
      { text: 'You only see the classes your coordination covers in full.', for: ['COORDINATOR'] },
    ],
    prerequisites: [
      { text: 'The class must already exist in Class Management.' },
      { text: 'Streams and optional groups appear only when your school\'s plan includes Exams & Results.' },
    ],
    workflows: [
      { title: 'Add subjects to a class', steps: [
        'Open the Class Subjects tab and choose the class.',
        'Type the subject name and press + Add. Repeat for each subject.',
        'For a subject where students pick one of several, tick "Elective" and give the choices the same group name.',
      ] },
      { title: 'Set up streams (for example PCM or Commerce)', steps: [
        'Open the Streams tab, choose the class and press + Add Stream.',
        'Add the core subjects of that stream.',
        'Use the Optional Groups tab for subjects students choose one of.',
        'Then put each student in a stream from Student Stream.',
      ] },
    ],
    problems: [
      { problem: '"Add classes in Class Management to configure subjects."', solution: 'No active classes exist yet. Add the classes and sections first, then come back.' },
      { problem: '"This subject already exists for the selected class."', solution: 'Each subject name can be added once per class. Check the list for a similar spelling.' },
      { problem: 'A subject is missing in Timetable or Exam Configuration.', solution: 'Add it here for that same class; it then appears in those screens.' },
    ],
    links: [
      { label: 'Class Management', path: 'class-management' },
      { label: 'Student Stream', path: 'student-stream' },
      { label: 'Exam Configuration', path: 'exam-config' },
      { label: 'Timetable', path: 'timetable' },
      { label: 'Timetables of my sections', path: 'coordinator-timetable' },
    ],
  },

  timetable: {
    id: 'timetable',
    title: 'Timetable',
    pages: ['timetable', 'coordinator-timetable'],
    about: [
      { text: 'The Timetable shows each class\'s weekly periods: day, period number, subject and teacher.' },
      { text: 'You see your own teaching schedule. You can add your own periods for your class (as class teacher), for classes you already teach this session, and for classes an admin has given you access to.', for: ['TEACHER'] },
      { text: 'Here you can see and change the periods of the classes and sections you coordinate, for any active teacher. Your own periods are managed from the Teacher workspace.', for: ['COORDINATOR'] },
      { text: 'You can view your class timetable here.', for: FAMILY },
    ],
    prerequisites: [
      { text: 'A current academic session (School Settings → General).', for: ['ADMIN'] },
      { text: 'Classes and sections, and subjects added for each class in Subject Configuration.', for: ['ADMIN', 'PRINCIPAL', 'TEACHER', 'COORDINATOR'] },
      { text: 'Active teachers. Only active teachers can be given periods.', for: ['ADMIN', 'PRINCIPAL'] },
      { text: 'Period times in Timetable → Setup, if you want times shown.', for: LEADERS },
    ],
    workflows: [
      { title: 'Add a period', for: ['ADMIN', 'PRINCIPAL', 'COORDINATOR'], steps: [
        'Choose the class (and section) and the day.',
        'Press + Add Period.',
        'Pick the section, period number, subject and teacher, then save.',
      ] },
      { title: 'Add a period', for: ['TEACHER'], steps: [
        'Choose the day and press + Add Period.',
        'Pick the class and section, the period number and the subject, then save.',
        'You are always the teacher of the periods you add.',
      ] },
      { title: 'Set period times', for: LEADERS, steps: [
        'Open the Setup tab and go to Period timings.',
        'Create a timing profile with the start and end time of each period, then save and activate it.',
        'Use "Show period times to users" to show or hide times for everyone.',
      ] },
      { title: 'Let a teacher add their own periods', for: LEADERS, steps: [
        'Choose the class and section.',
        'Press "Grant a teacher access" and pick the teacher.',
        'This only gives access; it does not create a period.',
      ] },
    ],
    problems: [
      { problem: '"No subjects are configured for this class yet."', solution: 'Add the class\'s subjects in Subject Configuration first.', for: ['ADMIN', 'PRINCIPAL', 'TEACHER', 'COORDINATOR'] },
      { problem: '"Period N does not have a time in the active timing profile."', solution: 'Add that period to the active profile in Timetable → Setup, or ask an admin.' },
      { problem: '"No timetable assigned yet."', solution: 'No periods list you as the teacher yet. Ask your school admin.', for: ['TEACHER'] },
      { problem: '"You can only add periods for a class or section you already teach…"', solution: 'Ask a school admin to grant you access to that class (Timetable → Grant a teacher access).', for: ['TEACHER'] },
      { problem: 'Changes are not allowed.', solution: 'Past sessions are read-only. Choose the current or a future session.', for: ['ADMIN', 'PRINCIPAL'] },
    ],
    links: [
      { label: 'Subject Configuration', path: 'subject-config' },
      { label: 'Class Management', path: 'class-management' },
      { label: 'Timetable bulk import', path: 'timetable-bulk-import' },
      { label: 'School Settings', path: 'school-settings' },
    ],
  },

  attendance: {
    id: 'attendance',
    title: 'Attendance',
    pages: ['teacher-attendance', 'coordinator-attendance', 'attendance-summary'],
    about: [
      { text: 'Daily attendance is marked once per class and section. Everyone starts as present; tap a student to mark them absent. Students on approved leave are shown as on leave.' },
      { text: 'Attendance Summary shows days present, absent and the attendance percentage, by month.' },
      { text: 'You mark attendance for your own class. You can change today and the previous three days.', for: ['TEACHER'] },
      { text: 'Here you can correct attendance for any section you coordinate. Every correction needs a reason. Your own class is marked from the Teacher workspace.', for: ['COORDINATOR'] },
      { text: 'You can see your attendance and download the monthly report.', for: FAMILY },
      { text: 'In Staff attendance you can correct a teacher\'s check-in with a reason. You cannot correct your own record, the Principal\'s or another Coordinator\'s.', for: ['COORDINATOR'] },
      { text: 'In Staff attendance you can correct a teacher\'s check-in with a reason. You cannot correct your own record.', for: ['PRINCIPAL'] },
    ],
    prerequisites: [
      { text: 'A current academic session and students placed in classes and sections.', for: ['ADMIN', 'PRINCIPAL', 'SUB_ADMIN'] },
      { text: 'You must be the class teacher of the class.', for: ['TEACHER'] },
    ],
    workflows: [
      { title: 'Mark today\'s attendance', for: ['ADMIN'], steps: [
        'Choose the class and section.',
        'Tap each absent student. Use "Mark all present" to start again.',
        'Press Submit. You can change it later the same way.',
      ] },
      { title: 'Mark today\'s attendance', for: ['TEACHER'], steps: [
        'Open Attendance. Your class opens by itself.',
        'Tap each absent student. Use "Mark all present" to start again.',
        'Press Submit. You can change it later the same way.',
      ] },
      { title: 'Correct a section\'s attendance', for: ['COORDINATOR'], steps: [
        'Choose the class and section, and the date.',
        'Tap the students to change.',
        'Write the reason for the correction and press Update (or Submit).',
      ] },
      { title: 'See an attendance report', for: ['ADMIN', 'PRINCIPAL', 'SUB_ADMIN', 'TEACHER', 'STUDENT', 'PARENT'], steps: [
        'Open Attendance Summary.',
        'Choose the month or year, and the class or student where asked.',
        'Press Load Report. Use Download PDF to save it.',
      ] },
    ],
    problems: [
      { problem: '"Attendance can only be marked by the class teacher of this class, or a school admin."', solution: 'Ask the admin to make you the class teacher of that class (Timetable → Setup → class teachers).', for: ['TEACHER'] },
      { problem: '"Teachers can change attendance from … to today."', solution: 'Older days can be corrected by a school admin, or by a Coordinator for the sections they coordinate.', for: ['TEACHER'] },
      { problem: '"No students enrolled".', solution: 'No students are placed in this class and section on that date. Check the student records.', for: ['ADMIN', 'PRINCIPAL', 'COORDINATOR'] },
      { problem: '"The attendance of the Principal or another Coordinator cannot be corrected here."', solution: 'Ask a school admin to correct it.', for: ['COORDINATOR'] },
      { problem: 'A day shows "Not recorded".', solution: 'Attendance was not submitted for that day. Ask the class teacher.', for: FAMILY },
    ],
    links: [
      { label: 'Mark attendance', path: 'teacher-attendance', for: ['ADMIN', 'TEACHER'] },
      { label: 'Correct a section\'s attendance', path: 'coordinator-attendance' },
      { label: 'Attendance Summary', path: 'attendance-summary', for: ['ADMIN', 'PRINCIPAL', 'SUB_ADMIN', 'TEACHER', 'STUDENT'] },
      { label: 'Staff attendance', path: 'staff-attendance' },
    ],
  },

  leave: {
    id: 'leave',
    title: 'Leave',
    pages: ['view-leaves', 'apply-leave', 'apply-teacher-leave', 'teacher-leave-requests'],
    about: [
      { text: 'Students (or parents) apply for a day of leave with a reason. The class teacher or a school admin approves or rejects it. The Principal can too, if the school allows it.' },
      { text: 'You can approve or reject the student leave of the classes and sections you coordinate.', for: ['COORDINATOR'] },
      { text: 'Teachers apply for their own leave for one or more days. A school admin decides it, or the Principal if the school allows it.' },
      { text: 'You can see teacher leave requests, but you cannot approve, reject or cancel them.', for: ['COORDINATOR'] },
      { text: 'Requests for today or tomorrow are marked urgent and shown first.' },
    ],
    prerequisites: [
      { text: 'The student must be in a class that has a class teacher, so someone can review the request.', for: ['ADMIN', 'PRINCIPAL'] },
    ],
    workflows: [
      { title: 'Apply for leave', for: FAMILY, steps: [
        'Open Leave Application.',
        'Pick the date (not a past date or a Sunday) and a reason.',
        'Press Apply for Leave. You can follow it under Applied Leaves and cancel it while it is pending.',
      ] },
      { title: 'Apply for your own leave', for: ['TEACHER'], steps: [
        'Open Leave Application (Staff Portal).',
        'Pick the start and end dates and write a reason.',
        'Submit. You can cancel it while it is pending.',
      ] },
      { title: 'Review student leave', for: ['ADMIN', 'PRINCIPAL', 'TEACHER', 'COORDINATOR'], steps: [
        'Open Leave Applications and keep the Pending filter. Coordinators can choose any class they coordinate.',
        'Press Approve or Reject on each request.',
        'Approved leave shows on the attendance sheet for that day.',
      ] },
      { title: 'Apply for your own leave', for: ['COORDINATOR'], steps: [
        'Switch to the Teacher workspace.',
        'Open Leave Application (Staff Portal), pick the dates and write a reason.',
      ] },
      { title: 'Review teacher leave', for: ['ADMIN', 'PRINCIPAL'], steps: [
        'Open Teacher Leave Requests and keep the Pending filter.',
        'Approve or Reject. Use "Change decision" if you made a mistake.',
      ] },
      { title: 'See teacher leave', for: ['COORDINATOR'], steps: [
        'Open Teacher Leave Requests to see who is on leave and the status of each request.',
        'Decisions are made by a school admin or the Principal. Contact them if a request needs attention.',
      ] },
    ],
    problems: [
      { problem: 'The date cannot be chosen.', solution: 'Leave cannot be applied for past dates or Sundays.', for: FAMILY },
      { problem: '"No leave applications found".', solution: 'Clear the filters or choose another status or class.', for: ['ADMIN', 'PRINCIPAL', 'TEACHER', 'COORDINATOR'] },
      { problem: 'There are no Approve or Reject buttons on teacher leave.', solution: 'Coordinators can only see teacher leave. A school admin or the Principal decides it.', for: ['COORDINATOR'] },
      { problem: 'A parent cannot apply.', solution: 'Open Leave from the parent portal with the child selected. The school must allow leave for that child.', for: ['PARENT', 'ADMIN'] },
    ],
    links: [
      { label: 'Leave Applications', path: 'view-leaves' },
      { label: 'Teacher Leave Requests', path: 'teacher-leave-requests' },
      { label: 'Apply for my leave', path: 'apply-teacher-leave' },
      { label: 'Apply for leave', path: 'apply-leave', for: ['STUDENT'] },
    ],
  },

  exams: {
    id: 'exams',
    title: 'Exams',
    pages: ['exam-config'],
    feature: FEATURES.EXAMS_RESULTS,
    about: [
      { text: 'Exam Configuration creates the exams of each class for a session, with the subjects, maximum marks and dates of each exam.' },
      { text: 'You only see the classes your coordination covers in full.', for: ['COORDINATOR'] },
    ],
    prerequisites: [
      { text: 'An academic session and the class\'s subjects in Subject Configuration.' },
    ],
    workflows: [
      { title: 'Create an exam', steps: [
        'Choose the session and class.',
        'Type the exam name (for example "Half Yearly") and press + Add Exam.',
        'Tick the subjects, set the maximum marks and dates, and press Save All Subjects.',
      ] },
    ],
    problems: [
      { problem: '"No subjects configured for this class."', solution: 'Add the subjects in Subject Configuration first.' },
      { problem: '"Not configured for this class" next to a subject.', solution: 'Remove it from the exam, or add the subject to the class in Subject Configuration.' },
      { problem: '"Could not add exam. It may already exist."', solution: 'An exam with that name already exists for this class and session.' },
    ],
    links: [
      { label: 'Subject Configuration', path: 'subject-config' },
      { label: 'Mark Entry', path: 'mark-entry' },
      { label: 'Assessment groups', path: 'assessment-groups' },
    ],
  },

  marks: {
    id: 'marks',
    title: 'Mark Entry',
    pages: ['mark-entry'],
    feature: FEATURES.EXAMS_RESULTS,
    about: [
      { text: 'Mark Entry is where exam marks are entered, by subject or by student.' },
      { text: 'Students and parents see marks only after the results are published (by an admin, or the Principal if the school allows it). Published marks are locked.' },
      { text: 'You enter marks for your own class.', for: ['TEACHER'] },
      { text: 'Your changes are corrections: give a reason. They are recorded in the academic history.', for: ['PRINCIPAL', 'COORDINATOR'] },
      { text: 'You can correct the marks of the classes and sections you coordinate.', for: ['COORDINATOR'] },
    ],
    prerequisites: [
      { text: 'The exam, with its subjects and maximum marks, in Exam Configuration.' },
    ],
    workflows: [
      { title: 'Enter marks', steps: [
        'Choose the session, class (if asked) and exam.',
        'Use By Subject to fill one subject for the whole class, or By Student for one student.',
        'Type the marks and save.',
      ] },
    ],
    problems: [
      { problem: '"No subjects found".', solution: 'The exam has no subjects yet. Add them in Exam Configuration.', for: STAFF_SETUP },
      { problem: '"No subjects found".', solution: 'The exam has no subjects yet. Ask your school admin.', for: ['TEACHER'] },
      { problem: 'Marks cannot be changed.', solution: 'The results are published. They must be unpublished in Class Results first (by an admin, or the Principal if the school allows it).' },
      { problem: '"Reason required".', solution: 'Corrections need a reason of up to 500 characters.', for: ['PRINCIPAL', 'COORDINATOR'] },
    ],
    links: [
      { label: 'Exam Configuration', path: 'exam-config' },
      { label: 'Class Results', path: 'class-results' },
    ],
  },

  results: {
    id: 'results',
    title: 'Results',
    pages: ['class-results', 'my-results'],
    feature: FEATURES.EXAMS_RESULTS,
    about: [
      { text: 'Results show exam marks, totals and ranks once marks are entered.' },
      { text: 'Class Results shows every student\'s total, rank and pass/fail for an exam. A student is ranked only when all their marks are entered.', for: ['ADMIN', 'PRINCIPAL', 'TEACHER', 'COORDINATOR'] },
      { text: 'Results start as Draft (staff only). Publishing makes them visible to students and parents and locks the marks. An admin publishes, or the Principal if the school allows it.', for: ['ADMIN', 'PRINCIPAL', 'TEACHER', 'COORDINATOR'] },
      { text: 'My Results shows published exam results, subject by subject, with your progress over time.', for: FAMILY },
    ],
    prerequisites: [
      { text: 'Marks entered in Mark Entry for the exam.', for: ['ADMIN', 'PRINCIPAL', 'TEACHER', 'COORDINATOR'] },
    ],
    workflows: [
      { title: 'Publish results', for: ['ADMIN', 'PRINCIPAL'], steps: [
        'Choose the session, class and exam.',
        'Check the marks; students marked Incomplete still have missing marks.',
        'Press Publish Results. Use Unpublish to correct marks.',
      ] },
      { title: 'See results', for: FAMILY, steps: [
        'Open My Results.',
        'Use "View Report Card" for the full report card when the school has published one.',
      ] },
    ],
    problems: [
      { problem: '"No published results yet".', solution: 'Your school has not published any results yet.', for: FAMILY },
      { problem: '"Not ranked until every mark is entered".', solution: 'Enter the missing marks in Mark Entry.', for: ['ADMIN', 'PRINCIPAL', 'TEACHER', 'COORDINATOR'] },
      { problem: '"No students or subjects are set up for this exam yet."', solution: 'Add the exam\'s subjects in Exam Configuration and check the class has students.', for: STAFF_SETUP },
    ],
    links: [
      { label: 'Mark Entry', path: 'mark-entry' },
      { label: 'My report cards', path: 'report-card-documents', for: ['STUDENT'] },
    ],
  },

  'report-cards': {
    id: 'report-cards',
    title: 'Report Cards',
    pages: ['report-cards-v2/setup', 'report-cards-v2/remarks', 'report-cards-v2/generate', 'report-card-approvals',
      'bulk-report-cards', 'report-card-review', 'report-card-documents'],
    feature: FEATURES.REPORT_CARDS,
    about: [
      { text: 'Report cards turn a student\'s exam marks into a printable PDF.' },
      { text: 'A report card combines one or more exams of a class. It is set up once, checked, then published as a PDF for students and parents.', for: ['ADMIN', 'PRINCIPAL', 'TEACHER', 'COORDINATOR'] },
      { text: 'When approvals are switched on for a report card, the class teacher and then the Principal approve it. Only a school admin publishes.', for: ['ADMIN', 'PRINCIPAL', 'TEACHER'] },
      { text: 'You can review report cards of the sections you coordinate and ask the class teacher for corrections. You cannot approve, sign or publish report cards.', for: ['COORDINATOR'] },
      { text: 'Your published report cards appear here as PDFs you can open and download.', for: FAMILY },
    ],
    prerequisites: [
      { text: 'Exams set up and marks entered for the class.', for: ['ADMIN', 'PRINCIPAL', 'TEACHER', 'COORDINATOR'] },
      { text: 'For approvals: both teacher and Principal signatures saved.', for: ['ADMIN', 'PRINCIPAL', 'TEACHER'] },
    ],
    workflows: [
      { title: 'Prepare and publish', for: ['ADMIN'], steps: [
        'Report Card Setup: choose the class, press + New report card and add its exams (with weights if needed).',
        'School Settings → Report Card Design: logo, signatures and what the card shows.',
        'Remarks: add class teacher and Principal remarks.',
        'Generate & Preview: check each student\'s card.',
        'Published Report Cards: publish for the class.',
        'To require approvals, switch on "Teacher & Principal approval" on Published Report Cards (this cannot be undone). Each section then needs class teacher and Principal approval, with both signatures saved, before you can publish.',
      ] },
      { title: 'Review your sections', for: ['COORDINATOR'], steps: [
        'Open Report Card Review. Filter by examination, class or section.',
        'Sections marked "Needs work" have missing marks or remarks. Press Review to see each student and Preview a card.',
        'Press Request correction and say what needs to be corrected. The class teacher is asked to fix it.',
      ] },
      { title: 'Add remarks and check cards', for: ['TEACHER'], steps: [
        'Open Remarks, choose the report card and write each student\'s remark.',
        'Open Generate & Preview to check the cards before they are published.',
        'If approvals are on, approve as class teacher from Report Card Approvals. The Principal approves next, and an admin publishes.',
      ] },
      { title: 'Add remarks and approve', for: ['PRINCIPAL'], steps: [
        'Open Remarks, choose the report card and write the Principal\'s remarks.',
        'If approvals are on, save your signature, then approve as Principal from Report Card Approvals after the class teacher. An admin publishes.',
      ] },
    ],
    problems: [
      { problem: '"Report cards are created by an administrator in Report Card Setup."', solution: 'No report card exists for this class yet. Ask your admin to create one.', for: ['TEACHER', 'PRINCIPAL', 'COORDINATOR'] },
      { problem: '"Incomplete marks" or "Missing teacher remarks".', solution: 'Finish the marks in Mark Entry and the remarks in Remarks, then preview again.', for: ['ADMIN', 'PRINCIPAL', 'TEACHER'] },
      { problem: 'Remarks are locked.', solution: 'The report card is published. It must be withdrawn before remarks can change.', for: ['ADMIN', 'PRINCIPAL', 'TEACHER'] },
      { problem: 'No report cards are shown.', solution: 'Your school has not published one yet.', for: FAMILY },
    ],
    links: [
      { label: 'Report Card Setup', path: 'report-cards-v2/setup' },
      { label: 'Remarks', path: 'report-cards-v2/remarks' },
      { label: 'Generate & Preview', path: 'report-cards-v2/generate' },
      { label: 'Report Card Approvals', path: 'report-card-approvals' },
      { label: 'Published Report Cards', path: 'bulk-report-cards' },
      { label: 'Report Card Review', path: 'report-card-review' },
      { label: 'Mark Entry', path: 'mark-entry' },
    ],
  },

  fees: {
    id: 'fees',
    title: 'Fees',
    pages: ['fees', 'fee-structure', 'fee-assignment'],
    feature: FEATURES.FEE_MANAGEMENT,
    about: [
      { text: 'Fees are set up as fee heads (for example Tuition), amounts per class, and then generated for each student\'s months.', for: ['ADMIN'] },
      { text: 'The Fees page shows a student\'s months, what is due and what is paid. The office can record cash, cheque, bank or UPI payments there.', for: ['ADMIN'] },
      { text: 'The Fees page shows your months and what is due. Select months to see the total.', for: FAMILY },
      { text: 'Fee Structure shows the fee amounts for each class.' },
    ],
    prerequisites: [
      { text: 'An academic session (School Settings), classes in Class Management, and fee heads.', for: ['ADMIN'] },
      { text: 'Online payment needs your school\'s payment gateway to be set up.', for: ['ADMIN'] },
    ],
    workflows: [
      { title: 'Set up and generate fees', for: ['ADMIN'], steps: [
        'Fee Heads: add each fee with its frequency and due months.',
        'Fee Rules: set the amount of each fee head for each class.',
        'Fee Assignment: choose students and months, preview, then generate.',
      ] },
      { title: 'Record a payment at the office', for: ['ADMIN'], steps: [
        'Open the student\'s Fees page.',
        'Select the due months, enter the amount received, mode and reference.',
        'Press Record payment.',
      ] },
      { title: 'Pay fees', for: FAMILY, steps: [
        'Open Fees (parents: choose your child first).',
        'Select the months to pay and press Pay.',
        'If online payment is not offered, pay at the school office. The office records it and the months show as paid.',
      ] },
    ],
    problems: [
      { problem: '"No fees generated yet".', solution: 'Generate the months for this student in Fee Assignment.', for: ['ADMIN'] },
      { problem: '"No fees generated yet".', solution: 'The school has not added fees for this session yet.', for: FAMILY },
      { problem: '"No fee rule covers this billing month."', solution: 'Check the "Changes effective from" dates in Fee Rules for that class.', for: ['ADMIN'] },
      { problem: '"Create a session in School Settings first."', solution: 'Add an academic session in School Settings → General.', for: ['ADMIN'] },
      { problem: '"Fee rules exist for class name(s) not configured in Class Management".', solution: 'Add or rename the class in Class Management so the amounts show.', for: ['ADMIN'] },
      { problem: '"This account has view-only fee access."', solution: 'Ask the school to allow fee payment for this child.', for: ['PARENT'] },
    ],
    links: [
      { label: 'Fee Heads', path: 'fee-head-management' },
      { label: 'Fee Rules', path: 'fee-rule-config' },
      { label: 'Fee Assignment', path: 'fee-assignment' },
      { label: 'Fee Structure', path: 'fee-structure', for: ['ADMIN', 'STUDENT'] },
      { label: 'Fee reminders', path: 'fee-reminders' },
      { label: 'Payment history', path: 'payment-history-admin' },
      { label: 'My fees', path: 'fees', for: ['STUDENT'] },
      { label: 'Payment history', path: 'payment-history', for: ['STUDENT'] },
    ],
  },

  'school-settings': {
    id: 'school-settings',
    title: 'School Settings',
    pages: ['school-settings'],
    about: [
      { text: 'School Settings holds your school profile, logo, academic year, sessions, grading, staff check-in rules, payments and plan.' },
    ],
    prerequisites: [
      { text: 'Only a school admin can change these settings.' },
    ],
    workflows: [
      { title: 'Start a new academic session', steps: [
        'Open the General tab and go to Academic Sessions.',
        'Add the next session.',
        'Press Set Current when you are ready. Edunexify shows anything still missing before you switch.',
      ] },
      { title: 'Update the school profile and logo', steps: [
        'General tab → School Information → Edit. Save when done.',
        'Upload the logo under School Logo (JPG or PNG, up to 5 MB).',
      ] },
      { title: 'Set staff check-in rules', steps: [
        'Open the Staff Attendance tab.',
        'Press Edit Settings, set the school location, the allowed distance and the timings, then save.',
      ] },
    ],
    problems: [
      { problem: 'A page says a session is missing.', solution: 'Add a session here and set it as current.' },
      { problem: 'Teachers cannot check in.', solution: 'Check the location and allowed distance in the Staff Attendance tab.' },
      { problem: 'Online payment setup is not available in the app.', solution: 'Payment gateway setup is done on the Edunexify website.' },
    ],
    links: [
      { label: 'School setup checklist', path: 'school-setup' },
      { label: 'Class Management', path: 'class-management' },
      { label: 'Timetable', path: 'timetable' },
    ],
  },
};

/** The help topic of a page (route path under /dashboard), if it has one. */
export function helpTopicForPage(page: string): HelpTopicId | null {
  const topic = Object.values(HELP_TOPICS).find(t => t.pages.includes(page));
  return topic?.id ?? null;
}

/** Lines meant for this audience. */
export function forAudience<T extends { for?: readonly HelpAudience[] }>(items: readonly T[], audience: HelpAudience): T[] {
  return items.filter(item => !item.for || item.for.includes(audience));
}
