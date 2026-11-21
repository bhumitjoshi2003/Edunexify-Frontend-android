import { TestBed, ComponentFixture } from '@angular/core/testing';
import { of } from 'rxjs';
import { TimetableComponent } from './timetable.component';
import { TimetableService } from '../../services/timetable.service';
import { TeacherService } from '../../services/teacher.service';
import { AuthStateService } from '../../auth/auth-state.service';
import { StudentService } from '../../services/student.service';
import { LoggerService } from '../../services/logger.service';
import { ToastService } from '../../services/toast.service';
import { SchoolService } from '../../services/school.service';
import { SectionService } from '../../services/section.service';
import { ActivatedRoute, Router } from '@angular/router';
import { TeacherClassGrantService } from '../../services/teacher-class-grant.service';

/**
 * Rendered-template regression coverage for the TEACHER edit flow.
 *
 * The rest of this component's spec file (timetable.component.spec.ts) instantiates
 * TimetableComponent directly (`new TimetableComponent(...)`) and never renders the HTML
 * template — that style cannot observe template-only issues (a mis-bound field, a control that
 * doesn't reflect its model, a button that isn't actually reachable from the rendered DOM). This
 * file uses TestBed + real change detection specifically to exercise the actual rendered page —
 * clicking the teacher card edit and delete icon buttons, reading the real "Class" dropdown and Subject input —
 * the same way a teacher's browser would.
 */
describe('TEACHER edit flow (rendered template)', () => {
  let fixture: ComponentFixture<TimetableComponent>;
  let c: TimetableComponent;
  let api: any;
  let toast: any;

  const mathEntry: any = {
    id: 501, academicSessionId: 1, classId: 11, className: '11', sectionId: 3, sectionName: 'Science',
    day: 'WEDNESDAY', periodNumber: 3, startTime: '09:15', endTime: '09:50', subjectName: 'Mathematics',
    teacherId: 'T1', teacherName: 'Teacher One'
  };
  const otherTeacherEntry: any = {
    id: 502, academicSessionId: 1, classId: 11, className: '11', sectionId: 3, sectionName: 'Science',
    day: 'WEDNESDAY', periodNumber: 4, startTime: '09:50', endTime: '10:25', subjectName: 'Biology',
    teacherId: 'T2', teacherName: 'Teacher Two'
  };

  async function setup(entries: any[] = [mathEntry]) {
    api = jasmine.createSpyObj('TimetableService', [
      'getTeacherTimetable', 'updateEntry', 'deleteEntry', 'createEntry', 'getClassTimetable', 'getPermittedSubjects', 'getTimingDisplay'
    ]);
    api.getPermittedSubjects.and.returnValue(of(['Mathematics', 'Physics', 'Maths', 'Biology', 'Accountancy']));
    api.getTeacherTimetable.and.returnValue(of(entries));
    api.getTimingDisplay.and.returnValue(of({ showTimes: true, activeProfileId: null, activeProfileName: null, periods: [] }));
    api.updateEntry.and.returnValue(of({}));
    api.createEntry.and.returnValue(of({}));
    api.deleteEntry.and.returnValue(of({}));
    toast = { success: jasmine.createSpy(), confirm: jasmine.createSpy().and.resolveTo(true) };

    await TestBed.configureTestingModule({
      imports: [TimetableComponent],
      providers: [
        { provide: TimetableService, useValue: api },
        { provide: TeacherService, useValue: { getTeacher: () => of({}), getAllTeachers: () => of([]) } },
        { provide: AuthStateService, useValue: { getUser: () => ({ role: 'TEACHER', userId: 'T1', name: 'Teacher One' }) } },
        { provide: StudentService, useValue: {} },
        { provide: LoggerService, useValue: { error: () => { } } },
        { provide: ToastService, useValue: toast },
        { provide: SchoolService, useValue: { getSettings: () => of({}), getAcademicContext: () => of({}), getManagedClasses: () => of([{ id: 11, name: '11', displayOrder: 1, active: true, streamEligible: false }]) } },
        { provide: SectionService, useValue: { getSectionsForClass: () => of([]) } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => null } } } },
        { provide: Router, useValue: {} },
        { provide: TeacherClassGrantService, useValue: { getForTeacher: () => of([]) } },
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(TimetableComponent);
    c = fixture.componentInstance;
    fixture.detectChanges();
    // ngOnInit opens on today's weekday; the fixtures sit on WEDNESDAY, so pick it explicitly
    // (as a teacher would via the day tabs) to keep the rendered card list independent of the run date.
    c.onDaySelect('WEDNESDAY');
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function clickEdit(matchText: string) {
    const buttons: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('.tt-card-list .tt-teacher-action-edit'));
    const btn = buttons.find(b => b.closest('.tt-period-card')?.textContent?.includes(matchText));
    btn?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('1. opens a teacher\'s own current-session entry with no writable-session error', async () => {
    await setup();
    await clickEdit('Mathematics');
    expect(c.modalError).toBeNull();
    c.saveEntry();
    expect(c.modalError).toBeNull();
  });

  it('2. populates the existing subject exactly (not the section/stream name)', async () => {
    await setup();
    await clickEdit('Mathematics');
    const subjectInput: HTMLSelectElement = fixture.nativeElement.querySelector('#modal-subject');
    expect(subjectInput.tagName).toBe('SELECT');   // B4-2: picked from configuration, never typed
    expect(Array.from(subjectInput.options).map(o => o.value)).toEqual(['', 'Mathematics', 'Physics', 'Maths', 'Biology', 'Accountancy']);
    expect(subjectInput.value).toBe('Mathematics');
    expect(c.modalForm.subjectName).toBe('Mathematics');
  });

  it('3. populates the existing class/section correctly', async () => {
    await setup();
    await clickEdit('Mathematics');
    expect(c.modalForm.classId).toBe(11);
    expect(c.modalForm.sectionId).toBe(3);
    expect(c.selectedMyClassKey).toBe('11::3');
    const classSelect: HTMLSelectElement = fixture.nativeElement.querySelector('#modal-my-class');
    expect(classSelect.value).toBe('11::3');
  });

  it('4. lets the teacher submit a valid update', async () => {
    await setup();
    await clickEdit('Mathematics');
    c.saveEntry();
    expect(api.updateEntry).toHaveBeenCalledWith(501, jasmine.objectContaining({
      classId: 11, sectionId: 3, subjectName: 'Mathematics', teacherId: 'T1', academicSessionId: 1
    }));
  });

  it('5. never requires admin-style session selection for a teacher', async () => {
    await setup();
    // The academic-session-selector and the session-writability admin check are gated to canManage().
    expect(fixture.nativeElement.querySelector('app-academic-session-selector')).toBeNull();
    await clickEdit('Mathematics');
    expect(c.canWrite()).toBeFalse(); // never true for a teacher — must not block their save
    c.saveEntry();
    expect(c.modalError).toBeNull();
  });

  it('6. another teacher\'s entry is not offered for edit and cannot be opened', async () => {
    await setup([mathEntry, otherTeacherEntry]);
    const buttons: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('.tt-card-list .tt-teacher-action-edit'));
    expect(buttons.length).toBe(1); // only the Mathematics (own) row offers Edit
    c.openEdit(otherTeacherEntry);
    expect(c.showModal).toBeFalse();
  });

  it('7. a historical (non-current-session) entry is not editable even if otherwise owned', async () => {
    await setup();
    // A genuinely historical row is never present in teacherEntries at all — getByTeacher only
    // ever returns current-session rows — so it carries a different id, never one already loaded.
    const historical = { ...mathEntry, id: 999, academicSessionId: 9 };
    expect(c.canEditEntry(historical)).toBeFalse();
    c.openEdit(historical);
    expect(c.showModal).toBeFalse();
  });

  it('11. with central period times, choosing a period in the form saves it with that period\'s time', async () => {
    // Regression: the Period Number list gave text ("8"), so the time lookup found nothing and
    // saving failed with "Period 8 does not have a time in the active timing profile".
    await setup();
    const periods = [1, 2, 3, 4, 5, 6, 7, 8].map(n => ({ periodNumber: n, startTime: `${String(7 + n).padStart(2, '0')}:00`, endTime: `${String(7 + n).padStart(2, '0')}:40` }));
    api.getTimingDisplay = jasmine.createSpy('getTimingDisplay').and.returnValue(of({ showTimes: true, activeProfileId: 1, activeProfileName: 'Regular day', periods }));
    c.loadTimingDisplay();
    c.openAddPeriodAsTeacher();
    fixture.detectChanges();
    await fixture.whenStable();
    const select: HTMLSelectElement = fixture.nativeElement.querySelector('#modal-period');
    select.selectedIndex = Array.from(select.options).findIndex(o => o.textContent?.trim() === 'Period 8');
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    c.modalForm.subjectName = 'Mathematics';
    c.saveEntry();
    expect(c.modalError).toBeNull();
    expect(api.createEntry).toHaveBeenCalledWith(jasmine.objectContaining({ periodNumber: 8, startTime: '15:00', endTime: '15:40' }));
  });

  it('8. adding a period into a slot another teacher already occupies still succeeds, with no conflict UI', async () => {
    // The NEW product rule: the timetable never rejects a row for colliding with another row —
    // same class/day/period/time, any subject, any teacher. There is no correction-request flow
    // and no conflict panel left to render.
    await setup([mathEntry, otherTeacherEntry]);
    c.openAddPeriodAsTeacher();
    fixture.detectChanges();
    c.modalForm.subjectName = 'Physics';
    c.modalForm.day = otherTeacherEntry.day;
    c.modalForm.periodNumber = otherTeacherEntry.periodNumber;
    c.modalForm.startTime = otherTeacherEntry.startTime;
    c.modalForm.endTime = otherTeacherEntry.endTime;
    c.saveEntry();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(c.modalError).toBeNull();
    expect(api.createEntry).toHaveBeenCalledWith(jasmine.objectContaining({ subjectName: 'Physics', teacherId: 'T1' }));
    expect(fixture.nativeElement.querySelector('.tt-corr-conflict')).toBeNull();
  });

  it('10. offers compact edit and delete buttons and confirms direct deletion', async () => {
    await setup();
    const edit: HTMLButtonElement = fixture.nativeElement.querySelector('.tt-teacher-action-edit');
    const remove: HTMLButtonElement = fixture.nativeElement.querySelector('.tt-teacher-action-delete');
    expect(edit).toBeTruthy();
    expect(remove).toBeTruthy();
    expect(edit.getAttribute('aria-label')).toContain('Edit period');
    expect(remove.getAttribute('aria-label')).toContain('Delete period');

    remove.click();
    await fixture.whenStable();
    expect(toast.confirm).toHaveBeenCalled();
    expect(api.deleteEntry).toHaveBeenCalledWith(501, 1);
    expect(c.showModal).toBeFalse();
  });

  it('9. Class 11 – Commerce: Add Period submits with a valid classId, no "unable to determine" error', async () => {
    // Regression for a reported bug: a teacher whose own timetable entry (for whatever reason)
    // carries no classId used to leave modalForm.classId undefined after selecting that exact
    // class from the dropdown, producing "Unable to determine the class for this period" on an
    // otherwise ordinary Add Period. buildMyClasses() now re-resolves classId from
    // managedClasses whenever the entry's own classId is missing.
    const commerceEntryMissingClassId: any = {
      id: 601, academicSessionId: 1, classId: undefined, className: '11', sectionId: 7, sectionName: 'Commerce',
      day: 'MONDAY', periodNumber: 1, startTime: '08:00', endTime: '08:40', subjectName: 'Accountancy',
      teacherId: 'T1', teacherName: 'Teacher One'
    };
    await setup([commerceEntryMissingClassId]);

    c.openAddPeriodAsTeacher();
    fixture.detectChanges();
    const classSelect: HTMLSelectElement = fixture.nativeElement.querySelector('#modal-my-class');
    classSelect.value = c.myClassKey({ className: '11', sectionId: 7 });
    classSelect.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(c.modalForm.classId).toBe(11);

    c.modalForm.day = 'FRIDAY';
    c.modalForm.periodNumber = 5;
    c.modalForm.startTime = '11:00';
    c.modalForm.endTime = '11:40';
    c.modalForm.subjectName = 'Maths';
    c.saveEntry();
    fixture.detectChanges();

    expect(c.modalError).toBeNull();
    expect(api.createEntry).toHaveBeenCalledWith(jasmine.objectContaining({ classId: 11, sectionId: 7, subjectName: 'Maths' }));
  });
});
