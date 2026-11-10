import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { StaffAttendanceComponent } from './staff-attendance.component';
import { AuthStateService } from '../../auth/auth-state.service';
import { TeacherCheckinService } from '../../services/teacher-checkin.service';
import { TeacherService } from '../../services/teacher.service';
import { TenantService } from '../../services/tenant.service';
import { LoggerService } from '../../services/logger.service';
import { ToastService } from '../../services/toast.service';
import { AcademicSessionService } from '../../services/academic-session.service';
import { TeacherAttendanceRecord } from '../../interfaces/teacher-checkin';

/** Shared by the web and Android clients — keep the two copies identical. The Principal reuses the
 * Admin Staff Attendance screen: every correction needs a reason, the history is shown, and the
 * Principal's own teacher record stays read-only. Admin behaviour is unchanged. */
describe('StaffAttendanceComponent — Principal corrections', () => {
  let fixture: ComponentFixture<StaffAttendanceComponent>;
  let c: StaffAttendanceComponent;
  let checkin: jasmine.SpyObj<TeacherCheckinService>;
  let toast: jasmine.SpyObj<ToastService>;
  let role: string;

  const record = (teacherId: string, status = 'LATE'): TeacherAttendanceRecord => ({
    id: teacherId === 'T-SELF' ? 2 : 1, teacherId, teacherName: teacherId === 'T-SELF' ? 'Laxmi Sharma' : 'Ravi Kumar',
    date: '2026-11-06', checkInTime: '2026-11-06T09:20:00', checkOutTime: null, status, method: 'GPS',
    markedByAdmin: false, workDurationMinutes: null,
  } as unknown as TeacherAttendanceRecord);

  async function build(asRole: string): Promise<void> {
    role = asRole;
    checkin = jasmine.createSpyObj('TeacherCheckinService', ['getByDate', 'getSummary', 'getTeacherSessionSummary', 'getSchoolTiming',
      'getMarkableTeachers', 'adminMark', 'principalCorrect', 'getCorrectionHistory', 'getOwnTeacherIds']);
    checkin.getByDate.and.returnValue(of([record('T1'), record('T-SELF', 'ON_TIME')]));
    checkin.getSchoolTiming.and.returnValue(of({} as any));
    checkin.getMarkableTeachers.and.returnValue(of([]));
    checkin.getOwnTeacherIds.and.returnValue(of({ teacherIds: ['T-SELF'] }));
    checkin.getCorrectionHistory.and.returnValue(of([{ id: 7, teacherId: 'T1', date: '2026-11-06', previousStatus: 'ABSENT', previousCheckIn: null,
      previousCheckOut: null, previousMethod: null, newStatus: 'LATE', newCheckIn: '2026-11-06T09:20:00', newCheckOut: null,
      reason: 'Arrived after assembly', correctedBy: 'pri_1', correctedByRole: 'PRINCIPAL', correctedAt: '2026-11-06T10:00:00Z' }]));
    checkin.principalCorrect.and.returnValue(of(record('T1', 'ON_TIME')));
    checkin.adminMark.and.returnValue(of(record('T1', 'ON_TIME')));
    toast = jasmine.createSpyObj('ToastService', ['success', 'error', 'warning', 'info', 'confirm']);
    toast.confirm.and.resolveTo(true);
    const teachers = jasmine.createSpyObj('TeacherService', ['getAllTeachers']);
    teachers.getAllTeachers.and.returnValue(of([]));
    const sessions = jasmine.createSpyObj('AcademicSessionService', ['getAllSessions']);
    sessions.getAllSessions.and.returnValue(of([]));
    await TestBed.configureTestingModule({
      imports: [StaffAttendanceComponent],
      providers: [
        { provide: AuthStateService, useValue: { getUserRole: () => role } },
        { provide: TeacherCheckinService, useValue: checkin },
        { provide: TeacherService, useValue: teachers },
        { provide: TenantService, useValue: jasmine.createSpyObj('TenantService', ['getLogoUrl']) },
        { provide: LoggerService, useValue: jasmine.createSpyObj('LoggerService', ['error', 'warn', 'info']) },
        { provide: ToastService, useValue: toast },
        { provide: AcademicSessionService, useValue: sessions },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(StaffAttendanceComponent);
    c = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('corrects another teacher with a mandatory reason through the Principal API and shows the history', async () => {
    await build('PRINCIPAL');
    c.openEditDialog(record('T1'));
    expect(checkin.getCorrectionHistory).toHaveBeenCalledWith('T1', '2026-11-06');
    fixture.detectChanges();
    const dialog = (fixture.nativeElement as HTMLElement).querySelector('.sa-dialog')!;
    expect(dialog.textContent).toContain('Correct Attendance');
    expect(dialog.textContent).toContain('Reason for correction');
    expect(dialog.textContent).toContain('Arrived after assembly');
    expect(dialog.textContent).toContain('Absent → Late');

    c.markForm.status = 'ON_TIME';
    c.markForm.checkInTime = '08:55';
    await c.submitAdminMark();
    expect(toast.warning).toHaveBeenCalledWith('Reason required', jasmine.any(String));
    expect(checkin.principalCorrect).not.toHaveBeenCalled();

    c.correctionReason = '  Signed register shows 08:55 ';
    await c.submitAdminMark();
    expect(checkin.principalCorrect).toHaveBeenCalledOnceWith(jasmine.objectContaining({
      teacherId: 'T1', date: '2026-11-06', status: 'ON_TIME', checkInTime: '08:55', reason: 'Signed register shows 08:55',
    }));
    expect(checkin.adminMark).not.toHaveBeenCalled();
  });

  it("keeps the Principal's own teacher record read-only", async () => {
    await build('PRINCIPAL');
    const own = record('T-SELF', 'ON_TIME');
    expect(c.canCorrect(own)).toBeFalse();
    expect(c.isOwnRecord(own)).toBeTrue();
    c.openEditDialog(own);
    expect(c.showMarkDialog).toBeFalse();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Your record · read-only');

    // Even a hand-built form for the own record is refused before any request.
    c.isEditMode = true;
    c.markForm = { teacherId: 'T-SELF', date: '2026-11-06', status: 'ABSENT', checkInTime: '', checkOutTime: '' };
    c.correctionReason = 'reason';
    await c.submitAdminMark();
    expect(checkin.principalCorrect).not.toHaveBeenCalled();
  });

  it('leaves Admin marking unchanged: no reason field, no history, the admin API', async () => {
    await build('ADMIN');
    expect(checkin.getOwnTeacherIds).not.toHaveBeenCalled();
    expect(c.canCorrect(record('T-SELF'))).toBeTrue();
    c.openEditDialog(record('T1'));
    expect(checkin.getCorrectionHistory).not.toHaveBeenCalled();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.sa-dialog')!.textContent).not.toContain('Reason for correction');
    c.markForm.checkInTime = '08:55';
    c.markForm.status = 'ON_TIME';
    await c.submitAdminMark();
    expect(checkin.adminMark).toHaveBeenCalled();
    expect(checkin.principalCorrect).not.toHaveBeenCalled();
  });

  it('routes the Principal through the server-owned TEACHER_ATTENDANCE_CORRECT capability; Admin keeps access', async () => {
    const { routes } = await import('../../app.routes');
    const { roleGuard } = await import('../../auth/role.guard');
    const { principalCapabilityGuard } = await import('../../auth/principal-capability.guard');
    const route = routes.find(r => r.path === 'dashboard')!.children!.find(r => r.path === 'staff-attendance')!;
    expect(route.data?.['roles']).toEqual(['ADMIN', 'PRINCIPAL']);
    expect(route.data?.['principalOperation']).toBe('TEACHER_ATTENDANCE_CORRECT');
    expect(route.canActivate!.indexOf(roleGuard)).toBeLessThan(route.canActivate!.indexOf(principalCapabilityGuard));
  });
});
