import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { Location } from '@angular/common';
import { of } from 'rxjs';

import { StudentDetailsComponent } from './student-details.component';
import { StudentService } from '../../services/student.service';
import { AuthService } from '../../auth/auth.service';
import { LoggerService } from '../../services/logger.service';
import { SchoolService } from '../../services/school.service';
import { SectionService } from '../../services/section.service';
import { ToastService } from '../../services/toast.service';
import { EnrollmentHistoryItem } from '../../interfaces/student';
import { ParentPortalService } from '../../services/parent-portal.service';
import { GuardianLink } from '../../interfaces/parent-portal';

/** Student Admission Phase 1: safe edit payloads and the admin lifecycle actions. */
describe('StudentDetailsComponent (admission lifecycle)', () => {
  let fixture: ComponentFixture<StudentDetailsComponent>;
  let component: StudentDetailsComponent;
  let students: jasmine.SpyObj<StudentService>;
  let toast: jasmine.SpyObj<ToastService>;
  let parents: jasmine.SpyObj<ParentPortalService>;

  const baseStudent = (overrides: any = {}) => ({
    studentId: 'stu_1', name: 'Asha Rao', className: '9', sectionId: 91, sectionName: 'A',
    phoneNumber: '9876543210', email: 'asha@test.com', dob: '2012-02-03', joiningDate: '2026-09-01',
    status: 'ACTIVE', photoUrl: 'https://storage.example/p.jpg?X-Amz-Signature=abc', takesBus: false, distance: null,
    ...overrides,
  });

  const history: EnrollmentHistoryItem[] = [
    { id: 1, academicSessionId: 5, sessionLabel: '2026-2027', classId: 9, className: '9', sectionId: 91, sectionName: 'A',
      status: 'CLOSED', state: 'CLOSED', effectiveFrom: '2026-04-01', effectiveUntil: '2026-09-20', closureReason: 'WITHDRAWN' },
    { id: 2, academicSessionId: 5, sessionLabel: '2026-2027', classId: 10, className: '10', sectionId: 102, sectionName: 'B',
      status: 'ACTIVE', state: 'CURRENT', effectiveFrom: '2026-09-25', effectiveUntil: null, closureReason: null },
  ];

  function setup(student: any, role = 'ADMIN', login = { exists: true, active: true }, guardians: GuardianLink[] = []): void {
    parents = jasmine.createSpyObj('ParentPortalService', ['getGuardians']);
    parents.getGuardians.and.returnValue(of(guardians));
    students = jasmine.createSpyObj('StudentService', [
      'getStudent', 'updateStudent', 'exitStudent', 'readmitStudent', 'checkPendingDues', 'cancelAdmission',
      'getLoginStatus', 'createMissingLogin', 'getEnrollmentHistory', 'getRestorableParentLinks', 'restoreParentLinks',
      'uploadStudentPhotoDirect']);
    students.getStudent.and.returnValue(of(student));
    students.getEnrollmentHistory.and.returnValue(of(history));
    students.getLoginStatus.and.returnValue(of(login));
    const auth = jasmine.createSpyObj('AuthService', ['getUserRole', 'changePassword']);
    auth.getUserRole.and.returnValue(role);
    const school = jasmine.createSpyObj('SchoolService', ['getClasses', 'getManagedClasses']);
    school.getClasses.and.returnValue(of(['9', '10']));
    school.getManagedClasses.and.returnValue(of([{ id: 9, name: '9' }, { id: 10, name: '10' }]));
    const sections = jasmine.createSpyObj('SectionService', ['getSectionsForClass']);
    sections.getSectionsForClass.and.callFake((classId: number) =>
      of(classId === 10 ? [{ id: 101, name: 'A' }, { id: 102, name: 'B' }] : [{ id: 91, name: 'A' }]));
    toast = jasmine.createSpyObj('ToastService', ['confirm', 'confirmWithReason', 'success', 'error', 'info', 'warning', 'selectMonth']);
    toast.confirm.and.resolveTo(true);

    TestBed.configureTestingModule({
      imports: [StudentDetailsComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { params: of({ studentId: 'stu_1' }) } },
        { provide: Router, useValue: jasmine.createSpyObj('Router', ['navigate']) },
        { provide: Location, useValue: jasmine.createSpyObj('Location', ['back']) },
        { provide: StudentService, useValue: students },
        { provide: AuthService, useValue: auth },
        { provide: LoggerService, useValue: jasmine.createSpyObj('LoggerService', ['error', 'info', 'warn']) },
        { provide: SchoolService, useValue: school },
        { provide: SectionService, useValue: sections },
        { provide: ToastService, useValue: toast },
        { provide: ParentPortalService, useValue: parents },
      ],
    });
    fixture = TestBed.createComponent(StudentDetailsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';
  const button = (label: string) => Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'))
    .find(b => b.textContent?.trim() === label) as HTMLButtonElement | undefined;

  it('saves only admin-editable fields — never the signed photo URL, status or exit details', fakeAsync(() => {
    setup(baseStudent({ leavingDate: '2026-01-01', reasonForLeaving: 'x', exitRemarks: 'y' }));
    students.updateStudent.and.returnValue(of(baseStudent({ name: 'Asha R' }) as any));
    component.isEditing = true;
    component.updatedDetails = { ...component.updatedDetails!, name: 'Asha R' };

    component.executeUpdate();
    tick();

    const payload = students.updateStudent.calls.mostRecent().args[1] as any;
    expect(payload.studentDetails.name).toBe('Asha R');
    for (const forbidden of ['photoUrl', 'status', 'leavingDate', 'reasonForLeaving', 'exitRemarks', 'conductAtLeaving', 'studentId']) {
      expect(forbidden in payload.studentDetails).withContext(forbidden).toBeFalse();
    }
    // The displayed photo is kept as it was.
    expect(component.studentDetails?.photoUrl).toContain('X-Amz-Signature');
  }));

  it('warns that earlier records stay with the old class when an active student changes class', fakeAsync(() => {
    setup(baseStudent());
    students.updateStudent.and.returnValue(of(baseStudent({ className: '10' }) as any));
    component.updatedDetails = { ...component.updatedDetails!, className: '10', sectionId: 102 };

    component.executeUpdate();
    tick();

    expect(toast.confirm.calls.mostRecent().args[0].message).toContain('stay with the previous class/section');
  }));

  it('shows the enrollment history with each period state', () => {
    setup(baseStudent());
    expect(text()).toContain('Enrollment History');
    expect(text()).toContain('Closed');
    expect(text()).toContain('Current');
    expect(text()).toContain('Withdrawn');
    expect(text()).toContain('2026-2027');
  });

  it('offers Cancel Admission only for an upcoming student and sends the reason', fakeAsync(() => {
    setup(baseStudent({ status: 'UPCOMING' }));
    expect(button('Cancel Admission')).toBeTruthy();
    toast.confirmWithReason.and.resolveTo('Chose another school');
    students.cancelAdmission.and.returnValue(of(baseStudent({ status: 'ADMISSION_CANCELLED' }) as any));

    button('Cancel Admission')!.click();
    tick();
    fixture.detectChanges();

    expect(students.cancelAdmission).toHaveBeenCalledWith('stu_1', 'Chose another school');
    expect(text()).toContain('Admission cancelled');
    expect(button('Re-admit')).toBeTruthy();
  }));

  it('does not offer Cancel Admission for an active student', () => {
    setup(baseStudent());
    expect(button('Cancel Admission')).toBeUndefined();
  });

  it('offers Create Login only when the student has no login', fakeAsync(() => {
    setup(baseStudent(), 'ADMIN', { exists: false, active: false });
    expect(button('Create Login')).toBeTruthy();
    students.createMissingLogin.and.returnValue(of({ exists: true, active: true }));

    button('Create Login')!.click();
    tick();
    fixture.detectChanges();

    expect(students.createMissingLogin).toHaveBeenCalledWith('stu_1');
    expect(button('Create Login')).toBeUndefined();
  }));

  it('hides Create Login when a login already exists', () => {
    setup(baseStudent());
    expect(button('Create Login')).toBeUndefined();
  });

  it('readmits into the chosen class, section and date, then restores parent access only after confirmation', fakeAsync(() => {
    setup(baseStudent({ status: 'WITHDRAWN', leavingDate: '2026-09-20' }));
    students.readmitStudent.and.returnValue(of(baseStudent({ status: 'ACTIVE', className: '10', sectionId: 102 }) as any));
    students.getRestorableParentLinks.and.returnValue(of([
      { relationshipId: 7, parentId: 'par_1', parentName: 'Mum', relationshipType: 'MOTHER', primaryGuardian: true, endedOn: '2026-09-20' },
    ]));
    students.restoreParentLinks.and.returnValue(of({ restored: 1 }));

    component.openReadmitModal();
    component.readmitClassName = '10';
    component.onReadmitClassChange('10');
    component.readmitSectionId = 102;
    component.readmitDate = '2026-09-25';
    toast.confirm.and.resolveTo(false);            // first: decline restoring parent access
    component.submitReadmit();
    tick();

    expect(students.readmitStudent).toHaveBeenCalledWith('stu_1', { classId: 10, sectionId: 102, readmissionDate: '2026-09-25' });
    expect(toast.confirm.calls.mostRecent().args[0].message).toContain('Mum (mother)');
    expect(students.restoreParentLinks).not.toHaveBeenCalled();

    toast.confirm.and.resolveTo(true);             // readmit again → confirm restoring
    component.submitReadmit();
    tick();
    expect(students.restoreParentLinks).toHaveBeenCalledWith('stu_1', [7]);
  }));

  it('does not allow class, section or joining date to be edited for a student who has left', () => {
    setup(baseStudent({ status: 'TRANSFERRED' }));
    component.isEditing = true;
    fixture.detectChanges();
    const selects = (fixture.nativeElement as HTMLElement).querySelectorAll('select.sd-item-input');
    expect(selects.length).toBe(0);
    expect((fixture.nativeElement as HTMLElement).querySelector('input[type="date"].sd-item-input')).toBeNull();
  });

  it('shows a read-only Guardians panel to the admin: primary, ended links, access summary and login state', () => {
    const guardian = (o: Partial<GuardianLink>): GuardianLink => ({
      relationshipId: 1, parentId: 'par_1', parentName: 'Mum', phoneNumber: '9800000001', email: 'mum@x.test',
      relationshipType: 'MOTHER', primaryGuardian: true, linkStatus: 'ACTIVE', effectiveFrom: '2026-04-01', effectiveUntil: null,
      canViewAttendance: true, canViewFees: true, canPayFees: true, canViewResults: true, canViewTimetable: true,
      canManageLeave: true, parentActive: true, loginState: 'ACTIVE', ...o,
    });
    setup(baseStudent(), 'ADMIN', { exists: true, active: true }, [
      guardian({}),
      guardian({ relationshipId: 2, parentId: 'par_2', parentName: 'Dad', primaryGuardian: false, linkStatus: 'ENDED',
        effectiveUntil: '2026-09-30', canPayFees: false, canViewFees: false, parentActive: false, loginState: 'DISABLED' }),
    ]);

    expect(parents.getGuardians).toHaveBeenCalledWith('stu_1');
    const panel = text();
    expect(panel).toContain('Guardians');
    expect(panel).toContain('Primary guardian');
    expect(panel).toContain('Standard access');
    expect(panel).toContain('Ended');
    expect(panel).toContain('Attendance · Results · Timetable · Leave');
    expect(panel).toContain('Account disabled');
    expect(panel).not.toContain('password');
  });

  it('never asks a non-admin for guardians', () => {
    setup(baseStudent(), 'TEACHER');
    expect(parents.getGuardians).not.toHaveBeenCalled();
    expect(text()).not.toContain('Guardians');
  });
});
