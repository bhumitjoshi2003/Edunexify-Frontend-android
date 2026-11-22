import { HELP_TOPICS, HelpAudience, HelpTopicId, forAudience } from './help-content';

/**
 * Help must never tell a role it can do something the server refuses. These pin the sensitive
 * instructions to the authorisation policy (backend @PreAuthorize rules and service checks):
 *  - Coordinators decide student leave in their scope, but only VIEW teacher leave
 *    (TeacherLeaveController: decide/reverse = Admin or Principal with TEACHER_LEAVE_DECIDE).
 *  - Coordinators request report-card corrections but never approve, sign or publish.
 *  - Only an Admin publishes results and report cards.
 *  - Coordinators correct staff attendance with a reason, never their own, the Principal's or
 *    another Coordinator's record.
 * Shared by the web and Android clients — keep the two copies identical.
 */
describe('Help content — permission-sensitive instructions', () => {
  const ids = Object.keys(HELP_TOPICS) as HelpTopicId[];
  const steps = (id: HelpTopicId, who: HelpAudience) =>
    forAudience(HELP_TOPICS[id].workflows, who).flatMap(w => [w.title, ...w.steps]);
  const instructions = (id: HelpTopicId, who: HelpAudience) => [
    ...steps(id, who),
    ...forAudience(HELP_TOPICS[id].problems, who).map(p => p.solution),
  ];
  const workflow = (id: HelpTopicId, title: string) => HELP_TOPICS[id].workflows.filter(w => w.title === title);

  it('Coordinator: sees teacher leave but is never told to approve, reject or cancel it', () => {
    const leave = HELP_TOPICS.leave;
    expect(workflow('leave', 'Review teacher leave').every(w => !w.for?.includes('COORDINATOR'))).toBeTrue();
    expect(workflow('leave', 'Review teacher leave')[0].for).toEqual(['ADMIN', 'PRINCIPAL']);
    const coordinatorTeacherLeave = forAudience(leave.workflows, 'COORDINATOR').filter(w => /teacher leave/i.test(w.title));
    expect(coordinatorTeacherLeave.map(w => w.title)).toEqual(['See teacher leave']);
    for (const step of coordinatorTeacherLeave.flatMap(w => w.steps)) {
      expect(step).not.toMatch(/\b(press|tap)\b.*\b(approve|reject|cancel|change decision)\b/i);
    }
    const about = forAudience(leave.about, 'COORDINATOR').map(l => l.text).join(' ');
    expect(about).toContain('cannot approve, reject or cancel');
    expect(about).not.toMatch(/Coordinator decides/i);
    expect(forAudience(leave.about, 'TEACHER').map(l => l.text).join(' ')).not.toMatch(/Coordinator/);
  });

  it('Coordinator: decides student leave of the classes and sections they coordinate', () => {
    expect(workflow('leave', 'Review student leave')[0].for).toContain('COORDINATOR');
    expect(forAudience(HELP_TOPICS.leave.about, 'COORDINATOR').map(l => l.text).join(' '))
      .toContain('approve or reject the student leave of the classes and sections you coordinate');
  });

  it('Coordinator: report cards are reviewed and sent back, never approved, signed or published', () => {
    const text = instructions('report-cards', 'COORDINATOR').join(' ');
    expect(text).toContain('Request correction');
    expect(text).not.toMatch(/\b(approve as|approves? from|publish(es)?\b|signature)/i);
    expect(forAudience(HELP_TOPICS['report-cards'].about, 'COORDINATOR').map(l => l.text).join(' '))
      .toContain('cannot approve, sign or publish');
  });

  it('no role but Admin is told to publish results or report cards', () => {
    for (const who of ['PRINCIPAL', 'COORDINATOR', 'TEACHER', 'SUB_ADMIN', 'PARENT', 'STUDENT'] as HelpAudience[]) {
      for (const id of ids) {
        for (const line of steps(id, who)) {
          expect(line).withContext(`${who} ${id}`).not.toMatch(/^(press|use|open)\b.*\bpublish\b/i);
          expect(line).withContext(`${who} ${id}`).not.toMatch(/Publish Results/);
        }
      }
    }
    expect(workflow('results', 'Publish results')[0].for).toEqual(['ADMIN']);
    expect(workflow('report-cards', 'Prepare and publish')[0].for).toEqual(['ADMIN']);
  });

  it('Coordinator: staff-attendance corrections need a reason and exclude protected records', () => {
    const about = forAudience(HELP_TOPICS.attendance.about, 'COORDINATOR').map(l => l.text).join(' ');
    expect(about).toContain('with a reason');
    expect(about).toContain("cannot correct your own record, the Principal's or another Coordinator's");
  });

  it('Sub-admin, Parent and Student are never told to add or change timetable periods', () => {
    for (const who of ['SUB_ADMIN', 'PARENT', 'STUDENT'] as HelpAudience[]) {
      expect(steps('timetable', who).join(' ')).withContext(who).not.toMatch(/Add Period|Grant a teacher access|Period timings/);
    }
  });

  it('Teacher: periods they add are always their own; setup steps are for leaders only', () => {
    expect(steps('timetable', 'TEACHER').join(' ')).toContain('You are always the teacher of the periods you add.');
    for (const title of ['Set period times', 'Let a teacher add their own periods']) {
      expect(workflow('timetable', title)[0].for).toEqual(['ADMIN', 'PRINCIPAL']);
    }
  });

  it('Teacher teacher-leave and student-leave decisions stay with their roles', () => {
    expect(steps('leave', 'TEACHER').join(' ')).not.toContain('Teacher Leave Requests');
    expect(steps('leave', 'STUDENT').join(' ')).not.toMatch(/Approve|Reject/);
    expect(steps('leave', 'PARENT').join(' ')).not.toMatch(/Approve|Reject/);
  });
});
