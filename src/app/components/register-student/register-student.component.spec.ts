import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { Router } from '@angular/router';

import { RegisterStudentComponent } from './register-student.component';
import { StudentService } from '../../services/student.service';
import { AuthService } from '../../auth/auth.service';
import { AuthStateService } from '../../auth/auth-state.service';
import { SchoolService } from '../../services/school.service';
import { SectionService } from '../../services/section.service';
import { ToastService } from '../../services/toast.service';

describe('RegisterStudentComponent', () => {
  let component: RegisterStudentComponent;
  let fixture: ComponentFixture<RegisterStudentComponent>;
  let studentService: jasmine.SpyObj<StudentService>;
  let authService: jasmine.SpyObj<AuthService>;
  let toast: jasmine.SpyObj<ToastService>;

  beforeEach(async () => {
    studentService = jasmine.createSpyObj('StudentService', ['addStudent']);
    authService = jasmine.createSpyObj('AuthService', ['register']);
    const authState = jasmine.createSpyObj('AuthStateService', ['getUserRole']);
    authState.getUserRole.and.returnValue('ADMIN');
    // Android's component loads classes and managed classes in parallel via forkJoin.
    const schoolService = jasmine.createSpyObj('SchoolService', ['getClasses', 'getManagedClasses']);
    schoolService.getClasses.and.returnValue(of([]));
    schoolService.getManagedClasses.and.returnValue(of([]));
    const sectionService = jasmine.createSpyObj('SectionService', ['getSectionsForClass']);
    toast = jasmine.createSpyObj('ToastService', ['error', 'success']);
    const router = jasmine.createSpyObj('Router', ['navigate']);

    await TestBed.configureTestingModule({
      imports: [RegisterStudentComponent],
      providers: [
        { provide: StudentService, useValue: studentService },
        { provide: AuthService, useValue: authService },
        { provide: AuthStateService, useValue: authState },
        { provide: SchoolService, useValue: schoolService },
        { provide: SectionService, useValue: sectionService },
        { provide: ToastService, useValue: toast },
        { provide: Router, useValue: router },
      ],
    })
    .compileComponents();

    fixture = TestBed.createComponent(RegisterStudentComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('has no studentId control — Edunexify generates the Student ID, it is never admin-entered', () => {
    expect(component.studentForm.contains('studentId')).toBeFalse();
  });

  it('marks the form invalid when date of birth is missing', () => {
    component.studentForm.patchValue({
      name: 'Test', email: 'test@test.com',
      className: '10', gender: 'MALE', joiningDate: '2024-01-01', dob: ''
    });
    expect(component.studentForm.get('dob')?.valid).toBeFalse();
    expect(component.studentForm.valid).toBeFalse();
  });

  it('admits in ONE call — the backend creates the login in the same transaction; no second register call', () => {
    studentService.addStudent.and.returnValue(of({ studentId: 'stu_26010001' } as any));

    component.studentForm.patchValue({
      name: 'Test', email: 'test@test.com',
      className: '10', gender: 'MALE', joiningDate: '2024-01-01', dob: '1990-05-23'
    });
    component.onSubmit();

    expect(studentService.addStudent).toHaveBeenCalledTimes(1);
    const sent = studentService.addStudent.calls.mostRecent().args[0] as any;
    expect(sent.password).toBeUndefined();
    expect(sent.studentId).toBeUndefined();
    expect(authService.register).not.toHaveBeenCalled();
  });

  it('shows the DOB-based initial-password message and the Edunexify-generated Student ID on success', () => {
    studentService.addStudent.and.returnValue(of({ studentId: 'stu_26010001' } as any));

    component.studentForm.patchValue({
      name: 'Test', email: 'test@test.com',
      className: '10', gender: 'MALE', joiningDate: '2024-01-01', dob: '1990-05-23'
    });
    component.onSubmit();

    expect(toast.success).toHaveBeenCalledWith('Student Registered!', jasmine.stringMatching(/Date of birth in YYYYMMDD format/));
    expect(toast.success).toHaveBeenCalledWith('Student Registered!', jasmine.stringMatching(/stu_26010001/));
  });

  it('shows the server reason when an admission is rejected (e.g. a past-session joining date)', () => {
    studentService.addStudent.and.returnValue(throwError(() => ({
      status: 400, error: 'The joining date 2025-06-02 belongs to a past academic session (2025-2026).'
    })));

    component.studentForm.patchValue({
      name: 'Test', email: 'test@test.com',
      className: '10', gender: 'MALE', joiningDate: '2025-06-02', dob: '1990-05-23'
    });
    component.onSubmit();

    expect(toast.error).toHaveBeenCalledWith('Error!', jasmine.stringMatching(/past academic session/));
    expect(authService.register).not.toHaveBeenCalled();
  });
});
