import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ReportSupportTicketComponent } from './report-support-ticket.component';
import { SupportTicketService } from '../../services/support-ticket.service';
import { ToastService } from '../../services/toast.service';
import { LoggerService } from '../../services/logger.service';
import { AndroidPlatformService } from '../../services/android-platform.service';

describe('ReportSupportTicketComponent', () => {
  let fixture: ComponentFixture<ReportSupportTicketComponent>;
  let component: ReportSupportTicketComponent;
  let supportTicketService: jasmine.SpyObj<SupportTicketService>;
  let toast: jasmine.SpyObj<ToastService>;
  let platform: jasmine.SpyObj<AndroidPlatformService>;
  let router: Router;

  beforeEach(() => {
    supportTicketService = jasmine.createSpyObj('SupportTicketService', ['createTicket', 'uploadScreenshotDirect']);
    toast = jasmine.createSpyObj('ToastService', ['success', 'error', 'warning']);
    platform = jasmine.createSpyObj('AndroidPlatformService', ['isNativePlatform', 'getAppUpdateInfo']);
    platform.isNativePlatform.and.returnValue(false);

    TestBed.configureTestingModule({
      imports: [ReportSupportTicketComponent],
      providers: [
        provideRouter([]),
        { provide: SupportTicketService, useValue: supportTicketService },
        { provide: ToastService, useValue: toast },
        { provide: LoggerService, useValue: jasmine.createSpyObj('LoggerService', ['error']) },
        { provide: AndroidPlatformService, useValue: platform },
      ],
    });
    fixture = TestBed.createComponent(ReportSupportTicketComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    fixture.detectChanges();
  });

  it('warns and does not submit when no category is selected', () => {
    component.title = 'Something broke';
    component.description = 'It broke badly.';
    component.submit();

    expect(toast.warning).toHaveBeenCalled();
    expect(supportTicketService.createTicket).not.toHaveBeenCalled();
  });

  it('warns and does not submit when title or description is missing', () => {
    component.category = 'OTHER';
    component.title = '';
    component.description = 'It broke badly.';
    component.submit();

    expect(toast.warning).toHaveBeenCalled();
    expect(supportTicketService.createTicket).not.toHaveBeenCalled();
  });

  it('submits without a screenshot when none was attached — the screenshot is genuinely optional', () => {
    component.category = 'LOGIN_ACCOUNT';
    component.title = 'Cannot log in';
    component.description = 'Password reset email never arrives.';
    supportTicketService.createTicket.and.returnValue(of({} as any));

    component.submit();

    expect(supportTicketService.uploadScreenshotDirect).not.toHaveBeenCalled();
    expect(supportTicketService.createTicket).toHaveBeenCalledWith(jasmine.objectContaining({
      category: 'LOGIN_ACCOUNT',
      title: 'Cannot log in',
      description: 'Password reset email never arrives.',
      screenshotObjectKey: null,
      screenshotObjectKeys: [],
      platform: 'ANDROID',
    }));
  });

  it('captures the current route and platform=ANDROID automatically, without asking the user', () => {
    spyOnProperty(router, 'url', 'get').and.returnValue('/dashboard/teacher-dashboard?tab=today');
    component.category = 'APP_WEBSITE';
    component.title = 'Broken layout';
    component.description = 'The layout is broken on this page.';
    supportTicketService.createTicket.and.returnValue(of({} as any));

    component.submit();

    expect(supportTicketService.createTicket).toHaveBeenCalledWith(jasmine.objectContaining({
      route: '/dashboard/teacher-dashboard',
      platform: 'ANDROID',
    }));
  });

  it('captures the installed app version from AndroidPlatformService on a native device', async () => {
    platform.isNativePlatform.and.returnValue(true);
    platform.getAppUpdateInfo.and.returnValue(Promise.resolve({ currentVersionName: '2.4.1' } as any));
    fixture = TestBed.createComponent(ReportSupportTicketComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await Promise.resolve();
    await Promise.resolve();

    component.category = 'OTHER';
    component.title = 'Crash on launch';
    component.description = 'App crashes immediately.';
    supportTicketService.createTicket.and.returnValue(of({} as any));

    component.submit();

    expect(supportTicketService.createTicket).toHaveBeenCalledWith(jasmine.objectContaining({
      appVersion: '2.4.1',
    }));
  });

  it('leaves appVersion null when not running on a native device', () => {
    component.category = 'OTHER';
    component.title = 'Broken layout';
    component.description = 'It looks wrong.';
    supportTicketService.createTicket.and.returnValue(of({} as any));

    component.submit();

    expect(platform.getAppUpdateInfo).not.toHaveBeenCalled();
    expect(supportTicketService.createTicket).toHaveBeenCalledWith(jasmine.objectContaining({
      appVersion: null,
    }));
  });

  it('uploads the screenshot first, then creates the ticket with the returned object key', () => {
    component.category = 'OTHER';
    component.title = 'Broken image';
    component.description = 'Screenshot attached.';
    component.selectedFiles = [new File(['x'], 'shot.png', { type: 'image/png' })];
    supportTicketService.uploadScreenshotDirect.and.returnValue(of({ objectKey: 'schools/1/support-tickets/new/screenshots/x.png', displayUrl: '' }));
    supportTicketService.createTicket.and.returnValue(of({} as any));

    component.submit();

    expect(supportTicketService.uploadScreenshotDirect).toHaveBeenCalledWith(component.selectedFiles[0]);
    expect(supportTicketService.createTicket).toHaveBeenCalledWith(jasmine.objectContaining({
      screenshotObjectKey: 'schools/1/support-tickets/new/screenshots/x.png',
      screenshotObjectKeys: ['schools/1/support-tickets/new/screenshots/x.png'],
    }));
  });

  it('uploads multiple screenshots and sends every returned object key', () => {
    component.category = 'OTHER';
    component.title = 'Two images';
    component.description = 'Both screenshots are needed.';
    component.selectedFiles = [
      new File(['a'], 'one.png', { type: 'image/png' }),
      new File(['b'], 'two.png', { type: 'image/png' }),
    ];
    supportTicketService.uploadScreenshotDirect.and.returnValues(
      of({ objectKey: 'schools/1/support-tickets/new/screenshots/one.png', displayUrl: '' }),
      of({ objectKey: 'schools/1/support-tickets/new/screenshots/two.png', displayUrl: '' }),
    );
    supportTicketService.createTicket.and.returnValue(of({} as any));

    component.submit();

    expect(supportTicketService.uploadScreenshotDirect).toHaveBeenCalledTimes(2);
    expect(supportTicketService.createTicket).toHaveBeenCalledWith(jasmine.objectContaining({
      screenshotObjectKey: 'schools/1/support-tickets/new/screenshots/one.png',
      screenshotObjectKeys: [
        'schools/1/support-tickets/new/screenshots/one.png',
        'schools/1/support-tickets/new/screenshots/two.png',
      ],
    }));
  });

  it('does not create the ticket when the screenshot upload fails', () => {
    component.category = 'OTHER';
    component.title = 'Broken image';
    component.description = 'Screenshot attached.';
    component.selectedFiles = [new File(['x'], 'shot.png', { type: 'image/png' })];
    supportTicketService.uploadScreenshotDirect.and.returnValue(throwError(() => new Error('upload failed')));

    component.submit();

    expect(supportTicketService.createTicket).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
    expect(component.submitting).toBeFalse();
  });

  it('rejects a file larger than 5MB before ever attempting an upload', () => {
    const bigFile = new File([new Uint8Array(6 * 1024 * 1024)], 'big.png', { type: 'image/png' });
    const input = document.createElement('input');
    input.type = 'file';
    Object.defineProperty(input, 'files', { value: [bigFile] });

    component.onFileSelected({ target: input } as unknown as Event);

    expect(component.selectedFiles).toEqual([]);
    expect(toast.error).toHaveBeenCalled();
  });

  it('rejects a non-image content type', () => {
    const pdf = new File(['x'], 'doc.pdf', { type: 'application/pdf' });
    const input = document.createElement('input');
    input.type = 'file';
    Object.defineProperty(input, 'files', { value: [pdf] });

    component.onFileSelected({ target: input } as unknown as Event);

    expect(component.selectedFiles).toEqual([]);
    expect(toast.error).toHaveBeenCalled();
  });

  it('removeScreenshot clears the selected file and preview', () => {
    component.selectedFiles = [new File(['x'], 'shot.png', { type: 'image/png' })];
    component.imagePreviewUrls = ['data:image/png;base64,x'];

    component.removeScreenshot(0);

    expect(component.selectedFiles).toEqual([]);
    expect(component.imagePreviewUrls).toEqual([]);
  });
});
