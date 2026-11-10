import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';

import { StaffAttendanceComponent } from './staff-attendance.component';
import { AuthStateService } from '../../auth/auth-state.service';
import { TeacherCheckinService } from '../../services/teacher-checkin.service';
import { TeacherService } from '../../services/teacher.service';
import { TenantService } from '../../services/tenant.service';
import { LoggerService } from '../../services/logger.service';
import { ToastService } from '../../services/toast.service';
import { AcademicSessionService } from '../../services/academic-session.service';
import { AcademicSession } from '../../interfaces/academic-session';

/**
 * Phase 1B migration: the "Academic Session" report-period dropdown used to fabricate its own
 * rolling 6-year "YYYY-YYYY" list from School.academicYearStartMonth + today's date — a value
 * never validated against any session the backend actually recognized, sent straight into
 * getTeacherSessionSummary. It now sources choices from AcademicSessionService.getAllSessions(),
 * so the label sent to the backend always matches a real AcademicSession.
 */
describe('StaffAttendanceComponent — academic session sourcing', () => {
  let component: StaffAttendanceComponent;
  let fixture: ComponentFixture<StaffAttendanceComponent>;
  let checkinServiceSpy: jasmine.SpyObj<TeacherCheckinService>;
  let academicSessionServiceSpy: jasmine.SpyObj<AcademicSessionService>;
  let toastSpy: jasmine.SpyObj<ToastService>;

  const session = (id: number, label: string, current: boolean): AcademicSession => ({
    id, label, startDate: `${label.split('-')[0]}-04-01`, endDate: `${label.split('-')[1]}-03-31`, current,
  });

  beforeEach(async () => {
    checkinServiceSpy = jasmine.createSpyObj('TeacherCheckinService', [
      'getByDate', 'getSummary', 'getTeacherSessionSummary', 'getSchoolTiming', 'adminMark',
    ]);
    checkinServiceSpy.getByDate.and.returnValue(of([]));
    checkinServiceSpy.getSchoolTiming.and.returnValue(of({} as any));

    academicSessionServiceSpy = jasmine.createSpyObj('AcademicSessionService', ['getAllSessions', 'getCurrentSession']);

    toastSpy = jasmine.createSpyObj('ToastService', ['success', 'error', 'warning', 'info', 'confirm']);

    const teacherServiceSpy = jasmine.createSpyObj('TeacherService', ['getAllTeachers']);
    teacherServiceSpy.getAllTeachers.and.returnValue(of([]));

    await TestBed.configureTestingModule({
      imports: [StaffAttendanceComponent],
      providers: [
        { provide: AuthStateService, useValue: { getUserRole: () => 'ADMIN' } },
        { provide: TeacherCheckinService, useValue: checkinServiceSpy },
        { provide: TeacherService, useValue: teacherServiceSpy },
        { provide: TenantService, useValue: jasmine.createSpyObj('TenantService', ['getLogoUrl']) },
        { provide: LoggerService, useValue: jasmine.createSpyObj('LoggerService', ['error', 'warn', 'info']) },
        { provide: ToastService, useValue: toastSpy },
        { provide: AcademicSessionService, useValue: academicSessionServiceSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(StaffAttendanceComponent);
    component = fixture.componentInstance;
  });

  it('sources session choices from the backend and defaults to the authoritative current session, not a date-guessed one', () => {
    // Today's real date + a default startMonth would never coincidentally produce this label —
    // proving the value came from the mock, not from Date-based arithmetic.
    academicSessionServiceSpy.getAllSessions.and.returnValue(of([
      session(2, '2025-2026', true),
      session(1, '2024-2025', false),
    ]));

    fixture.detectChanges();

    expect(academicSessionServiceSpy.getAllSessions).toHaveBeenCalled();
    expect(component.sessionOptions).toEqual(['2025-2026', '2024-2025']);
    expect(component.selectedSession).toBe('2025-2026');
  });

  it('preserves historical session selection: choosing a past session sends its exact label to the backend', () => {
    academicSessionServiceSpy.getAllSessions.and.returnValue(of([
      session(2, '2025-2026', true),
      session(1, '2024-2025', false),
    ]));
    checkinServiceSpy.getTeacherSessionSummary.and.returnValue(of({} as any));
    fixture.detectChanges();

    component.selectedTeacherId = 'T1';
    component.individualPeriod = 'session';
    component.selectedSession = '2024-2025'; // admin picks the historical option from the dropdown
    component.loadIndividualReport();

    expect(checkinServiceSpy.getTeacherSessionSummary).toHaveBeenCalledWith('T1', '2024-2025');
  });

  it('falls back to the most recent session when the school has sessions but none is marked current', () => {
    academicSessionServiceSpy.getAllSessions.and.returnValue(of([
      session(2, '2025-2026', false),
      session(1, '2024-2025', false),
    ]));

    fixture.detectChanges();

    expect(component.selectedSession).toBe('2025-2026'); // first = most recent, per backend ordering
  });

  it('leaves the session list empty (not a guess) when the school has no sessions at all', () => {
    academicSessionServiceSpy.getAllSessions.and.returnValue(of([]));

    fixture.detectChanges();

    expect(component.sessionOptions).toEqual([]);
    expect(component.selectedSession).toBe('');
  });

  it('sets loadingSessions while the request is in flight and clears it on success', () => {
    const subject = new Subject<AcademicSession[]>();
    academicSessionServiceSpy.getAllSessions.and.returnValue(subject.asObservable());

    fixture.detectChanges();
    expect(component.loadingSessions).toBeTrue();

    subject.next([session(1, '2025-2026', true)]);
    subject.complete();
    expect(component.loadingSessions).toBeFalse();
  });

  it('degrades safely on API failure: no fabricated sessions, an error toast, and loading clears', () => {
    academicSessionServiceSpy.getAllSessions.and.returnValue(throwError(() => new Error('network error')));

    fixture.detectChanges();

    expect(component.sessionOptions).toEqual([]);
    expect(component.selectedSession).toBe('');
    expect(component.loadingSessions).toBeFalse();
    expect(toastSpy.error).toHaveBeenCalled();
  });
});
