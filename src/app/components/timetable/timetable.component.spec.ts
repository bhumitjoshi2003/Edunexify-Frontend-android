import { of, Subject } from 'rxjs';
import { TimetableComponent } from './timetable.component';
import { AcademicSession } from '../../interfaces/academic-session';
import { sessionKind, writableSession } from '../academic-session-selector/academic-session-selector.component';

const current: AcademicSession = { id: 1, label: 'Current', startDate: '2000-01-01', endDate: '2001-01-01', current: true };
const future: AcademicSession = { id: 2, label: 'Future', startDate: '2998-01-01', endDate: '2999-01-01', current: false };
const historical: AcademicSession = { id: 3, label: 'Past', startDate: '2000-01-01', endDate: '2001-01-01', current: false };
describe('G1 timetable screen', () => {
  let c: TimetableComponent;
  let api: any;
  let toast: any;
  beforeEach(() => {
    api = jasmine.createSpyObj('TimetableService', ['createEntry', 'updateEntry', 'deleteEntry', 'getClassTimetable', 'getTeacherTimetable']);
    for (const key of ['createEntry', 'updateEntry', 'deleteEntry']) api[key].and.returnValue(of({}));
    api.getClassTimetable.and.returnValue(of([])); api.getTeacherTimetable.and.returnValue(of([]));
    toast = { success: jasmine.createSpy(), confirm: jasmine.createSpy().and.resolveTo(true) };
    c = new TimetableComponent(api, { getTeacher: () => of({}) } as any, {} as any, {} as any, { error: () => {} } as any, { markForCheck: () => {} } as any, toast, {} as any, {} as any, { snapshot: { queryParamMap: { get: () => null } } } as any, {} as any, { getForTeacher: () => of([]) } as any);
    c.role = 'ADMIN'; c.selectedSession = current; c.selectedClassId = 8; c.selectedClass = '8'; c.sectionsLoaded = true;
    c.modalForm = { id: 10, academicSessionId: 1, classId: 8, className: 'Untrusted display', sectionId: null, day: 'MONDAY', periodNumber: 1, startTime: '09:00', endTime: '10:00', subjectName: 'Math', teacherId: 'T1' };
  });
  afterEach(() => c.ngOnDestroy());
  it('uses authoritative current flag even outside date range', () => { expect(sessionKind(current)).toBe('CURRENT'); expect(writableSession(current)).toBeTrue(); });
  it('enables future configuration and disables historical/no-session writes', () => {
    c.selectedSession = future; expect(c.canWrite()).toBeTrue();
    for (const session of [historical, null]) { c.selectedSession = session; expect(c.canWrite()).toBeFalse(); c.openAddPeriod(); c.saveEntry(); }
    expect(api.createEntry).not.toHaveBeenCalled();
  });
  it('does not expose ADMIN writes to SUB_ADMIN', () => { c.role = 'SUB_ADMIN'; expect(c.canWrite()).toBeFalse(); c.saveEntry(); expect(api.createEntry).not.toHaveBeenCalled(); });
  it('lets the Principal edit periods in a writable session, but keeps Admin-only bulk import and session copy off', () => {
    c.role = 'PRINCIPAL';
    expect(c.canWrite()).toBeTrue();
    expect(c.canManage()).toBeFalse(); // bulk import and teaching-configuration administration follow canManage()
    c.saveEntry();
    expect(api.createEntry.calls.mostRecent().args[0].academicSessionId).toBe(1); // explicit session, like an Admin
    c.selectedSession = historical;
    expect(c.canWrite()).toBeFalse();
  });
  it('creates with canonical IDs and strips display names', () => {
    c.saveEntry();
    const body = api.createEntry.calls.mostRecent().args[0];
    expect(body.academicSessionId).toBe(1); expect(body.classId).toBe(8); expect(body.sectionId).toBeNull();
    expect(body.className).toBeUndefined();
  });
  it('creates explicitly in a future session', () => { c.selectedSession = future; c.modalForm.academicSessionId = 2; c.saveEntry(); expect(api.createEntry.calls.mostRecent().args[0].academicSessionId).toBe(2); });
  it('requires a canonical section when the class has sections', () => {
    c.sections = [{ id: 4, classId: 8, name: 'A', active: true }]; c.saveEntry(); expect(api.createEntry).not.toHaveBeenCalled();
    c.modalForm.sectionId = 4; c.saveEntry(); expect(api.createEntry.calls.mostRecent().args[0].sectionId).toBe(4);
  });
  it('fails closed when section lookup fails', () => { c.sectionsLoaded = false; c.saveEntry(); expect(api.createEntry).not.toHaveBeenCalled(); });
  it('retains IDs on edit and sends them to update', () => { const entry = { ...c.modalForm }; c.openEdit(entry); c.saveEntry(); expect(api.updateEntry.calls.mostRecent().args[0]).toBe(10); expect(api.updateEntry.calls.mostRecent().args[1].classId).toBe(8); });
  it('creates a new period without first checking for an existing occupant of the slot', () => {
    // The NEW product rule: the timetable never rejects (or even checks for) a colliding row —
    // any number of entries may share the same slot. Proven by createEntry being dispatched with
    // no preceding getClassTimetable lookup (a post-save refresh afterward is normal/expected —
    // this only asserts nothing runs BEFORE the create request itself).
    const pending = new Subject<any>();
    api.createEntry.and.returnValue(pending);
    c.saveEntry();
    expect(api.createEntry).toHaveBeenCalled();
    expect(api.getClassTimetable).not.toHaveBeenCalled();
    pending.next({}); pending.complete();
  });
  it('deletes only after confirmation with captured session', async () => { c.deleteEntry(); await Promise.resolve(); expect(api.deleteEntry).toHaveBeenCalledWith(10, 1); });
  it('does not delete when session changes during confirmation', async () => { c.deleteEntry(); c.selectedSession = future; await Promise.resolve(); expect(api.deleteEntry).not.toHaveBeenCalled(); });
  it('rejects stale edit session', () => { c.selectedSession = future; c.saveEntry(); expect(api.createEntry).not.toHaveBeenCalled(); });
  it('cancels stale class timetable reads on selection change', () => {
    const stale = new Subject<any[]>(); api.getClassTimetable.and.returnValues(stale, of([]));
    c.loadClassTimetable(); c.onSessionSelected(future); stale.next([{ id: 900 }]); expect(c.entries).toEqual([]);
    expect(api.getClassTimetable.calls.mostRecent().args[3]).toBe(2);
  });
  it('keeps teacher creation operational and preserves supplied canonical ID', () => {
    c.role = 'TEACHER'; c.saveEntry(); const body = api.createEntry.calls.mostRecent().args[0];
    expect(body.classId).toBe(8); expect(body.academicSessionId).toBeUndefined();
    expect(api.getTeacherTimetable).toHaveBeenCalled();
  });

  it('lets teachers edit only their own loaded operational rows', () => {
    c.role = 'TEACHER'; c.userId = 'T1'; c.teacherEntries = [{ ...c.modalForm }];
    expect(c.canEditEntry(c.modalForm)).toBeTrue();
    expect(c.canEditEntry({ ...c.modalForm, teacherId: 'T2' })).toBeFalse();
    expect(c.canEditEntry({ ...c.modalForm, id: 999 })).toBeFalse();
    c.openEdit(c.modalForm); c.saveEntry();
    expect(api.updateEntry.calls.mostRecent().args[1].academicSessionId).toBe(1);
    expect(api.updateEntry.calls.mostRecent().args[1].teacherId).toBe('T1');
  });
  it('deletes a teacher-owned operational row with its explicit session', async () => {
    c.role = 'TEACHER'; c.userId = 'T1'; c.selectedSession = null; c.teacherEntries = [{ ...c.modalForm }];
    c.deleteEntry(); await Promise.resolve(); expect(api.deleteEntry).toHaveBeenCalledWith(10, 1);
    expect(api.getTeacherTimetable).toHaveBeenCalled();
  });
  it('does not open or delete another teacher assignment', async () => {
    c.role = 'TEACHER'; c.userId = 'T2'; c.teacherEntries = [{ ...c.modalForm }];
    c.openEdit(c.modalForm); c.deleteEntry(); await Promise.resolve();
    expect(c.showModal).toBeFalse(); expect(api.deleteEntry).not.toHaveBeenCalled();
  });

  // ── Class-11-Commerce "Unable to determine the class" regression ──────────────────────────
  it('resolves classId defensively from managedClasses when a teacher entry is missing it', () => {
    // Root cause: buildMyClasses() used to trust entry.classId verbatim; if a teacher's own
    // existing entry ever carried no classId, the myClasses option built from it silently
    // carried classId: undefined, so selecting that exact class in Add Period left
    // modalForm.classId undefined and saveEntry() rejected it with a generic, unhelpful error.
    c.role = 'TEACHER'; c.userId = 'T1';
    c.managedClasses = [{ id: 11, name: '11', displayOrder: 1, active: true, streamEligible: false } as any];
    (c as any).buildMyClasses([
      { id: 501, classId: undefined as any, className: '11', sectionId: 3, sectionName: 'Commerce',
        day: 'FRIDAY', periodNumber: 2, startTime: '09:00', endTime: '09:40', subjectName: 'Accountancy', teacherId: 'T1' },
    ]);
    expect(c.myClasses).toEqual([{ classId: 11, className: '11', sectionId: 3, sectionName: 'Commerce' }]);

    c.openAddPeriodAsTeacher();
    c.onMyClassSelect(c.myClassKey({ className: '11', sectionId: 3 }));
    c.modalForm.day = 'FRIDAY'; c.modalForm.periodNumber = 5;
    c.modalForm.startTime = '11:00'; c.modalForm.endTime = '11:40';
    c.modalForm.subjectName = 'Maths';

    c.saveEntry();

    expect(c.modalError).toBeNull();
    expect(api.createEntry).toHaveBeenCalledWith(jasmine.objectContaining({ classId: 11, sectionId: 3 }));
  });
});
