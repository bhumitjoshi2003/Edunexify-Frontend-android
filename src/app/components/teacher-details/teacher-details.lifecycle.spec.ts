import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { NgForm } from '@angular/forms';
import { of } from 'rxjs';

import { TeacherDetailsComponent } from './teacher-details.component';
import { TeacherService } from '../../services/teacher.service';
import { AuthService } from '../../auth/auth.service';
import { LoggerService } from '../../services/logger.service';
import { ToastService } from '../../services/toast.service';
import { SchoolService } from '../../services/school.service';
import { SectionService } from '../../services/section.service';
import { TeacherOverview } from '../../interfaces/teacher';

/** Teacher / Staff Lifecycle Phase 1 on Teacher Details (admin). */
describe('TeacherDetailsComponent (lifecycle)', () => {
  let fixture: ComponentFixture<TeacherDetailsComponent>;
  let component: TeacherDetailsComponent;
  let teachers: jasmine.SpyObj<TeacherService>;
  let toast: jasmine.SpyObj<ToastService>;

  const teacher = (overrides: any = {}) => ({
    teacherId: 'emp_1', name: 'Asha Rao', email: 'asha@t.com', phoneNumber: '9876543210', dob: '1988-07-15',
    gender: 'F', classTeacher: null, classTeacherSectionId: null, joiningDate: '2026-04-01', status: 'ACTIVE',
    photoUrl: 'https://storage.example/p.jpg?X-Amz-Signature=abc', ...overrides,
  });

  const overview = (overrides: Partial<TeacherOverview> = {}): TeacherOverview => ({
    teacherId: 'emp_1', status: 'ACTIVE', joiningDate: '2026-04-01', rejoinDate: null, startsOn: null, leavingDate: null,
    exitScheduled: false, reasonForLeaving: null, classTeacher: null, classTeacherSectionId: null, classTeacherSectionName: null,
    classTeacherConfigurationExists: false, timetablePeriods: [], grants: [], login: { exists: true, active: true },
    pendingLeaveCount: 0, upcomingCoverCount: 0, ...overrides,
  });

  function setup(details: any, ov: TeacherOverview): void {
    teachers = jasmine.createSpyObj('TeacherService', ['getTeacher', 'getOverview', 'getAttendanceSchedules', 'updateTeacher',
      'exitTeacher', 'reactivateTeacher', 'cancelScheduledExit', 'createMissingLogin', 'changeAttendanceSchedule',
      'uploadTeacherPhotoDirect']);
    teachers.getTeacher.and.returnValue(of(details));
    teachers.getOverview.and.returnValue(of(ov));
    teachers.getAttendanceSchedules.and.returnValue(of([]));
    const auth = jasmine.createSpyObj('AuthService', ['getUserRole', 'changePassword']);
    auth.getUserRole.and.returnValue('ADMIN');
    const school = jasmine.createSpyObj('SchoolService', ['getSettings', 'getClasses', 'getManagedClasses']);
    school.getSettings.and.returnValue(of({ workingDays: 'MONDAY,TUESDAY' }));
    school.getClasses.and.returnValue(of(['5', '7']));
    school.getManagedClasses.and.returnValue(of([{ id: 5, name: '5' }, { id: 7, name: '7' }]));
    const sections = jasmine.createSpyObj('SectionService', ['getSectionsForClass']);
    sections.getSectionsForClass.and.callFake((id: number) => of(id === 5 ? [{ id: 51, name: 'A' }] : []));
    toast = jasmine.createSpyObj('ToastService', ['confirm', 'success', 'error', 'info', 'warning']);
    toast.confirm.and.resolveTo(true);

    TestBed.configureTestingModule({
      imports: [TeacherDetailsComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { params: of({ teacherId: 'emp_1' }) } },
        { provide: Router, useValue: jasmine.createSpyObj('Router', ['navigate']) },
        { provide: TeacherService, useValue: teachers },
        { provide: AuthService, useValue: auth },
        { provide: LoggerService, useValue: jasmine.createSpyObj('LoggerService', ['error', 'info', 'warn']) },
        { provide: ToastService, useValue: toast },
        { provide: SchoolService, useValue: school },
        { provide: SectionService, useValue: sections },
      ],
    });
    fixture = TestBed.createComponent(TeacherDetailsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';
  const button = (label: string) => Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'))
    .find(b => b.textContent?.trim() === label) as HTMLButtonElement | undefined;
  const validForm = { invalid: false, control: { markAllAsTouched() {} }, controls: {} } as unknown as NgForm;

  it('saves only admin-editable fields — never the signed photo URL, status or exit details', fakeAsync(() => {
    setup(teacher({ leavingDate: '2026-12-31', reasonForLeaving: 'x', exitRemarks: 'y', rejoinDate: '2026-01-01' }), overview());
    teachers.updateTeacher.and.returnValue(of(teacher({ name: 'Asha R' }) as any));
    component.updatedDetails = { ...component.updatedDetails!, name: 'Asha R' };

    component.saveTeacherDetails(validForm);
    tick();

    const payload = teachers.updateTeacher.calls.mostRecent().args[1] as any;
    expect(payload.name).toBe('Asha R');
    for (const forbidden of ['photoUrl', 'status', 'leavingDate', 'reasonForLeaving', 'exitRemarks', 'rejoinDate', 'teacherId', 'joiningDate']) {
      expect(forbidden in payload).withContext(forbidden).toBeFalse();
    }
    expect(component.teacherDetails?.photoUrl).toContain('X-Amz-Signature');
  }));

  it('warns that Activate will overwrite a direct class-teacher change when a session configuration exists', fakeAsync(() => {
    setup(teacher(), overview({ classTeacherConfigurationExists: true }));
    teachers.updateTeacher.and.returnValue(of(teacher({ classTeacher: '7' }) as any));
    component.updatedDetails = { ...component.updatedDetails!, classTeacher: '7' };

    component.saveTeacherDetails(validForm);
    tick();

    expect(toast.confirm.calls.mostRecent().args[0].message).toContain('"Activate"');
  }));

  it('shows "Joins on" for a future joiner and offers Create Login only when there is no login', fakeAsync(() => {
    setup(teacher({ status: 'UPCOMING', joiningDate: '2026-11-02' }),
      overview({ status: 'UPCOMING', startsOn: '2026-11-02', login: { exists: false, active: false } }));
    expect(text()).toContain('Joins on 2 November 2026');
    expect(text()).toContain('Not joined yet');
    expect(button('Create Login')).toBeTruthy();
    teachers.createMissingLogin.and.returnValue(of({ exists: true, active: false }));
    teachers.getOverview.and.returnValue(of(overview({ status: 'UPCOMING', startsOn: '2026-11-02', login: { exists: true, active: false } })));

    button('Create Login')!.click();
    tick();
    fixture.detectChanges();

    expect(teachers.createMissingLogin).toHaveBeenCalledWith('emp_1');
    expect(toast.confirm.calls.mostRecent().args[0].message).toContain('inactive until the joining date');
    expect(button('Create Login')).toBeUndefined();
  }));

  it('a future leaving date schedules the exit, and a scheduled exit can be cancelled', fakeAsync(() => {
    setup(teacher(), overview({ pendingLeaveCount: 1, upcomingCoverCount: 2 }));
    component.openExitModal();
    component.exitRequest = { reasonForLeaving: 'Resigned', leavingDate: '2099-03-31', exitRemarks: '' };
    fixture.detectChanges();
    expect(component.exitIsScheduled).toBeTrue();
    expect(text()).toContain('keeps working and keeps their login');
    teachers.exitTeacher.and.returnValue(of(teacher({ leavingDate: '2099-03-31' }) as any));
    teachers.getOverview.and.returnValue(of(overview({ exitScheduled: true, leavingDate: '2099-03-31' })));

    component.submitExit();
    tick();
    fixture.detectChanges();

    expect(toast.success).toHaveBeenCalledWith('Exit scheduled', jasmine.stringMatching(/2099-03-31/));
    expect(text()).toContain('Leaves after 31 March 2099');
    expect(button('Mark as Left')).toBeUndefined();
    teachers.cancelScheduledExit.and.returnValue(of(teacher() as any));
    button('Cancel Scheduled Exit')!.click();
    tick();
    expect(teachers.cancelScheduledExit).toHaveBeenCalledWith('emp_1');
  }));

  it('an immediate exit lists what will be cancelled and what stays to reassign', () => {
    setup(teacher(), overview({ pendingLeaveCount: 1, upcomingCoverCount: 2,
      timetablePeriods: [{ timetableEntryId: 9, day: 'MONDAY', periodNumber: 2, className: '5', sectionName: 'A', subjectName: 'Maths' }] }));
    component.openExitModal();
    fixture.detectChanges();
    expect(text()).toContain('1 pending leave request(s) and 2 upcoming cover(s) will be cancelled');
    expect(text()).toContain('1 timetable period(s) stay assigned');
  });

  it('a departed teacher shows the periods to reassign, and rejoin sends the chosen date and class without restoring the old one', fakeAsync(() => {
    const periods = [{ timetableEntryId: 9, day: 'MONDAY', periodNumber: 2, className: '5', sectionName: 'A', subjectName: 'Maths' }];
    setup(teacher({ status: 'LEFT', leavingDate: '2026-09-30' }),
      overview({ status: 'LEFT', leavingDate: '2026-09-30', timetablePeriods: periods, grants: [{ id: 1, className: '7', sectionName: null }],
        login: { exists: true, active: false } }));
    expect(text()).toContain('1 timetable period(s) are still assigned');
    expect(button('Create Login')).toBeUndefined();

    component.openRejoinModal();
    fixture.detectChanges();
    expect(text()).toContain('1 old timetable period(s)');
    expect(text()).toContain('1 extra class access grant(s)');
    expect(text()).toContain('not restored automatically');
    component.rejoinDate = '2026-10-20';
    component.rejoinClassTeacher = '5';
    component.onRejoinClassChange('5');
    component.rejoinSectionId = 51;
    teachers.reactivateTeacher.and.returnValue(of(teacher({ status: 'UPCOMING', rejoinDate: '2026-10-20', classTeacher: '5', classTeacherSectionId: 51 }) as any));

    component.submitRejoin();
    tick();

    expect(teachers.reactivateTeacher).toHaveBeenCalledWith('emp_1', { rejoinDate: '2026-10-20', classTeacher: '5', classTeacherSectionId: 51 });
  }));
});
