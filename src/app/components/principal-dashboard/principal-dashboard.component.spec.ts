import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { PrincipalDashboardComponent, PrincipalOverview, PrincipalStaffToday } from './principal-dashboard.component';
import { AuthStateService } from '../../auth/auth-state.service';
import { OnLeaveTodayComponent } from '../on-leave-today/on-leave-today.component';
import { Component } from '@angular/core';
import { environment } from '../../../environments/environment';
import { LeaveAttentionSummary } from '../../utils/leave-escalation.util';

@Component({ selector: 'app-on-leave-today', standalone: true, template: '' })
class OnLeaveTodayStubComponent {}

const api = environment.apiUrl;

function overview(patch: Partial<PrincipalOverview> = {}): PrincipalOverview {
  return {
    totalStudents: 420, totalTeachers: 30, todayAttendanceRate: null, schoolDate: '2026-11-09',
    todayRecordedStudents: 0, todayPresentStudents: 0, pendingStudentLeaves: 0, pendingTeacherLeaves: 0,
    publishedReportCards: 0, awaitingTeacherReview: 0, awaitingPrincipalReview: 0, readyForPublication: 0,
    returnedForCorrection: 0,
    classAttendance: [
      { className: '8', students: 40, attendanceRate: 91.5, workingDays: 6, recordedToday: true },
      { className: '9', students: 38, attendanceRate: null, workingDays: 0, recordedToday: false },
    ],
    ...patch,
  };
}

function staff(patch: Partial<PrincipalStaffToday> = {}): PrincipalStaffToday {
  return { date: '2026-11-09', presentCount: 24, lateCount: 1, absentCount: 0, halfDayCount: 0,
    onLeaveCount: 2, expectedCount: 28, notCheckedInCount: 3, ...patch };
}

describe('PrincipalDashboardComponent', () => {
  let fixture: ComponentFixture<PrincipalDashboardComponent>;
  let http: HttpTestingController;
  let features: string[];

  beforeEach(() => {
    features = ['REPORT_CARDS', 'SCHOOL_COMMUNICATION'];
    TestBed.configureTestingModule({
      imports: [PrincipalDashboardComponent, NoopAnimationsModule],
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: AuthStateService, useValue: {
          getUser: () => ({ name: 'Asha Rao', role: 'PRINCIPAL' }),
          hasFeature: (key: string) => features.includes(key),
        } },
      ],
    }).overrideComponent(PrincipalDashboardComponent, {
      remove: { imports: [OnLeaveTodayComponent] }, add: { imports: [OnLeaveTodayStubComponent] },
    });
    fixture = TestBed.createComponent(PrincipalDashboardComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  function respond(o: PrincipalOverview | 'fail', s: PrincipalStaffToday | 'fail' = staff(), uncovered: { assignment: unknown }[] = [],
                   leave: LeaveAttentionSummary | 'fail' = { today: '2026-11-16', student: null, teacher: null }) {
    const ov = http.expectOne(`${api}/principal/overview`);
    o === 'fail' ? ov.flush('down', { status: 503, statusText: 'Unavailable' }) : ov.flush(o);
    const st = http.expectOne(`${api}/principal/staff-attendance/today-summary`);
    s === 'fail' ? st.flush('down', { status: 503, statusText: 'Unavailable' }) : st.flush(s);
    const la = http.expectOne(`${api}/leaves/attention-summary`);
    leave === 'fail' ? la.flush('down', { status: 503, statusText: 'Unavailable' }) : la.flush(leave);
    const date = o === 'fail' ? null : o.schoolDate;
    const un = http.expectOne(r => r.url === `${api}/substitutions/uncovered` && (!date || r.params.get('date') === date));
    un.flush(uncovered);
    http.match(r => r.url.startsWith(`${api}/events/month/`)).forEach(r => r.flush([]));
    fixture.detectChanges();
  }

  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  it('distinguishes attendance not yet marked from a recorded 0%', () => {
    respond(overview());
    expect(text()).toContain('Not marked yet');
    expect(text()).not.toContain('0%');
  });

  it('orders attention by severity and hides zero counts', () => {
    respond(overview({ pendingTeacherLeaves: 2, awaitingPrincipalReview: 1 }), staff(), [{ assignment: null }, { assignment: { id: 1 } }]);
    const rows = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.pd-attention-list li'))
      .map(li => li.textContent?.trim() ?? '');
    expect(rows[0]).toContain('1 period has no substitute today');
    // Same severity: the larger count first.
    expect(rows[1]).toContain('3 teachers have not checked in');
    expect(rows[2]).toContain('1 class has not marked attendance');
    expect(rows.some(r => r.includes('student leave'))).toBeFalse();
    expect(rows.some(r => r.includes('report-card review awaits your approval'))).toBeTrue();
  });

  it('does not report missing attendance on a day the school is closed', () => {
    respond(overview(), staff({ expectedCount: 0, notCheckedInCount: 0 }));
    expect(text()).not.toContain('not marked attendance');
    expect(text()).toContain('No school today');
  });

  it('never claims all clear when a source failed', () => {
    respond(overview({ classAttendance: [] }), 'fail');
    expect(text()).not.toContain('Nothing needs your attention');
    expect(text()).toContain('this list may be incomplete');
  });

  it('keeps other widgets working when the overview fails, using the device date', () => {
    respond('fail');
    expect(text()).toContain("Today's overview could not be loaded.");
    expect(text()).toContain('3 teachers have not checked in');
    expect(text()).toContain('this list may be incomplete');
  });

  it('hides report-card widgets when the plan does not include report cards', () => {
    features = ['SCHOOL_COMMUNICATION'];
    respond(overview({ awaitingPrincipalReview: 4 }));
    expect(text()).not.toContain('Report-card reviews');
    expect(text()).not.toContain('awaits your approval');
    expect(text()).toContain('Active teachers');
  });

  it('marks leave rows overdue from day 3 and lists them before other actions', () => {
    respond(overview({ pendingTeacherLeaves: 1, pendingStudentLeaves: 3, awaitingPrincipalReview: 5 }), staff(), [],
      { today: '2026-11-16', student: { pending: 3, overdue: 2, oldestDay: 5 }, teacher: { pending: 1, overdue: 0, oldestDay: 2 } });
    const items = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.pd-attention-list li'));
    const student = items.find(li => li.textContent?.includes('student leave requests'))!;
    const teacher = items.find(li => li.textContent?.includes('teacher leave request'))!;
    expect(student.classList).toContain('is-overdue');
    expect(student.textContent).toContain('Needs Attention');
    expect(student.textContent).not.toContain('need attention');
    expect(student.textContent).not.toContain('oldest');
    expect(student.textContent).not.toContain('·');
    expect(teacher.classList).not.toContain('is-overdue');
    expect(teacher.textContent).not.toContain('Overdue');
    const actions = items.filter(li => li.classList.contains('is-action')).map(li => li.textContent ?? '');
    expect(actions[0]).toContain('student leave requests');
  });

  it('keeps leave rows neutral when the overdue summary is unavailable', () => {
    respond(overview({ pendingStudentLeaves: 2 }), staff(), [], 'fail');
    const student = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.pd-attention-list li'))
      .find(li => li.textContent?.includes('student leave requests'))!;
    expect(student.classList).not.toContain('is-overdue');
  });

  it('offers academic setup shortcuts, showing exam and classroom entries only when those features are on', () => {
    respond(overview());
    const links = () => Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.pd-setup-links a'))
      .map(a => a.getAttribute('href'));
    expect(links()).toEqual(['/dashboard/class-management', '/dashboard/subject-config', '/dashboard/timetable']);

    features = ['EXAMS_RESULTS', 'CLASSROOM'];
    (fixture.componentInstance as any).cdr.markForCheck(); // OnPush: the feature set is read from the auth service
    fixture.detectChanges();
    expect(links()).toEqual(['/dashboard/class-management', '/dashboard/subject-config', '/dashboard/exam-config',
      '/dashboard/assessment-groups', '/dashboard/student-stream', '/dashboard/elective-assignment', '/dashboard/timetable',
      '/dashboard/manage-assessments']);
  });
});
