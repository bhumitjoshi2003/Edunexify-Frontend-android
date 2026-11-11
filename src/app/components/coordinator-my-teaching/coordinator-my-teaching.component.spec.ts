import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { CoordinatorMyTeachingComponent } from './coordinator-my-teaching.component';
import { AuthStateService } from '../../auth/auth-state.service';
import { TeacherCheckinService } from '../../services/teacher-checkin.service';
import { TeacherLeaveService } from '../../services/teacher-leave.service';
import { TimetableService } from '../../services/timetable.service';
import { TeacherSubstitutionService } from '../../services/teacher-substitution.service';

/** Shared by the web and Android clients — keep the two copies identical.
 * The teaching part of the Coordinator's single dashboard: check-in, today's classes and leave. */
describe('CoordinatorMyTeachingComponent', () => {
  let fixture: ComponentFixture<CoordinatorMyTeachingComponent>;
  let checkins: jasmine.SpyObj<TeacherCheckinService>;
  let leaves: jasmine.SpyObj<TeacherLeaveService>;
  let timetable: jasmine.SpyObj<TimetableService>;
  let substitutions: jasmine.SpyObj<TeacherSubstitutionService>;

  function create(inputs: Partial<CoordinatorMyTeachingComponent> = {}): HTMLElement {
    TestBed.configureTestingModule({
      imports: [CoordinatorMyTeachingComponent],
      providers: [
        provideRouter([]),
        { provide: AuthStateService, useValue: { getUserId: () => 'T1' } },
        { provide: TeacherCheckinService, useValue: checkins },
        { provide: TeacherLeaveService, useValue: leaves },
        { provide: TimetableService, useValue: timetable },
        { provide: TeacherSubstitutionService, useValue: substitutions },
      ],
    });
    fixture = TestBed.createComponent(CoordinatorMyTeachingComponent);
    Object.assign(fixture.componentInstance, inputs);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    checkins = jasmine.createSpyObj('TeacherCheckinService', ['getMyAttendance']);
    leaves = jasmine.createSpyObj('TeacherLeaveService', ['getMyLeaves']);
    timetable = jasmine.createSpyObj('TimetableService', ['getTeacherTimetable']);
    substitutions = jasmine.createSpyObj('TeacherSubstitutionService', ['getMine']);
    checkins.getMyAttendance.and.returnValue(of({ records: [] } as any));
    leaves.getMyLeaves.and.returnValue(of({ content: [{ status: 'PENDING' }, { status: 'APPROVED' }] } as any));
    timetable.getTeacherTimetable.and.returnValue(of([]));
    substitutions.getMine.and.returnValue(of([]));
  });

  it('shows check-in, classes and leave as one panel of the dashboard, each with its link', () => {
    const el = create();
    const hrefs = Array.from(el.querySelectorAll('a')).map(a => a.getAttribute('href'));
    expect(el.querySelector('h2')?.textContent).toContain('My teaching');
    expect(hrefs).toContain('/dashboard/teacher-checkin');
    expect(hrefs).toContain('/dashboard/apply-teacher-leave');
    expect(hrefs).toContain('/dashboard/timetable');
    expect(el.textContent).toContain('Not checked in yet');
    expect(el.textContent).toContain('1 request awaiting a decision');
    expect(el.textContent).toContain('No classes of yours are scheduled today.');
  });

  it('offers only the teaching tools that apply (class teacher, marks, classroom)', () => {
    let tools = Array.from(create().querySelectorAll('.mt-tools a')).map(a => a.getAttribute('href'));
    expect(tools).toEqual([]);
    TestBed.resetTestingModule();
    tools = Array.from(create({ classTeacherOf: 'Class 9', marksEnabled: true, classroomEnabled: true }).querySelectorAll('.mt-tools a'))
      .map(a => a.getAttribute('href'));
    expect(tools).toEqual(['/dashboard/teacher-attendance', '/dashboard/mark-entry', '/dashboard/homework-classwork', '/dashboard/teacher-class-updates']);
  });

  it('reports today\'s check-in from the personal attendance record', () => {
    const today = new Date();
    const key = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(today);
    checkins.getMyAttendance.and.returnValue(of({ records: [{ date: key, status: 'ON_TIME', checkInTime: `${key}T08:50:00` }] } as any));
    expect(create().textContent).toContain('Checked in');
  });

  it('isolates failures: a broken source only affects its own row', () => {
    checkins.getMyAttendance.and.returnValue(throwError(() => ({ status: 500 })));
    timetable.getTeacherTimetable.and.returnValue(throwError(() => ({ status: 500 })));
    const el = create();
    expect(el.textContent).toContain('Check-in status unavailable');
    expect(el.textContent).toContain("Today's classes could not be loaded");
    expect(el.textContent).toContain('1 request awaiting a decision');
  });
});
