import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { StaffAdoptionService } from '../../services/staff-adoption.service';
import { ToastService } from '../../services/toast.service';
import { StaffAdoptionComponent } from './staff-adoption.component';

describe('StaffAdoptionComponent', () => {
  let fixture: ComponentFixture<StaffAdoptionComponent>;
  let service: jasmine.SpyObj<StaffAdoptionService>;
  let toast: jasmine.SpyObj<ToastService>;
  const response: any = { summary: { totalTeachers: 2, startedTeachers: 1, notStartedTeachers: 1, attendanceUsedTeachers: 1, disabledTeachers: 0 }, teachers: [
    { teacherId: 'T1', name: 'Meenakshi Negi', accountStatus: 'STARTED', lastActiveAt: new Date().toISOString(), hasUsedAttendance: true, lastAttendanceAt: null, onboardingStatus: 'COMPLETED', appVersionName: '1.3.0', appVersionStatus: 'UP_TO_DATE' },
    { teacherId: 'T2', name: 'Tarun Bisht', accountStatus: 'NOT_STARTED', lastActiveAt: null, hasUsedAttendance: false, lastAttendanceAt: null, onboardingStatus: 'UNKNOWN', appVersionStatus: 'UNKNOWN' },
  ]};
  beforeEach(async () => {
    service = jasmine.createSpyObj('StaffAdoptionService', ['getStaffAdoption', 'previewReminder', 'sendReminder']);
    service.getStaffAdoption.and.returnValue(of(response));
    toast = jasmine.createSpyObj('ToastService', ['confirm', 'success', 'error', 'info', 'warning']);
    toast.confirm.and.resolveTo(true);
    await TestBed.configureTestingModule({ imports: [StaffAdoptionComponent], providers: [provideRouter([]), { provide: StaffAdoptionService, useValue: service }, { provide: ToastService, useValue: toast }] }).compileComponents();
    fixture = TestBed.createComponent(StaffAdoptionComponent);
  });
  it('renders summary, account, attendance, onboarding and app states', () => { fixture.detectChanges(); const text = fixture.nativeElement.textContent; expect(text).toContain('2'); expect(text).toContain('Started'); expect(text).toContain('Not yet used'); expect(text).toContain('Completed'); expect(text).toContain('Up to date'); expect(text).toContain('No version reported'); });
  it('filters by search and readiness filter', () => { fixture.detectChanges(); fixture.componentInstance.searchTerm = 'Tarun'; fixture.componentInstance.filter = 'NOT_STARTED'; expect(fixture.componentInstance.rows.length).toBe(1); });
  it('shows a recoverable error', () => { service.getStaffAdoption.and.returnValue(throwError(() => new Error('offline'))); fixture = TestBed.createComponent(StaffAdoptionComponent); fixture.detectChanges(); expect(fixture.nativeElement.textContent).toContain('could not be loaded'); expect(fixture.nativeElement.textContent).toContain('Retry'); });

  describe('reminders', () => {
    const preview = { count: 2, teachers: [{ teacherId: 'T2', name: 'Tarun Bisht' }, { teacherId: 'T3', name: 'Priya Rao' }] };
    const sendResult: any = { type: 'NOT_STARTED', eligibleCount: 2, sentCount: 2, skippedRecentCount: 0 };

    it('shows the Remind action and reveals all three categories', () => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Remind');
      (fixture.nativeElement.querySelector('.sa-reminder-toggle') as HTMLButtonElement).click();
      fixture.detectChanges();
      const text = fixture.nativeElement.textContent;
      expect(text).toContain('Not started');
      expect(text).toContain('Outdated app');
      expect(text).toContain('Onboarding incomplete');
    });

    it('previews recipients and opens a confirmation dialog with the correct count', () => {
      service.previewReminder.and.returnValue(of(preview));
      service.sendReminder.and.returnValue(of(sendResult));
      fixture.detectChanges();
      (fixture.nativeElement.querySelector('.sa-reminder-toggle') as HTMLButtonElement).click();
      fixture.detectChanges();
      (fixture.nativeElement.querySelector('.sa-reminder-preview') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(service.previewReminder).toHaveBeenCalledWith('NOT_STARTED');
      const dialogData = toast.confirm.calls.mostRecent().args[0];
      expect(dialogData.title).toContain('2 teachers');
      expect(dialogData.message).toContain('Tarun Bisht');
      expect(dialogData.html).toBeUndefined();   // names are plain text, never HTML
    });

    it('does not send when the admin declines confirmation', () => {
      toast.confirm.and.resolveTo(false);
      service.previewReminder.and.returnValue(of(preview));
      fixture.detectChanges();
      (fixture.nativeElement.querySelector('.sa-reminder-toggle') as HTMLButtonElement).click();
      fixture.detectChanges();
      (fixture.nativeElement.querySelector('.sa-reminder-preview') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(service.sendReminder).not.toHaveBeenCalled();
    });

    it('sends after confirmation and shows a truthful success toast', async () => {
      service.previewReminder.and.returnValue(of(preview));
      service.sendReminder.and.returnValue(of(sendResult));
      fixture.detectChanges();
      (fixture.nativeElement.querySelector('.sa-reminder-toggle') as HTMLButtonElement).click();
      fixture.detectChanges();
      (fixture.nativeElement.querySelector('.sa-reminder-preview') as HTMLButtonElement).click();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(service.sendReminder).toHaveBeenCalledWith('NOT_STARTED');
      expect(toast.success).toHaveBeenCalledWith('Reminder sent', 'Reminder sent to 2 teachers.');
    });

    it('shows a no-recipients toast without opening a confirmation dialog', () => {
      service.previewReminder.and.returnValue(of({ count: 0, teachers: [] }));
      fixture.detectChanges();
      (fixture.nativeElement.querySelector('.sa-reminder-toggle') as HTMLButtonElement).click();
      fixture.detectChanges();
      (fixture.nativeElement.querySelector('.sa-reminder-preview') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(toast.info).toHaveBeenCalled();
      expect(toast.confirm).not.toHaveBeenCalled();
    });

    it('shows a retryable error and keeps the panel open when preview fails', () => {
      service.previewReminder.and.returnValue(throwError(() => new Error('offline')));
      fixture.detectChanges();
      (fixture.nativeElement.querySelector('.sa-reminder-toggle') as HTMLButtonElement).click();
      fixture.detectChanges();
      (fixture.nativeElement.querySelector('.sa-reminder-preview') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain('Could not load recipients');
      expect(fixture.nativeElement.querySelector('.sa-reminder-panel')).toBeTruthy();
    });

    it('shows an error toast and preserves navigation/page state when send fails', async () => {
      service.previewReminder.and.returnValue(of(preview));
      service.sendReminder.and.returnValue(throwError(() => new Error('offline')));
      fixture.detectChanges();
      (fixture.nativeElement.querySelector('.sa-reminder-toggle') as HTMLButtonElement).click();
      fixture.detectChanges();
      (fixture.nativeElement.querySelector('.sa-reminder-preview') as HTMLButtonElement).click();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(toast.error).toHaveBeenCalled();
      expect(fixture.nativeElement.querySelector('.sa-reminder-panel')).toBeTruthy();   // still on the page, panel open
    });
  });
});
