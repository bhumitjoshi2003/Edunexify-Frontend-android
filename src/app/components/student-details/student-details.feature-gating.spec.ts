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

describe('StudentDetailsComponent — fee feature gating', () => {
  let students: jasmine.SpyObj<StudentService>;

  function create(enabled: string[]) {
    students = jasmine.createSpyObj('StudentService', ['getStudent', 'checkPendingDues', 'getLoginStatus', 'getEnrollmentHistory']);
    students.getStudent.and.returnValue(of({ studentId: 'stu_1', name: 'Asha', className: '9', sectionId: 91, status: 'ACTIVE',
      phoneNumber: '9876543210', email: 'a@t.com', dob: '2012-02-03', joiningDate: '2026-04-01' } as any));
    students.getLoginStatus.and.returnValue(of({ exists: true, active: true } as any));
    students.getEnrollmentHistory.and.returnValue(of([]));
    students.checkPendingDues.and.returnValue(of({ hasPendingDues: false } as any));
    const auth = jasmine.createSpyObj('AuthService', ['getUserRole']);
    auth.getUserRole.and.returnValue('ADMIN');
    const school = jasmine.createSpyObj('SchoolService', ['getClasses', 'getManagedClasses', 'getSettings']);
    school.getSettings.and.returnValue(of({ timezone: 'Asia/Kolkata' }));
    school.getClasses.and.returnValue(of(['9']));
    school.getManagedClasses.and.returnValue(of([{ id: 9, name: '9' }]));
    TestBed.configureTestingModule({
      imports: [StudentDetailsComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { params: of({ studentId: 'stu_1' }) } },
        { provide: Router, useValue: jasmine.createSpyObj('Router', ['navigate']) },
        { provide: StudentService, useValue: students },
        { provide: AuthService, useValue: auth },
        { provide: AuthStateService, useValue: { hasFeature: (k: string) => enabled.includes(k) } },
        { provide: LoggerService, useValue: jasmine.createSpyObj('LoggerService', ['error', 'info', 'warn']) },
        { provide: SchoolService, useValue: school },
        { provide: SectionService, useValue: { getSectionsForClass: () => of([{ id: 91, name: 'A' }]) } },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['confirm', 'success', 'error', 'info', 'warning']) },
        { provide: ParentPortalService, useValue: { getGuardians: () => of([]) } },
      ],
    });
    const fixture = TestBed.createComponent(StudentDetailsComponent);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }
  const actions = (el: HTMLElement) => Array.from(el.querySelectorAll('.sd-action-btn')).map(b => b.textContent!.trim());

  it('hides Payments and Fee Details, and checks no dues, when the fee features are off', () => {
    const { component, el } = create([]);
    expect(actions(el).join(' ')).not.toContain('Payments');
    expect(actions(el).join(' ')).not.toContain('Fee Details');
    expect(actions(el).join(' ')).toContain('Attendance');
    component.openExitModal();
    expect(students.checkPendingDues).not.toHaveBeenCalled();
  });

  it('keeps Payments, Fee Details and the dues check when the features are on', () => {
    const { component, el } = create(['FEE_MANAGEMENT', 'ONLINE_PAYMENTS']);
    expect(actions(el).join(' ')).toContain('Payments');
    expect(actions(el).join(' ')).toContain('Fee Details');
    component.openExitModal();
    expect(students.checkPendingDues).toHaveBeenCalledWith('stu_1');
  });

  it('Fee Details follows FEE_MANAGEMENT and Payments follows ONLINE_PAYMENTS independently', () => {
    const { el } = create(['ONLINE_PAYMENTS']);
    expect(actions(el).join(' ')).toContain('Payments');
    expect(actions(el).join(' ')).not.toContain('Fee Details');
  });
});
