import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { StudentDetailsComponent } from './student-details.component';
import { StudentService } from '../../services/student.service';
import { AuthService } from '../../auth/auth.service';
import { AuthStateService } from '../../auth/auth-state.service';
import { LoggerService } from '../../services/logger.service';
import { SchoolService } from '../../services/school.service';
import { SectionService } from '../../services/section.service';
import { ToastService } from '../../services/toast.service';
import { ParentPortalService } from '../../services/parent-portal.service';
import { CoordinatorService } from '../../services/coordinator.service';

/**
 * A Coordinator opens any student's profile (the directory is school-wide), but attendance, leave
 * and results follow the coordination scope: outside it the shortcuts give way to a note rather
 * than opening pages the server refuses. The profile itself always loads.
 */
describe('StudentDetailsComponent — Coordinator scope', () => {
  function create(opts: { coordinator: boolean; covered: boolean; role?: string }) {
    const students = jasmine.createSpyObj('StudentService', ['getStudent', 'getLoginStatus', 'getEnrollmentHistory']);
    students.getStudent.and.returnValue(of({ studentId: 'stu_2', name: 'Asha', className: '2', classId: 2, sectionId: 21,
      sectionName: 'A', status: 'ACTIVE' } as any));
    const auth = jasmine.createSpyObj('AuthService', ['getUserRole']);
    auth.getUserRole.and.returnValue(opts.role ?? (opts.coordinator ? 'TEACHER' : 'PRINCIPAL'));
    const user = opts.coordinator ? { userId: 'emp_1', role: 'TEACHER', coordinator: true, schoolSlug: 'demo' }
      : { userId: 'pri_1', role: opts.role ?? 'PRINCIPAL' };
    const coordinators = jasmine.createSpyObj('CoordinatorService', ['coversStudentRecords']);
    coordinators.coversStudentRecords.and.returnValue(of(opts.covered));
    const school = jasmine.createSpyObj('SchoolService', ['getClasses', 'getManagedClasses', 'getSettings']);
    school.getClasses.and.returnValue(of(['2']));
    school.getManagedClasses.and.returnValue(of([{ id: 2, name: '2' }]));
    school.getSettings.and.returnValue(of({ timezone: 'Asia/Kolkata' }));
    TestBed.configureTestingModule({
      imports: [StudentDetailsComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { params: of({ studentId: 'stu_2' }) } },
        { provide: Router, useValue: jasmine.createSpyObj('Router', ['navigate']) },
        { provide: StudentService, useValue: students },
        { provide: AuthService, useValue: auth },
        { provide: AuthStateService, useValue: {
          hasFeature: () => true, getUser: () => user, getUserRole: () => user.role, isCoordinator: () => opts.coordinator } },
        { provide: CoordinatorService, useValue: coordinators },
        { provide: LoggerService, useValue: jasmine.createSpyObj('LoggerService', ['error', 'info', 'warn']) },
        { provide: SchoolService, useValue: school },
        { provide: SectionService, useValue: { getSectionsForClass: () => of([{ id: 21, name: 'A' }]) } },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['confirm', 'success', 'error', 'info', 'warning']) },
        { provide: ParentPortalService, useValue: { getGuardians: () => of([]) } },
      ],
    });
    const fixture = TestBed.createComponent(StudentDetailsComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { el, coordinators, actions: Array.from(el.querySelectorAll('.sd-action-btn')).map(b => b.textContent!.trim()).join(' ') };
  }

  it('outside the scope: the profile loads and the record shortcuts become a note', () => {
    const { el, actions, coordinators } = create({ coordinator: true, covered: false });
    expect(el.textContent).toContain('Asha');
    expect(coordinators.coversStudentRecords).toHaveBeenCalledWith(jasmine.objectContaining({ classId: 2, sectionId: 21 }));
    expect(actions).not.toContain('Attendance');
    expect(actions).not.toContain('Leaves');
    expect(actions).not.toContain('Results');
    expect(el.querySelector('.sd-scope-note')?.textContent).toContain('outside your coordination scope');
  });

  it('inside the scope: the shortcuts stay', () => {
    const { el, actions } = create({ coordinator: true, covered: true });
    expect(actions).toContain('Attendance');
    expect(actions).toContain('Leaves');
    expect(actions).toContain('Results');
    expect(el.querySelector('.sd-scope-note')).toBeNull();
  });

  it('a Principal never consults the coordination scope', () => {
    const { el, actions, coordinators } = create({ coordinator: false, covered: false });
    expect(coordinators.coversStudentRecords).not.toHaveBeenCalled();
    expect(actions).toContain('Attendance');
    expect(el.querySelector('.sd-scope-note')).toBeNull();
  });
  it('in the Teacher workspace the profile behaves as for an ordinary teacher (no Coordinator check)', () => {
    const key = 'edunexify.workspace.v1.demo.emp_1';
    localStorage.setItem(key, 'TEACHER');
    try {
      const { coordinators, actions } = create({ coordinator: true, covered: false });
      expect(coordinators.coversStudentRecords).not.toHaveBeenCalled();
      expect(actions).toContain('Attendance');
    } finally {
      localStorage.removeItem(key);
    }
  });
});
