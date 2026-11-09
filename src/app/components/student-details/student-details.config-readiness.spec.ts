import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { Location } from '@angular/common';
import { NEVER, Subject, of, throwError } from 'rxjs';
import { StudentDetailsComponent } from './student-details.component';
import { StudentService } from '../../services/student.service';
import { AuthService } from '../../auth/auth.service';
import { AuthStateService } from '../../auth/auth-state.service';
import { LoggerService } from '../../services/logger.service';
import { SchoolService } from '../../services/school.service';
import { SectionService } from '../../services/section.service';
import { ToastService } from '../../services/toast.service';
import { ParentPortalService } from '../../services/parent-portal.service';

/** Shared by the web and Android clients — keep the two copies identical. Class configuration never
 * blocks the profile; it only gates the class/section edit controls. */
describe('StudentDetailsComponent — class configuration readiness', () => {
  const student = { studentId: 'stu_1', name: 'Asha Rao', className: '9', sectionId: 91, sectionName: 'A',
    phoneNumber: '9876543210', email: 'asha@test.com', dob: '2012-02-03', joiningDate: '2026-09-01', status: 'ACTIVE' };

  function setup(school: { classes: any; managed: any }, sectionsFor: (id: number) => any = () => of([])) {
    const students = jasmine.createSpyObj('StudentService', ['getStudent', 'getEnrollmentHistory', 'getLoginStatus',
      'checkPendingDues', 'getRestorableParentLinks']);
    students.getStudent.and.returnValue(of(student));
    students.getEnrollmentHistory.and.returnValue(of([]));
    students.getLoginStatus.and.returnValue(of({ exists: true, active: true }));
    students.getRestorableParentLinks.and.returnValue(of([]));
    const auth = jasmine.createSpyObj('AuthService', ['getUserRole']);
    auth.getUserRole.and.returnValue('ADMIN');
    const schoolService = jasmine.createSpyObj('SchoolService', ['getClasses', 'getManagedClasses', 'getSettings']);
    schoolService.getSettings.and.returnValue(of({ timezone: 'Asia/Kolkata' }));
    schoolService.getClasses.and.returnValue(school.classes);
    schoolService.getManagedClasses.and.returnValue(school.managed);
    const sections = { getSectionsForClass: jasmine.createSpy('getSectionsForClass').and.callFake(sectionsFor) };
    const parents = jasmine.createSpyObj('ParentPortalService', ['getGuardians']);
    parents.getGuardians.and.returnValue(of([]));
    TestBed.configureTestingModule({
      imports: [StudentDetailsComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { params: of({ studentId: 'stu_1' }) } },
        { provide: Router, useValue: jasmine.createSpyObj('Router', ['navigate']) },
        { provide: Location, useValue: jasmine.createSpyObj('Location', ['back']) },
        { provide: StudentService, useValue: students },
        { provide: AuthService, useValue: auth },
        { provide: AuthStateService, useValue: { hasFeature: () => true } },
        { provide: LoggerService, useValue: jasmine.createSpyObj('LoggerService', ['error', 'info', 'warn']) },
        { provide: SchoolService, useValue: schoolService },
        { provide: SectionService, useValue: sections },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['confirm', 'success', 'error', 'info', 'warning', 'selectMonth']) },
        { provide: ParentPortalService, useValue: parents },
      ],
    });
    const fixture = TestBed.createComponent(StudentDetailsComponent);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, sections };
  }

  it('managed classes slow: the profile still renders and section editing waits', () => {
    const { fixture, component } = setup({ classes: of(['9', '10']), managed: NEVER });
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Asha Rao');
    expect(component.config.sectionsState).toBe('waiting');
    expect(component.config.sectionsPending).toBeTrue();
  });

  it('managed classes fail: the profile still renders; sections report failure with retry', () => {
    const { fixture, component } = setup({ classes: of(['9', '10']), managed: throwError(() => new Error('down')) });
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Asha Rao');
    expect(component.config.managedState).toBe('failed');
    expect(component.config.sectionsState).toBe('failed');
  });

  it('class list fails: the class edit control is disabled, the profile is shown', async () => {
    const { fixture, component } = setup({ classes: throwError(() => new Error('down')), managed: of([]) });
    component.isEditing = true;
    (component as any).cdr.markForCheck();
    fixture.detectChanges();
    await fixture.whenStable();   // ngModel applies [disabled] asynchronously
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Asha Rao');
    const select = root.querySelector('[data-testid="edit-class-select"]') as HTMLSelectElement;
    expect(select.disabled).toBeTrue();
    expect(root.querySelector('[data-testid="classes-failed"]')).not.toBeNull();
  });

  it('switching class during a section load ignores the stale response', () => {
    const responses: Record<number, Subject<any>> = { 9: new Subject(), 10: new Subject() };
    const { component } = setup({ classes: of(['9', '10']), managed: of([{ id: 9, name: '9' }, { id: 10, name: '10' }]) },
      (id) => responses[id]);
    component.onClassChangeInEdit('10');
    responses[9].next([{ id: 91, name: 'Stale' }]);
    expect(component.sections).toEqual([]);
    responses[10].next([{ id: 101, name: 'B' }]);
    expect(component.sections.map((s) => s.name)).toEqual(['B']);
    expect(component.updatedDetails?.sectionId).toBeUndefined();
  });
});
