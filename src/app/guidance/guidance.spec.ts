import { GUIDANCE, GuidanceKind, errorGuidance } from './guidance';

/**
 * Page states say what happened and what to do next — and a failure is never "nothing here".
 * Shared by the web and Android clients — keep the two copies identical.
 */
describe('Guidance — page states', () => {
  it('classifies failed requests: network and server failures retry, 403 is a permission, plan is separate', () => {
    expect(errorGuidance({ status: 0 }, 'exams').kind).toBe('load-error');
    expect(errorGuidance({ status: 503 }, 'exams').kind).toBe('load-error');
    expect(errorGuidance(undefined, 'exams').kind).toBe('load-error');
    const refused = errorGuidance({ status: 403, error: { message: 'Only the class teacher can do this.' } }, 'leave applications');
    expect(refused.kind).toBe('no-permission');
    expect(refused.message).toBe('Only the class teacher can do this.');
    expect(refused.fallback?.default).toContain('school admin');
    expect(errorGuidance({ status: 403, error: { code: 'FEATURE_NOT_AVAILABLE' } }, 'results').kind).toBe('plan');
  });

  it('never presents a failure as empty data', () => {
    const failureKinds: GuidanceKind[] = [0, 400, 401, 403, 404, 409, 500, 502].map(status => errorGuidance({ status }, 'x').kind);
    expect(failureKinds.every(k => k !== 'empty' && k !== 'no-match')).toBeTrue();
  });

  it('uses the server\'s short message, never an HTML error page', () => {
    expect(errorGuidance({ status: 400, error: 'Pick a writable session.' }, 'exams').message).toBe('Pick a writable session.');
    expect(errorGuidance({ status: 400, error: '<html><body>Bad gateway</body></html>' }, 'exams').message).toBe('Please try again.');
    expect(errorGuidance({ status: 400, error: { message: 'x'.repeat(300) } }, 'exams').message).toBe('Please try again.');
  });

  it('offers the seven distinct states', () => {
    const kinds = new Set<GuidanceKind>([
      GUIDANCE.noRecords('No leave applications').kind,          // empty
      GUIDANCE.noClasses().kind,                                 // prerequisite
      errorGuidance({ status: 500 }, 'x').kind,                  // load-error
      errorGuidance({ status: 403 }, 'x').kind,                  // no-permission
      errorGuidance({ status: 403, error: { code: 'FEATURE_NOT_AVAILABLE' } }, 'x').kind, // plan
      GUIDANCE.resultsNotPublished().kind,                       // unpublished
      GUIDANCE.noMatches('leave applications').kind,             // no-match
    ]);
    expect(kinds.size).toBe(7);
  });

  it('prerequisites link the setup page and say whom to ask when the viewer cannot open it', () => {
    const subjects = GUIDANCE.noSubjectsForClass('8');
    expect(subjects.kind).toBe('prerequisite');
    expect(subjects.title).toContain('Class 8');
    expect(subjects.actions?.map(a => a.path)).toEqual(['subject-config']);
    expect(subjects.fallback?.default).toContain('school admin');
    expect(GUIDANCE.noReportCardSetup().actions?.map(a => a.path)).toEqual(['report-cards-v2/setup']);
  });

  it('fees: only an Admin is pointed to Fee Assignment; students and parents are told to wait or ask the office', () => {
    const fees = GUIDANCE.noFeesGenerated();
    expect(fees.actions).toEqual([{ label: 'Open Fee Assignment', path: 'fee-assignment', for: ['ADMIN'] }]);
    expect(fees.fallback?.STUDENT).toContain('school office');
    expect(fees.fallback?.PARENT).toContain('school office');
    expect(JSON.stringify(fees.fallback)).not.toContain('Fee Assignment');
  });

  it('a teacher without a class is told to ask the admin, never offered a setup page', () => {
    const g = GUIDANCE.notClassTeacher();
    expect(g.kind).toBe('prerequisite');
    expect(g.actions ?? []).toEqual([]);
    expect(g.fallback?.default).toContain('school admin');
  });
});
