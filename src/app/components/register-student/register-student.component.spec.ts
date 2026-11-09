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
    const schoolService = jasmine.createSpyObj('SchoolService', ['getClasses', 'getManagedClasses']);
    schoolService.getClasses.and.returnValue(of([]));
    schoolService.getManagedClasses.and.returnValue(of([]));
    const sectionService = jasmine.createSpyObj('SectionService', ['getSectionsForClass']);
    toast = jasmine.createSpyObj('ToastService', ['error', 'confirm']);
    toast.confirm.and.returnValue(Promise.resolve(true));
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
    }).compileComponents();

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

    expect(toast.confirm).toHaveBeenCalledWith(jasmine.objectContaining({
      message: jasmine.stringMatching(/Date of birth in YYYYMMDD format/),
    }));
    expect(toast.confirm).toHaveBeenCalledWith(jasmine.objectContaining({
      message: jasmine.stringMatching(/stu_26010001/),
    }));
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

  it('credentials stay on screen until acknowledged (one-button dialog, never a toast)', () => {
    studentService.addStudent.and.returnValue(of({ studentId: 'stu_9' } as any));
    component.studentForm.patchValue({
      name: 'Test', email: 'test@test.com',
      className: '10', gender: 'MALE', joiningDate: '2024-01-01', dob: '1990-05-23'
    });
    component.onSubmit();
    const dialog = toast.confirm.calls.mostRecent().args[0];
    expect(dialog.cancelText).toBeUndefined();
    expect(dialog.confirmText).toBe('Done');
  });

  it('class and section controls are gated by configuration readiness', () => {
    expect(component.config.classesReady).toBeTrue();
    expect(component.config.sectionsReady).toBeTrue();
    const select = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="class-select"]') as HTMLSelectElement;
    expect(select.disabled).toBeFalse();
  });

  // ── B5-1 / B5-2 / B5-4 ──────────────────────────────────────────────────────────────
  const valid = { name: 'Test', email: 'test@test.com', className: '10', gender: 'MALE', joiningDate: '2024-01-01', dob: '1990-05-23' };

  it('rejects a whitespace-only name without sending anything', () => {
    component.studentForm.patchValue({ ...valid, name: '   ' });
    expect(component.studentForm.get('name')?.hasError('required')).toBeTrue();
    component.onSubmit();
    expect(studentService.addStudent).not.toHaveBeenCalled();
  });

  it('requires a section only when the chosen class has sections', () => {
    component.studentForm.patchValue(valid);
    expect(component.studentForm.get('sectionId')?.valid).withContext('sectionless class').toBeTrue();

    component.config.sections = [{ id: 1, classId: 9, name: 'A', active: true } as any];
    component.studentForm.get('sectionId')?.updateValueAndValidity();
    expect(component.studentForm.get('sectionId')?.hasError('required')).toBeTrue();
    component.onSubmit();
    expect(studentService.addStudent).not.toHaveBeenCalled();

    studentService.addStudent.and.returnValue(of({ studentId: 'stu_1' } as any));
    component.studentForm.patchValue({ sectionId: 1 });
    expect(component.studentForm.valid).toBeTrue();
    component.onSubmit();
    expect((studentService.addStudent.calls.mostRecent().args[0] as any).sectionId).toBe(1);
  });

  it('shows the server message when the email already belongs to another account', () => {
    studentService.addStudent.and.returnValue(throwError(() => ({ status: 409, error: 'Email address is already in use.' })));
    component.studentForm.patchValue(valid);
    component.onSubmit();
    expect(toast.error).toHaveBeenCalledWith('Error!', 'Email address is already in use.');
  });
});
