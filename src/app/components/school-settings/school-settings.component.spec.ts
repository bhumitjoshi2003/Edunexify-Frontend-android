import { of, throwError } from 'rxjs';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { SchoolSettingsComponent } from './school-settings.component';
import { SchoolService, SchoolSettings } from '../../services/school.service';
import { AuthStateService } from '../../auth/auth-state.service';
import { TenantService } from '../../services/tenant.service';
import { LoggerService } from '../../services/logger.service';
import { ToastService } from '../../services/toast.service';
import { AcademicSessionService } from '../../services/academic-session.service';
import { FeeWorkflowService } from '../../services/fee-workflow.service';
import { AcademicSession } from '../../interfaces/academic-session';
import { ActivationPreview, SessionActivationOutcome } from '../../interfaces/session-activation';

const current: AcademicSession = { id: 1, label: '2026-2027', startDate: '2026-04-01', endDate: '2027-03-31', current: true };
const target: AcademicSession = { id: 2, label: '2027-2028', startDate: '2027-04-01', endDate: '2028-03-31', current: false };
const basePreview: ActivationPreview = {
  academicSessionId: 2, activationState: 'NEVER_APPLIED', lastAppliedAt: null, lastAppliedBy: null,
  inSync: true, hasIssues: false, unchanged: 0, ineligibleTeacher: 0, invalidClassOrSection: 0,
  configuredCount: 3, becomingLive: 3, changing: 0, clearing: 0, details: [],
};

describe('G2 Make Current activation parity', () => {
  let c: SchoolSettingsComponent;
  let academicSessionService: any;
  let toast: any;
  let logger: any;

  beforeEach(() => {
    academicSessionService = {
      getActivationPreview: jasmine.createSpy().and.returnValue(of(basePreview)),
      setCurrentSession: jasmine.createSpy().and.returnValue(of({ session: target, activationPerformed: true, activation: { applied: 3, cleared: 0 } } as SessionActivationOutcome)),
      getAllSessions: jasmine.createSpy().and.returnValue(of([current, target])),
    };
    toast = { confirm: jasmine.createSpy().and.resolveTo(true), success: jasmine.createSpy(), error: jasmine.createSpy() };
    logger = { error: jasmine.createSpy() };
    c = new SchoolSettingsComponent(
      {} as any, {} as any, {} as any, { markForCheck: () => {} } as any, logger, toast,
      { snapshot: { queryParamMap: { get: () => null } } } as any, academicSessionService, {} as any
    );
    c.sessions = [current, target];
  });

  it('fetches the activation preview before any mutation, and it is read-only', async () => {
    academicSessionService.setCurrentSession.and.stub();
    toast.confirm.and.callFake(() => new Promise<boolean>(() => { /* never resolves — simulates dialog left open */ }));
    void c.setCurrentSession(target);
    await Promise.resolve(); await Promise.resolve();
    expect(academicSessionService.getActivationPreview).toHaveBeenCalledWith(2);
    expect(academicSessionService.setCurrentSession).not.toHaveBeenCalled();
  });

  it('shows the activation impact counts in the confirmation before calling set-current', async () => {
    await c.setCurrentSession(target);
    const html = toast.confirm.calls.mostRecent().args[0].html;
    expect(html).toContain('Becoming live 3');
    expect(html).toContain('Unchanged 0');
    expect(academicSessionService.setCurrentSession).toHaveBeenCalledWith(2);
  });

  it('warns when the target has zero usable configuration and would clear live assignments', async () => {
    academicSessionService.getActivationPreview.and.returnValue(of({ ...basePreview, configuredCount: 0, becomingLive: 0, clearing: 4 }));
    await c.setCurrentSession(target);
    const args = toast.confirm.calls.mostRecent().args[0];
    expect(args.danger).toBeTrue();
    expect(args.icon).toBe('warning');
    expect(args.html).toContain('no usable class-teacher');
    expect(args.html).toContain('(4)');
  });

  it('does not warn when zero-configured but nothing would be cleared', async () => {
    academicSessionService.getActivationPreview.and.returnValue(of({ ...basePreview, configuredCount: 0, becomingLive: 0, clearing: 0 }));
    await c.setCurrentSession(target);
    const args = toast.confirm.calls.mostRecent().args[0];
    expect(args.danger).toBeFalsy();
    expect(args.icon).toBe('question');
  });

  it('performs no set-current call when the admin cancels the confirmation', async () => {
    toast.confirm.and.resolveTo(false);
    await c.setCurrentSession(target);
    expect(academicSessionService.setCurrentSession).not.toHaveBeenCalled();
  });

  it('calls set-current exactly once when confirmed', async () => {
    await c.setCurrentSession(target);
    expect(academicSessionService.setCurrentSession).toHaveBeenCalledTimes(1);
  });

  it('surfaces the applied/cleared counts from a real activation outcome', async () => {
    await c.setCurrentSession(target);
    expect(toast.success).toHaveBeenCalledWith('Updated', jasmine.stringMatching(/3 granted, 0 cleared/));
  });

  it('reports a genuine no-op distinctly when the target was already current', async () => {
    academicSessionService.setCurrentSession.and.returnValue(of({ session: current, activationPerformed: false, activation: null } as SessionActivationOutcome));
    await c.setCurrentSession(current);
    expect(toast.success).toHaveBeenCalledWith('Updated', jasmine.stringMatching(/already the current session/));
  });

  it('fails closed with no confirmation dialog when the preview fetch errors', async () => {
    academicSessionService.getActivationPreview.and.returnValue(throwError(() => new Error('network')));
    await c.setCurrentSession(target);
    expect(toast.confirm).not.toHaveBeenCalled();
    expect(academicSessionService.setCurrentSession).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });
});

describe('Teacher attendance reminder settings', () => {
  let c: SchoolSettingsComponent;
  let schoolService: any;
  let toast: any;
  let logger: any;

  const baseSettings = (): SchoolSettings => ({
    id: 1, name: 'Test School', slug: 'test-school',
    address: null, city: null, state: null, pincode: null, phone: null, email: null,
    website: null, logoUrl: null, themeColor: null, contactPersonName: null, boardType: null,
    plan: null, maxStudents: null, expiryDate: null, active: true, razorpayConfigured: false,
    academicYearStartMonth: 4, workingDays: 'MONDAY,TUESDAY,WEDNESDAY,THURSDAY,FRIDAY,SATURDAY',
    periodsPerDay: 8, gradingSystem: 'CBSE',
    schoolLatitude: 28.6, schoolLongitude: 77.2, geofenceRadius: 200,
    schoolStartTime: '08:00', lateThresholdMinutes: 5,
    checkinWindowStart: '07:30', checkinWindowEnd: '08:30',
    staffAttendanceTrackingStartDate: '2026-01-01',
    timezone: 'Asia/Kolkata',
    teacherAttendanceReminderEnabled: false,
    teacherAttendanceReminderTime: null,
  });

  beforeEach(() => {
    schoolService = { updateSettings: jasmine.createSpy().and.returnValue(of(baseSettings())) };
    toast = { warning: jasmine.createSpy(), success: jasmine.createSpy(), error: jasmine.createSpy() };
    logger = { error: jasmine.createSpy() };
    c = new SchoolSettingsComponent(
      schoolService, {} as any, {} as any, { markForCheck: () => {} } as any, logger, toast,
      { snapshot: { queryParamMap: { get: () => null } } } as any, {} as any, {} as any
    );
  });

  it('hydrates the reminder toggle and time from existing settings when starting an edit', () => {
    c.settings = { ...baseSettings(), teacherAttendanceReminderEnabled: true, teacherAttendanceReminderTime: '07:45' };
    c.startStaffAttendanceEdit();
    expect(c.staffAttendanceForm.teacherAttendanceReminderEnabled).toBeTrue();
    expect(c.staffAttendanceForm.teacherAttendanceReminderTime).toBe('07:45');
  });

  it('defaults the reminder to disabled with no time when never configured', () => {
    c.settings = baseSettings(); // enabled: false, time: null
    c.startStaffAttendanceEdit();
    expect(c.staffAttendanceForm.teacherAttendanceReminderEnabled).toBeFalse();
    expect(c.staffAttendanceForm.teacherAttendanceReminderTime).toBe('');
  });

  it('blocks saving when the reminder is enabled without a time, matching backend validation', () => {
    c.settings = baseSettings();
    c.startStaffAttendanceEdit();
    c.staffAttendanceForm.teacherAttendanceReminderEnabled = true;
    c.staffAttendanceForm.teacherAttendanceReminderTime = '';

    c.saveStaffAttendanceSettings();

    expect(toast.warning).toHaveBeenCalledWith('Validation', jasmine.stringMatching(/[Rr]eminder time is required/));
    expect(schoolService.updateSettings).not.toHaveBeenCalled();
  });

  it('allows saving with the reminder disabled even without a time', () => {
    c.settings = baseSettings();
    c.startStaffAttendanceEdit();
    c.staffAttendanceForm.teacherAttendanceReminderEnabled = false;
    c.staffAttendanceForm.teacherAttendanceReminderTime = '';

    c.saveStaffAttendanceSettings();

    expect(schoolService.updateSettings).toHaveBeenCalled();
  });

  it('disabling without touching the time field resends the previously configured time unchanged', () => {
    c.settings = { ...baseSettings(), teacherAttendanceReminderEnabled: true, teacherAttendanceReminderTime: '07:45' };
    c.startStaffAttendanceEdit();
    c.staffAttendanceForm.teacherAttendanceReminderEnabled = false; // time field never touched

    c.saveStaffAttendanceSettings();

    const payload = schoolService.updateSettings.calls.mostRecent().args[0];
    expect(payload.teacherAttendanceReminderEnabled).toBeFalse();
    expect(payload.teacherAttendanceReminderTime).toBe('07:45');
  });

  it('sends the reminder fields to updateSettings and applies the returned settings', () => {
    const saved = { ...baseSettings(), teacherAttendanceReminderEnabled: true, teacherAttendanceReminderTime: '08:15' };
    schoolService.updateSettings.and.returnValue(of(saved));
    c.settings = baseSettings();
    c.startStaffAttendanceEdit();
    c.staffAttendanceForm.teacherAttendanceReminderEnabled = true;
    c.staffAttendanceForm.teacherAttendanceReminderTime = '08:15';

    c.saveStaffAttendanceSettings();

    expect(schoolService.updateSettings).toHaveBeenCalledWith(
      jasmine.objectContaining({ teacherAttendanceReminderEnabled: true, teacherAttendanceReminderTime: '08:15' })
    );
    expect(c.settings).toEqual(saved);
    expect(c.isEditingStaffAttendance).toBeFalse();
  });

  it('surfaces the school timezone alongside the reminder time for display', () => {
    c.settings = { ...baseSettings(), timezone: 'America/Los_Angeles' };
    expect(c.settings.timezone).toBe('America/Los_Angeles');
  });

  // ─── reminderTimeWarning — non-blocking guidance only ───────────────────────

  it('warns when the reminder time is before the check-in window opens', () => {
    c.settings = baseSettings();
    c.startStaffAttendanceEdit();
    c.staffAttendanceForm.teacherAttendanceReminderEnabled = true;
    c.staffAttendanceForm.checkinWindowStart = '07:30';
    c.staffAttendanceForm.teacherAttendanceReminderTime = '07:00';

    expect(c.reminderTimeWarning).toContain('before the check-in window opens');
  });

  it('warns when the reminder time is well after the check-in window closes', () => {
    c.settings = baseSettings();
    c.startStaffAttendanceEdit();
    c.staffAttendanceForm.teacherAttendanceReminderEnabled = true;
    c.staffAttendanceForm.checkinWindowEnd = '08:30';
    c.staffAttendanceForm.teacherAttendanceReminderTime = '14:00';

    expect(c.reminderTimeWarning).toContain('after the check-in window closes');
  });

  it('has no warning when the reminder time falls inside the check-in window', () => {
    c.settings = baseSettings();
    c.startStaffAttendanceEdit();
    c.staffAttendanceForm.teacherAttendanceReminderEnabled = true;
    c.staffAttendanceForm.checkinWindowStart = '07:30';
    c.staffAttendanceForm.checkinWindowEnd = '08:30';
    c.staffAttendanceForm.teacherAttendanceReminderTime = '08:00';

    expect(c.reminderTimeWarning).toBeNull();
  });

  it('has no warning while the reminder is disabled, regardless of any leftover time value', () => {
    c.settings = baseSettings();
    c.startStaffAttendanceEdit();
    c.staffAttendanceForm.teacherAttendanceReminderEnabled = false;
    c.staffAttendanceForm.teacherAttendanceReminderTime = '02:00';

    expect(c.reminderTimeWarning).toBeNull();
  });

  it('a reminder-time warning never blocks a valid save', () => {
    c.settings = baseSettings();
    c.startStaffAttendanceEdit();
    c.staffAttendanceForm.teacherAttendanceReminderEnabled = true;
    c.staffAttendanceForm.checkinWindowStart = '07:30';
    c.staffAttendanceForm.teacherAttendanceReminderTime = '05:00'; // triggers the warning

    expect(c.reminderTimeWarning).not.toBeNull();
    c.saveStaffAttendanceSettings();

    expect(toast.warning).not.toHaveBeenCalled();
    expect(schoolService.updateSettings).toHaveBeenCalled();
  });
});

describe('School Settings — Notification Channels UI removed', () => {
  let fixture: ComponentFixture<SchoolSettingsComponent>;
  let queryParam: string | null;

  const settings = (): SchoolSettings => ({
    id: 1, name: 'Test School', slug: 'test-school',
    address: null, city: null, state: null, pincode: null, phone: null, email: null,
    website: null, logoUrl: null, themeColor: null, contactPersonName: null, boardType: null,
    plan: null, maxStudents: null, expiryDate: null, active: true, razorpayConfigured: false,
    academicYearStartMonth: 4, workingDays: 'MONDAY,TUESDAY,WEDNESDAY,THURSDAY,FRIDAY,SATURDAY',
    periodsPerDay: 8, gradingSystem: 'CBSE',
    schoolLatitude: 28.6, schoolLongitude: 77.2, geofenceRadius: 200,
    schoolStartTime: '08:00', lateThresholdMinutes: 5,
    checkinWindowStart: '07:30', checkinWindowEnd: '08:30',
    staffAttendanceTrackingStartDate: '2026-01-01',
    timezone: 'Asia/Kolkata',
    teacherAttendanceReminderEnabled: false,
    teacherAttendanceReminderTime: null,
  });

  beforeEach(async () => {
    queryParam = null;
    const schoolService = {
      getSettings: jasmine.createSpy().and.returnValue(of(settings())),
      getEntitlement: jasmine.createSpy().and.returnValue(of(null)),
    };
    const academicSessionService = { getAllSessions: jasmine.createSpy().and.returnValue(of([])) };
    const feeWorkflowService = { getSettings: jasmine.createSpy().and.returnValue(of(null)) };
    const authStateService = { getUser: () => ({ role: 'ADMIN' }), hasFeature: () => true };
    const tenantService = { getLogoUrl: (u: string) => u };
    const toast = jasmine.createSpyObj('ToastService', ['success', 'error', 'warning']);
    const logger = jasmine.createSpyObj('LoggerService', ['error']);

    await TestBed.configureTestingModule({
      imports: [SchoolSettingsComponent],
      providers: [
        { provide: SchoolService, useValue: schoolService },
        { provide: AuthStateService, useValue: authStateService },
        { provide: TenantService, useValue: tenantService },
        { provide: LoggerService, useValue: logger },
        { provide: ToastService, useValue: toast },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: (key: string) => key === 'tab' ? queryParam : null } } } },
        { provide: AcademicSessionService, useValue: academicSessionService },
        { provide: FeeWorkflowService, useValue: feeWorkflowService },
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(SchoolSettingsComponent);
  });

  it('does not render a Channels tab button', () => {
    fixture.detectChanges();
    const tabLabels = Array.from(fixture.nativeElement.querySelectorAll('.ss-tab-label')) as HTMLElement[];
    expect(tabLabels.map(el => el.textContent?.trim())).not.toContain('Channels');
  });

  it('never renders the notification channels empty-state text', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('No notification channels configured yet.');
  });

  it('still renders the remaining tabs', () => {
    fixture.detectChanges();
    const labels = Array.from(fixture.nativeElement.querySelectorAll('.ss-tab-label') as NodeListOf<HTMLElement>)
      .map(el => el.textContent?.trim());
    expect(labels).toContain('General');
    expect(labels).toContain('Payments');
    expect(labels).toContain('Features');
    expect(labels).toContain('Staff Attendance');
    expect(labels).toContain('Plan');
  });

  it('falls back to the default General tab instead of a blank page when navigated with the removed ?tab=channels', () => {
    queryParam = 'channels';
    fixture.detectChanges();
    expect(fixture.componentInstance.activeTab).toBe('general');
    expect(fixture.nativeElement.querySelector('.ss-hero')).not.toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('No notification channels configured yet.');
  });

  it('has no notification-channel dependency, state, or methods left to accidentally call on load', () => {
    fixture.detectChanges();
    const instance = fixture.componentInstance as any;
    expect(instance.notificationChannelService).toBeUndefined();
    expect(instance.notificationChannels).toBeUndefined();
    expect(instance.channelsLoading).toBeUndefined();
    expect(instance.loadChannels).toBeUndefined();
    expect(instance.toggleChannel).toBeUndefined();
  });
});
