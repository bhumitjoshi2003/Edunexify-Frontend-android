import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { NoticeComponent } from './notice.component';
import { NotificationService } from '../../services/notification.service';
import { NotificationStateService } from '../../services/notification-state.service';
import { AuthStateService } from '../../auth/auth-state.service';
import { LoggerService } from '../../services/logger.service';
import { ToastService } from '../../services/toast.service';
import { SchoolService } from '../../services/school.service';

/** Shared by the web and Android clients — keep the two copies identical. */
describe('NoticeComponent — Principal publishing', () => {
  function create(role: string) {
    const notifications = jasmine.createSpyObj('NotificationService', [
      'getAllNotifications', 'getUserNotifications', 'sendNotice', 'deleteNotification']);
    const page = (content: unknown[]) => ({ content, totalElements: content.length, totalPages: 1, last: true, first: true,
      numberOfElements: content.length, pageable: { pageNumber: 0, pageSize: 10 } });
    notifications.getAllNotifications.and.returnValue(of(page([
      { id: 1, title: 'Sports day', message: 'm', type: 'NOTICE', createdBy: 'principal-1' },
      { id: 2, title: 'Fee dates', message: 'm', type: 'NOTICE', createdBy: 'admin-1' },
    ])));
    notifications.getUserNotifications.and.returnValue(of(page([])));
    TestBed.configureTestingModule({
      imports: [NoticeComponent],
      providers: [
        { provide: NotificationService, useValue: notifications },
        { provide: NotificationStateService, useValue: jasmine.createSpyObj('NotificationStateService', ['allRead']) },
        { provide: AuthStateService, useValue: { getUser: () => ({ role, userId: role === 'PRINCIPAL' ? 'principal-1' : 'admin-1' }), hasFeature: () => true } },
        { provide: LoggerService, useValue: jasmine.createSpyObj('LoggerService', ['error', 'warn', 'info']) },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['success', 'error', 'warning', 'confirm']) },
        { provide: SchoolService, useValue: { getClasses: () => of(['8']) } },
        { provide: MatDialog, useValue: jasmine.createSpyObj('MatDialog', ['open']) },
      ],
    });
    const fixture = TestBed.createComponent(NoticeComponent);
    fixture.detectChanges();
    return { fixture, notifications };
  }

  it('gives the Principal the publishing view with removal limited to their own notices', () => {
    const { fixture, notifications } = create('PRINCIPAL');
    expect(fixture.componentInstance.isAdmin).toBeTrue();
    expect(notifications.getAllNotifications).toHaveBeenCalled();
    expect(notifications.getUserNotifications).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelectorAll('.nb-btn-delete').length).toBe(1);
    expect(fixture.componentInstance.canDeleteNotice({ createdBy: 'admin-1' })).toBeFalse();
    expect(fixture.componentInstance.canDeleteNotice({})).toBeFalse();
  });

  it('keeps every delete control for the Admin', () => {
    const { fixture } = create('ADMIN');
    expect(fixture.nativeElement.querySelectorAll('.nb-btn-delete').length).toBe(2);
  });
});
