import { TestBed } from '@angular/core/testing';
import { TeacherDetailsComponent } from './teacher-details.component';
import { AuthService } from '../../auth/auth.service';
import { baselineTestProviders } from '../../../testing/baseline-test-providers';

/**
 * The teacher directory is school-wide for a Coordinator, but it never carries account controls:
 * a teacher may change only their own password, an Admin any teacher's.
 */
describe('TeacherDetailsComponent — account controls', () => {
  function create(role: string, me: string, viewed: string) {
    TestBed.configureTestingModule({
      imports: [TeacherDetailsComponent],
      providers: [...baselineTestProviders(), { provide: AuthService, useValue: { getUserRole: () => role, getUserId: () => me } }],
    });
    const component = TestBed.createComponent(TeacherDetailsComponent).componentInstance;
    component.role = role;
    component.teacherId = viewed;
    return component;
  }

  it('a teacher or Coordinator changes only their own password', () => {
    expect(create('TEACHER', 'emp_1', 'emp_1').canChangePassword()).toBeTrue();
    TestBed.resetTestingModule();
    expect(create('TEACHER', 'emp_1', 'emp_2').canChangePassword()).toBeFalse();
  });

  it('an Admin can reset any teacher; a Principal reads without account controls', () => {
    expect(create('ADMIN', 'adm_1', 'emp_2').canChangePassword()).toBeTrue();
    TestBed.resetTestingModule();
    expect(create('PRINCIPAL', 'pri_1', 'emp_2').canChangePassword()).toBeFalse();
  });
});
