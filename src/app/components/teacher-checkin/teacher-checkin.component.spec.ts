import { of, throwError } from 'rxjs';
import { TeacherCheckinComponent } from './teacher-checkin.component';
import { TeacherAttendanceSummary } from '../../interfaces/teacher-checkin';

describe('TeacherCheckinComponent', () => {
  const emptySummary: TeacherAttendanceSummary = {
    totalWorkingDays: 0, presentDays: 0, lateDays: 0, absentDays: 0,
    halfDayDays: 0, onLeaveDays: 0, onTimePercentage: 0,
    attendancePercentage: 0, trackingStartDate: null, records: [],
  };
  let checkinService: any;
  let toast: any;
  let component: TeacherCheckinComponent;

  beforeEach(() => {
    checkinService = jasmine.createSpyObj('TeacherCheckinService', ['getMyAttendance', 'checkIn', 'checkOut']);
    toast = jasmine.createSpyObj('ToastService', ['success', 'warning', 'error', 'info']);
    const auth = jasmine.createSpyObj('AuthStateService', ['getUser']);
    auth.getUser.and.returnValue({ name: 'Teacher' });
    const logger = jasmine.createSpyObj('LoggerService', ['log', 'error']);
    const cdr = jasmine.createSpyObj('ChangeDetectorRef', ['markForCheck']);
    component = new TeacherCheckinComponent(checkinService, auth, logger, toast, cdr);
  });

  it('does not allow check-in until today state resolves', async () => {
    component.todayStateResolved = false;
    await component.checkIn();
    expect(checkinService.checkIn).not.toHaveBeenCalled();
  });

  it('shows a visible retry state when today attendance fails to load', () => {
    checkinService.getMyAttendance.and.returnValue(throwError(() => ({ error: { message: 'Attendance is temporarily unavailable.' } })));
    component.loadMonthlyData();
    expect(component.todayStateResolved).toBeFalse();
    expect(component.attendanceLoadError).toBe('Attendance is temporarily unavailable.');
  });

  it('resolves today state after attendance loads successfully', () => {
    checkinService.getMyAttendance.and.returnValue(of(emptySummary));
    component.loadMonthlyData();
    expect(component.todayStateResolved).toBeTrue();
    expect(component.attendanceLoadError).toBeNull();
  });

  it('refreshes current attendance after an already-checked-in race', async () => {
    component.todayStateResolved = true;
    spyOn<any>(component, 'getPosition').and.resolveTo({ latitude: 1, longitude: 2 });
    checkinService.checkIn.and.returnValue(throwError(() => ({
      status: 409,
      error: { message: 'You have already checked in today.' },
    })));
    checkinService.getMyAttendance.and.returnValue(of(emptySummary));

    await component.checkIn();
    await Promise.resolve();

    expect(toast.info).toHaveBeenCalled();
    expect(checkinService.getMyAttendance).toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('uses browser-specific permission guidance on web', () => {
    const message = (component as any).getGpsErrorMessage({ code: 1 });
    expect(message).toContain("browser's site permissions");
    expect(message).not.toContain('Settings > Apps');
  });

  it('preserves successful check-in behavior', async () => {
    // After check-in the component reloads the month and keeps the record dated "today", so the
    // clock must be on the record's date (2026-09-17) for this to hold on any run day.
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date(2026, 8, 17, 8, 5, 0));
    const record = {
      id: 1, teacherId: 'T1', teacherName: 'Teacher', schoolId: 1,
      date: '2026-09-17', checkInTime: '08:05:00', checkOutTime: null,
      status: 'ON_TIME', latitude: 1, longitude: 2, distanceFromSchool: 10,
      method: 'GPS', markedByAdmin: false,
    };
    component.todayStateResolved = true;
    spyOn<any>(component, 'getPosition').and.resolveTo({ latitude: 1, longitude: 2 });
    checkinService.checkIn.and.returnValue(of(record));
    checkinService.getMyAttendance.and.returnValue(of({ ...emptySummary, records: [record] }));

    await component.checkIn();
    await Promise.resolve();

    expect(toast.success).toHaveBeenCalledWith('Checked In', 'You are on time! Have a great day.');
    expect(component.todayRecord).toEqual(record);
  });

  afterEach(() => {
    try { jasmine.clock().uninstall(); } catch { /* only the check-in spec installs the clock */ }
  });
});
