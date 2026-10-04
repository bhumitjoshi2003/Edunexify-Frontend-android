import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { Router } from '@angular/router';

import { RegisterTeacherComponent } from './register-teacher.component';
import { TeacherService } from '../../services/teacher.service';
import { AuthService } from '../../auth/auth.service';
import { AuthStateService } from '../../auth/auth-state.service';
import { SchoolService } from '../../services/school.service';
import { SectionService } from '../../services/section.service';
import { ToastService } from '../../services/toast.service';

describe('RegisterTeacherComponent', () => {
  let component: RegisterTeacherComponent;
  let fixture: ComponentFixture<RegisterTeacherComponent>;
  let teacherService: jasmine.SpyObj<TeacherService>;
  let authService: jasmine.SpyObj<AuthService>;
  let toast: jasmine.SpyObj<ToastService>;

  beforeEach(async () => {
    teacherService = jasmine.createSpyObj('TeacherService', ['addTeacher']);
    authService = jasmine.createSpyObj('AuthService', ['register']);
    const authState = jasmine.createSpyObj('AuthStateService', ['getUserRole']);
    authState.getUserRole.and.returnValue('ADMIN');
    const schoolService = jasmine.createSpyObj('SchoolService', ['getClasses', 'getManagedClasses']);
    schoolService.getClasses.and.returnValue(of([]));
    schoolService.getManagedClasses.and.returnValue(of([]));
    const sectionService = jasmine.createSpyObj('SectionService', ['getSectionsForClass']);
    sectionService.getSectionsForClass.and.returnValue(of([]));
    toast = jasmine.createSpyObj('ToastService', ['error', 'success']);
    const router = jasmine.createSpyObj('Router', ['navigate']);

    await TestBed.configureTestingModule({
      imports: [RegisterTeacherComponent],
      providers: [
        { provide: TeacherService, useValue: teacherService },
        { provide: AuthService, useValue: authService },
        { provide: AuthStateService, useValue: authState },
        { provide: SchoolService, useValue: schoolService },
        { provide: SectionService, useValue: sectionService },
        { provide: ToastService, useValue: toast },
        { provide: Router, useValue: router },
      ],
    })
    .compileComponents();

    fixture = TestBed.createComponent(RegisterTeacherComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('has no teacherId control — Edunexify generates the Employee ID, it is never admin-entered', () => {
    expect(component.teacherForm.contains('teacherId')).toBeFalse();
  });

  it('marks the form invalid when date of birth is missing', () => {
    component.teacherForm.patchValue({
      name: 'Test', email: 'test@test.com', gender: 'MALE', dob: ''
    });
    expect(component.teacherForm.get('dob')?.valid).toBeFalse();
    expect(component.teacherForm.valid).toBeFalse();
  });

  it('onboards in ONE call — the backend creates the login in the same transaction; no second register call', () => {
    teacherService.addTeacher.and.returnValue(of({ teacherId: 'emp_26010007' } as any));

    component.teacherForm.patchValue({
      name: 'Test', email: 'test@test.com', gender: 'MALE', dob: '1985-03-20', joiningDate: '2026-04-01'
    });
    component.onSubmit();

    expect(teacherService.addTeacher).toHaveBeenCalledTimes(1);
    const sent = teacherService.addTeacher.calls.mostRecent().args[0] as any;
    expect(sent.password).toBeUndefined();
    expect(sent.teacherId).toBeUndefined();
    expect(authService.register).not.toHaveBeenCalled();
  });

  it('shows the server reason when onboarding is rejected (e.g. class teacher already assigned)', () => {
    teacherService.addTeacher.and.returnValue(throwError(() => ({
      status: 409, error: 'Class 5 - A already has a class teacher (Ms Rao). Remove that assignment first.'
    })));

    component.teacherForm.patchValue({
      name: 'Test', email: 'test@test.com', gender: 'MALE', dob: '1985-03-20', joiningDate: '2026-04-01'
    });
    component.onSubmit();

    expect(toast.error).toHaveBeenCalledWith('Error!', jasmine.stringMatching(/already has a class teacher/));
  });

  it('shows the DOB-based initial-password message and the Edunexify-generated Employee ID on success', () => {
    teacherService.addTeacher.and.returnValue(of({ teacherId: 'emp_26010007' } as any));

    component.teacherForm.patchValue({
      name: 'Test', email: 'test@test.com', gender: 'MALE', dob: '1985-03-20', joiningDate: '2026-04-01'
    });
    component.onSubmit();

    expect(toast.success).toHaveBeenCalledWith('Teacher Registered!', jasmine.stringMatching(/Date of birth in YYYYMMDD format/));
    expect(toast.success).toHaveBeenCalledWith('Teacher Registered!', jasmine.stringMatching(/emp_26010007/));
  });

});
