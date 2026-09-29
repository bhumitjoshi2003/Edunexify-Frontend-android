import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AdminDashboardComponent } from './admin-dashboard.component';
import { AuthStateService } from '../../auth/auth-state.service';
import { AdminService } from '../../services/admin.service';
import { DashboardAnalyticsService } from '../../services/dashboard-analytics.service';
import { LeaveService } from '../../services/leave.service';
import { SchoolService } from '../../services/school.service';
import { TeacherCheckinService } from '../../services/teacher-checkin.service';
import { StaffAdoptionService } from '../../services/staff-adoption.service';
import { LoggerService } from '../../services/logger.service';
import { ToastService } from '../../services/toast.service';
import { TeacherLeaveService } from '../../services/teacher-leave.service';
import { EventService } from '../../services/event.service';
import { TeacherSubstitutionService } from '../../services/teacher-substitution.service';

describe('AdminDashboardComponent — Daily Action Center (Phase 1)', () => {
  let fixture: ComponentFixture<AdminDashboardComponent>;
  let component: AdminDashboardComponent;
  let staffAdoptionService: jasmine.SpyObj<StaffAdoptionService>;
  let teacherLeaveService: jasmine.SpyObj<TeacherLeaveService>;
  let eventService: jasmine.SpyObj<EventService>;
  let adminService: jasmine.SpyObj<AdminService>;

  function configure(role: string, opts: {
    stats?: any; staffAttendance?: any; teacherLeavesTotal?: number; events?: any[];
    entitlement?: any;
    statsError?: boolean; staffAttendanceError?: boolean; studentLeavesError?: boolean;
    entitlementError?: boolean; staffAdoptionError?: boolean;
  } = {}): void {
    const authState = jasmine.createSpyObj('AuthStateService', ['getUser', 'hasFeature']);
    authState.getUser.and.returnValue({ userId: 'U1', role, name: 'Test', className: '' } as any);
    authState.hasFeature.and.returnValue(false);

    staffAdoptionService = jasmine.createSpyObj('StaffAdoptionService', ['getStaffAdoption']);
    staffAdoptionService.getStaffAdoption.and.returnValue(
      opts.staffAdoptionError
        ? throwError(() => new Error('staff adoption offline'))
        : of({
          summary: { totalTeachers: 22, startedTeachers: 18, notStartedTeachers: 3, attendanceUsedTeachers: 16, disabledTeachers: 1 },
          teachers: [],
        }),
    );

    const stats = opts.stats ?? { totalStudents: 0, totalTeachers: 10, feesCollectedThisMonth: 0, overdueStudents: 0, todayAttendanceRate: 0, pendingLeaves: 0 };
    const staffAttendance = opts.staffAttendance ?? { date: '2026-09-22', presentCount: 4, lateCount: 1, absentCount: 0, halfDayCount: 0, onLeaveCount: 1 };

    teacherLeaveService = jasmine.createSpyObj('TeacherLeaveService', ['getLeaves']);
    teacherLeaveService.getLeaves.and.returnValue(of({
      content: [], totalElements: opts.teacherLeavesTotal ?? 0, totalPages: 1, size: 1, number: 0, first: true, last: true, empty: true,
    }));
    eventService = jasmine.createSpyObj('EventService', ['getEventsForMonthAndYear']);
    eventService.getEventsForMonthAndYear.and.returnValue(of(opts.events ?? []));
    adminService = jasmine.createSpyObj('AdminService', ['getAdminById']);
    adminService.getAdminById.and.returnValue(of({ name: 'Test Admin' } as any));

    TestBed.configureTestingModule({
      imports: [AdminDashboardComponent],
      providers: [
        provideRouter([]),
        { provide: TeacherSubstitutionService, useValue: { getUncovered: () => of([]) } },
        { provide: AuthStateService, useValue: authState },
        { provide: AdminService, useValue: adminService },
        {
          provide: DashboardAnalyticsService, useValue: {
            getStats: () => opts.statsError ? throwError(() => new Error('stats offline')) : of(stats),
          },
        },
        {
          provide: LeaveService, useValue: {
            getOnLeaveToday: () => of({ date: '2026-10-05', students: [], staff: [], periodsNeedingSubstitute: 0 }),
            getLeavesPaginated: () => opts.studentLeavesError ? throwError(() => new Error('leaves offline')) : of({ content: [] }),
          },
        },
        {
          provide: SchoolService, useValue: {
            getEntitlement: () => opts.entitlementError ? throwError(() => new Error('entitlement offline')) : of(opts.entitlement ?? null),
          },
        },
        {
          provide: TeacherCheckinService, useValue: {
            getTodaySummary: () => opts.staffAttendanceError ? throwError(() => new Error('attendance offline')) : of(staffAttendance),
          },
        },
        { provide: StaffAdoptionService, useValue: staffAdoptionService },
        { provide: LoggerService, useValue: jasmine.createSpyObj('LoggerService', ['error']) },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['error']) },
        { provide: TeacherLeaveService, useValue: teacherLeaveService },
        { provide: EventService, useValue: eventService },
      ],
    });
    fixture = TestBed.createComponent(AdminDashboardComponent);
    component = fixture.componentInstance;
  }

  // ─── Admin profile — reuses the session's /auth/me name, no separate admin-profile fetch ───

  it('renders the greeting name from the session user without a duplicate admin-profile request, for ADMIN', () => {
    configure('ADMIN');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Test');
    expect(adminService.getAdminById).not.toHaveBeenCalled();
  });

  it('renders the greeting name from the session user without a duplicate admin-profile request, for SUB_ADMIN', () => {
    configure('SUB_ADMIN');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Test');
    expect(adminService.getAdminById).not.toHaveBeenCalled();
  });

  it('renders Staff Attendance Today before Staff Adoption', () => {
    configure('ADMIN');
    fixture.detectChanges();
    const text: string = fixture.nativeElement.textContent;
    const staffAttendanceIdx = text.indexOf('Staff Attendance Today');
    expect(staffAttendanceIdx).toBeGreaterThan(-1);
    expect(staffAttendanceIdx).toBeLessThan(text.lastIndexOf('Staff Adoption'));
  });

  it('renders Pending Leave Requests before Staff Adoption', () => {
    configure('ADMIN');
    fixture.detectChanges();
    const text: string = fixture.nativeElement.textContent;
    const pendingIdx = text.indexOf('Pending Leave Requests');
    expect(pendingIdx).toBeGreaterThan(-1);
    expect(pendingIdx).toBeLessThan(text.lastIndexOf('Staff Adoption'));
  });

  it('computes Not Yet Checked In as totalTeachers minus the five accounted-for buckets', () => {
    configure('ADMIN', {
      stats: { totalStudents: 0, totalTeachers: 10, feesCollectedThisMonth: 0, overdueStudents: 0, todayAttendanceRate: 0, pendingLeaves: 0 },
      staffAttendance: { date: '2026-09-22', presentCount: 4, lateCount: 1, absentCount: 0, halfDayCount: 0, onLeaveCount: 1 },
    });
    fixture.detectChanges();
    expect(component.notYetCheckedIn).toBe(4); // 10 - (4+1+0+0+1)
    expect(fixture.nativeElement.textContent).toContain('Not Yet Checked In');
  });

  it('clamps Not Yet Checked In to zero rather than going negative', () => {
    configure('ADMIN', {
      stats: { totalStudents: 0, totalTeachers: 5, feesCollectedThisMonth: 0, overdueStudents: 0, todayAttendanceRate: 0, pendingLeaves: 0 },
      staffAttendance: { date: '2026-09-22', presentCount: 4, lateCount: 1, absentCount: 1, halfDayCount: 0, onLeaveCount: 1 },
    });
    fixture.detectChanges();
    expect(component.notYetCheckedIn).toBe(0);
  });

  it('never labels the not-yet-checked-in metric as "Absent"', () => {
    configure('ADMIN');
    fixture.detectChanges();
    const pill = Array.from(fixture.nativeElement.querySelectorAll('.ad-staff-att-pill'))
      .find((el: any) => el.textContent.includes('Not Yet Checked In')) as HTMLElement;
    expect(pill).toBeTruthy();
    expect(pill.textContent).not.toContain('Absent');
  });

  it('renders the compact daily quick actions with the correct existing routes', () => {
    configure('ADMIN');
    fixture.detectChanges();
    const routes = ['/dashboard/staff-attendance', '/dashboard/view-leaves', '/dashboard/notice'];
    for (const route of routes) {
      const link = fixture.nativeElement.querySelector(`.ad-daily-actions-grid a[routerLink="${route}"]`);
      expect(link).withContext(route).toBeTruthy();
    }
    expect(fixture.nativeElement.querySelector('.ad-daily-actions-grid a[routerLink="/dashboard/staff-adoption"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('.ad-adoption a[routerLink="/dashboard/staff-adoption"]')).toBeTruthy();
  });

  it('hides all ADMIN-only daily actions for SUB_ADMIN', () => {
    configure('SUB_ADMIN');
    fixture.detectChanges();
    expect(staffAdoptionService.getStaffAdoption).not.toHaveBeenCalled();
    const link = fixture.nativeElement.querySelector('.ad-daily-actions-grid a[routerLink="/dashboard/staff-adoption"]');
    expect(link).toBeNull();
    expect(fixture.nativeElement.querySelector('.ad-daily-actions-grid')).toBeNull();
    expect(fixture.nativeElement.querySelector('a[routerLink="/dashboard/view-leaves"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('a[routerLink="/dashboard/notice"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('a[routerLink="/dashboard/staff-attendance"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('a[routerLink="/dashboard/class-management"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('a[routerLink="/dashboard/timetable"]')).toBeTruthy();
    expect(fixture.nativeElement.textContent).not.toContain('Staff Attendance Today');
    expect(fixture.nativeElement.textContent).not.toContain('Pending Leave Requests');
  });

  it('keeps Leave Approval, Send Notice and Events in the full Quick Actions grid', () => {
    configure('ADMIN');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.ad-actions-grid')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('Quick Actions');
    for (const route of ['/dashboard/view-leaves', '/dashboard/notice', '/dashboard/event-calendar']) {
      expect(fixture.nativeElement.querySelector(`.ad-actions-grid a[routerLink="${route}"]`)).withContext(route).toBeTruthy();
    }
    expect(fixture.nativeElement.querySelector('.ad-daily-actions-grid a[routerLink="/dashboard/view-leaves"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.ad-daily-actions-grid a[routerLink="/dashboard/notice"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.ad-view-all[routerLink="/dashboard/event-calendar"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.ad-actions-grid a[routerLink="/dashboard/attendance-summary"]')).toBeTruthy();
  });

  it('renders the repositioned Staff Adoption card for an ADMIN, with its existing CTA route', () => {
    configure('ADMIN');
    fixture.detectChanges();
    expect(staffAdoptionService.getStaffAdoption).toHaveBeenCalled();
    const link: HTMLAnchorElement | null = fixture.nativeElement.querySelector('.ad-adoption a[routerLink="/dashboard/staff-adoption"]');
    expect(link).not.toBeNull();
  });

  it('keeps the existing dashboard sections intact (stat cards, pending-leave empty state)', () => {
    configure('ADMIN');
    fixture.detectChanges();
    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('Total Students');
    expect(text).toContain('Total Teachers');
    expect(text).toContain('No pending leave requests');
  });

  // ─── Teacher pending leave — reuses the existing ADMIN-only status-filtered endpoint ───

  it('renders the student pending-leave count unchanged, from existing dashboard stats', () => {
    configure('ADMIN', { stats: { totalStudents: 0, totalTeachers: 10, feesCollectedThisMonth: 0, overdueStudents: 0, todayAttendanceRate: 0, pendingLeaves: 3 } });
    fixture.detectChanges();
    const studentPill = fixture.nativeElement.querySelector('.ad-leave-type-pill');
    expect(studentPill.textContent).toContain('Student');
    expect(studentPill.textContent).toContain('3');
  });

  it('renders the teacher pending-leave count separately, via getLeaves(0,1,"PENDING")', () => {
    configure('ADMIN', { teacherLeavesTotal: 2 });
    fixture.detectChanges();
    expect(teacherLeaveService.getLeaves).toHaveBeenCalledWith(0, 1, 'PENDING');
    const pills = fixture.nativeElement.querySelectorAll('.ad-leave-type-pill');
    const teacherPill = Array.from(pills).find((r: any) => r.textContent.includes('Teacher')) as HTMLElement;
    expect(teacherPill.textContent).toContain('2');
  });

  it('shows a zero teacher-pending state distinctly', () => {
    configure('ADMIN', { teacherLeavesTotal: 0 });
    fixture.detectChanges();
    const pills = fixture.nativeElement.querySelectorAll('.ad-leave-type-pill');
    const teacherPill = Array.from(pills).find((r: any) => r.textContent.includes('Teacher')) as HTMLElement;
    expect(teacherPill.querySelector('.ad-leave-type-value')?.textContent?.trim()).toBe('0');
  });

  it('does not fire the ADMIN-only teacher-leave count request for SUB_ADMIN', () => {
    configure('SUB_ADMIN');
    fixture.detectChanges();
    expect(teacherLeaveService.getLeaves).not.toHaveBeenCalled();
    const pills = fixture.nativeElement.querySelectorAll('.ad-leave-type-pill');
    expect(Array.from(pills).some((r: any) => r.textContent.includes('Teacher'))).toBeFalse();
  });

  it('links Review Student Leave and Review Teacher Leave to the correct existing routes', () => {
    configure('ADMIN');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.ad-leave-type-pill a[routerLink="/dashboard/view-leaves"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.ad-leave-type-pill a[routerLink="/dashboard/teacher-leave-requests"]')).toBeTruthy();
  });

  it('isolates a teacher-leave-count failure — the rest of the dashboard still loads', () => {
    configure('ADMIN');
    teacherLeaveService.getLeaves.and.returnValue(throwError(() => new Error('offline')));
    fixture.detectChanges();
    expect(component.teacherPendingLeaveFailed).toBeTrue();
    expect(component.isLoading).toBeFalse();
    expect(fixture.nativeElement.textContent).toContain('Total Teachers');
  });

  // ─── Upcoming event — bounded to at most 2 requests, isolated failure ───

  const event = (overrides: any = {}) => ({
    id: 1, title: 'Event', description: '', startDate: '2026-09-22', category: 'GENERAL', targetAudience: [], ...overrides,
  });

  it('renders the nearest upcoming event for the current month', () => {
    configure('ADMIN', { events: [event({ title: 'Sooner', startDate: '2026-09-24' }), event({ id: 2, title: 'Later', startDate: '2026-09-28' })] });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Sooner');
    expect(eventService.getEventsForMonthAndYear).toHaveBeenCalledTimes(1);
  });

  it('falls back to next month when the current month has no upcoming event', () => {
    configure('ADMIN', { events: [event({ title: 'Past', startDate: '2026-09-01' })] });
    fixture.detectChanges();
    expect(eventService.getEventsForMonthAndYear).toHaveBeenCalledTimes(2);
  });

  it('shows a no-event state and Staff Adoption still remains below daily content', () => {
    configure('ADMIN', { events: [] });
    fixture.detectChanges();
    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('No upcoming events this month.');
    expect(text.indexOf('Upcoming Event')).toBeLessThan(text.lastIndexOf('Staff Adoption'));
  });

  it('isolates an event-load failure — other sections stay intact', () => {
    configure('ADMIN');
    eventService.getEventsForMonthAndYear.and.returnValue(throwError(() => new Error('offline')));
    fixture.detectChanges();
    expect(component.upcomingEventFailed).toBeTrue();
    expect(component.isLoading).toBeFalse();
    expect(fixture.nativeElement.textContent).toContain('Total Teachers');
  });

  // ─── Failure isolation — one failed source must never blank an unrelated section ───

  it('stats failure does not hide Staff Attendance Today', () => {
    configure('ADMIN', { statsError: true });
    fixture.detectChanges();
    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('Staff Attendance Today');
    expect(text).toContain('Present');
    expect(text).toContain('Could not load dashboard stats');
  });

  it('stats failure does not hide Quick Actions', () => {
    configure('ADMIN', { statsError: true });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.ad-actions-grid')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('Quick Actions');
  });

  it('stats failure never fabricates a "0 Students pending" count — shows Unavailable instead', () => {
    configure('ADMIN', { statsError: true });
    fixture.detectChanges();
    const studentPill = fixture.nativeElement.querySelector('.ad-leave-type-pill');
    expect(studentPill.textContent).toContain('Unavailable');
    expect(studentPill.querySelector('.ad-leave-type-value').textContent.trim()).toBe('—');
  });

  it('staff attendance failure does not hide the stat cards, and shows an isolated fallback with Retry', () => {
    configure('ADMIN', { staffAttendanceError: true });
    fixture.detectChanges();
    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('Total Students');
    expect(text).toContain('Total Teachers');
    expect(text).toContain('Staff attendance is temporarily unavailable');
    expect(fixture.nativeElement.querySelector('.ad-staff-att-grid')).toBeNull();
  });

  it('staff attendance failure does not compute "Not Yet Checked In" from missing data', () => {
    configure('ADMIN', { staffAttendanceError: true });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Not Yet Checked In');
  });

  it('student leave failure does not hide the teacher pending-leave pill', () => {
    configure('ADMIN', { studentLeavesError: true, teacherLeavesTotal: 3 });
    fixture.detectChanges();
    const pills = fixture.nativeElement.querySelectorAll('.ad-leave-type-pill');
    const teacherPill = Array.from(pills).find((r: any) => r.textContent.includes('Teacher')) as HTMLElement;
    expect(teacherPill.textContent).toContain('3');
  });

  it('student leave failure shows an isolated fallback with Retry, never the false "No pending leave requests" empty state', () => {
    configure('ADMIN', { studentLeavesError: true });
    fixture.detectChanges();
    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('Unable to load leave requests right now');
    expect(text).not.toContain('No pending leave requests');
  });

  it('entitlement failure affects only Plan Usage — daily operations remain intact', () => {
    configure('ADMIN', { entitlementError: true });
    fixture.detectChanges();
    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('Plan usage is temporarily unavailable');
    expect(fixture.nativeElement.querySelector('.ad-plan-section')).toBeNull();
    expect(text).toContain('Staff Attendance Today');
    expect(text).toContain('Pending Leave Requests');
    expect(text).toContain('Quick Actions');
  });

  it('entitlement success still renders Plan Usage exactly as before', () => {
    configure('ADMIN', { entitlement: { planName: 'Growth Plan', subscriptionStatus: 'ACTIVE', featureCount: 5, activeStudents: 10, maxStudents: 100, totalStaff: 4, maxStaff: 20 } });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.ad-plan-section')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('Growth Plan');
  });

  it('Staff Adoption failure remains isolated from the rest of the dashboard', () => {
    configure('ADMIN', { staffAdoptionError: true });
    fixture.detectChanges();
    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('Staff adoption is temporarily unavailable');
    expect(text).toContain('Staff Attendance Today');
    expect(text).toContain('Pending Leave Requests');
  });

  it('a fully successful ADMIN dashboard renders exactly as before (no visible change on the happy path)', () => {
    configure('ADMIN');
    fixture.detectChanges();
    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('Total Students');
    expect(text).toContain('Staff Attendance Today');
    expect(text).toContain('Pending Leave Requests');
    expect(text).toContain('Quick Actions');
    expect(text).not.toContain('temporarily unavailable');
    expect(text).not.toContain('Could not load dashboard stats');
  });

  it('a fully successful SUB_ADMIN dashboard renders exactly as before (contract unchanged)', () => {
    configure('SUB_ADMIN');
    fixture.detectChanges();
    const text: string = fixture.nativeElement.textContent;
    expect(text).not.toContain('Staff Attendance Today');
    expect(text).not.toContain('Pending Leave Requests');
    expect(text).not.toContain('temporarily unavailable');
    expect(fixture.nativeElement.querySelector('a[routerLink="/dashboard/class-management"]')).toBeTruthy();
  });

  it('Retry on Staff Attendance re-requests only that source, not stats/leaves/entitlement', () => {
    const getStats = jasmine.createSpy('getStats').and.returnValue(of({ totalStudents: 0, totalTeachers: 10, feesCollectedThisMonth: 0, overdueStudents: 0, todayAttendanceRate: 0, pendingLeaves: 0 }));
    const getLeavesPaginated = jasmine.createSpy('getLeavesPaginated').and.returnValue(of({ content: [] }));
    const getEntitlement = jasmine.createSpy('getEntitlement').and.returnValue(of(null));
    let attendanceCallCount = 0;
    const getTodaySummary = jasmine.createSpy('getTodaySummary').and.callFake(() => {
      attendanceCallCount++;
      return attendanceCallCount === 1
        ? throwError(() => new Error('attendance offline'))
        : of({ date: '2026-09-22', presentCount: 4, lateCount: 1, absentCount: 0, halfDayCount: 0, onLeaveCount: 1 });
    });
    const authState = jasmine.createSpyObj('AuthStateService', ['getUser', 'hasFeature']);
    authState.getUser.and.returnValue({ userId: 'U1', role: 'ADMIN', name: 'Test', className: '' } as any);
    authState.hasFeature.and.returnValue(false);

    TestBed.configureTestingModule({
      imports: [AdminDashboardComponent],
      providers: [
        provideRouter([]),
        { provide: AuthStateService, useValue: authState },
        { provide: TeacherSubstitutionService, useValue: { getUncovered: () => of([]) } },
        { provide: AdminService, useValue: { getAdminById: () => of({ name: 'Test Admin' }) } },
        { provide: DashboardAnalyticsService, useValue: { getStats } },
        { provide: LeaveService, useValue: { getLeavesPaginated, getOnLeaveToday: () => of({ date: '2026-10-05', students: [], staff: [], periodsNeedingSubstitute: 0 }) } },
        { provide: SchoolService, useValue: { getEntitlement } },
        { provide: TeacherCheckinService, useValue: { getTodaySummary } },
        { provide: StaffAdoptionService, useValue: jasmine.createSpyObj('StaffAdoptionService', { getStaffAdoption: of({ summary: { totalTeachers: 1, startedTeachers: 1, notStartedTeachers: 0, attendanceUsedTeachers: 1, disabledTeachers: 0 }, teachers: [] }) }) },
        { provide: LoggerService, useValue: jasmine.createSpyObj('LoggerService', ['error']) },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['error']) },
        { provide: TeacherLeaveService, useValue: { getLeaves: () => of({ content: [], totalElements: 0, totalPages: 0 }) } },
        { provide: EventService, useValue: { getEventsForMonthAndYear: () => of([]) } },
      ],
    });
    fixture = TestBed.createComponent(AdminDashboardComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Staff attendance is temporarily unavailable');
    expect(getStats).toHaveBeenCalledTimes(1);
    expect(getLeavesPaginated).toHaveBeenCalledTimes(1);
    expect(getEntitlement).toHaveBeenCalledTimes(1);

    const retryButton: HTMLButtonElement = Array.from(fixture.nativeElement.querySelectorAll('button'))
      .find((b: any) => b.textContent.includes('Retry')) as HTMLButtonElement;
    retryButton.click();
    fixture.detectChanges();

    expect(getTodaySummary).toHaveBeenCalledTimes(2);
    expect(getStats).toHaveBeenCalledTimes(1);
    expect(getLeavesPaginated).toHaveBeenCalledTimes(1);
    expect(getEntitlement).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.textContent).toContain('Staff Attendance Today');
    expect(fixture.nativeElement.querySelector('.ad-staff-att-grid')).toBeTruthy();
  });
});
