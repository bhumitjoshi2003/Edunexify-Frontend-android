import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { NotificationDeliveryLogComponent } from './notification-delivery-log.component';
import { NotificationDeliveryService } from '../../services/notification-delivery.service';
import { SchoolService } from '../../services/school.service';
import { LoggerService } from '../../services/logger.service';
import {
  DeliveryDetail,
  DeliveryRow,
  DeliverySummaryRow,
  deliveryStatusLabel,
  eventCodeLabel,
} from '../../interfaces/notification-delivery';

describe('NotificationDeliveryLogComponent', () => {
  let fixture: ComponentFixture<NotificationDeliveryLogComponent>;
  let component: NotificationDeliveryLogComponent;
  let service: jasmine.SpyObj<NotificationDeliveryService>;

  const row = (overrides: Partial<DeliveryRow> = {}): DeliveryRow => ({
    id: 21, channel: 'PUSH', status: 'SENT', schoolId: 1, schoolName: 'Indra Academy',
    recipientUserId: 'S1', recipientRole: 'STUDENT', notificationId: 7, eventCode: 'FEE_REMINDER',
    title: 'Fee due', attemptCount: 1, lastError: null, providerMessageId: 'projects/p/messages/abc',
    createdAt: '2026-09-20T10:00:00', sentAt: '2026-09-20T10:00:01', nextAttemptAt: null, read: null, readAt: null,
    ...overrides,
  });

  const detail = (overrides: Partial<DeliveryDetail> = {}): DeliveryDetail => ({
    ...row(), maskedDestination: null, category: 'FEES', message: 'Your fee is due.',
    sourceEntityType: null, sourceEntityId: null, maxAttempts: 5, processingStartedAt: null,
    relatedChannels: [], ...overrides,
  });

  const summaryRow = (overrides: Partial<DeliverySummaryRow> = {}): DeliverySummaryRow => ({
    notificationId: 4812, schoolId: 1, schoolName: 'Indra Academy', eventCode: 'NOTICE_PUBLISHED',
    title: 'Exam Notice', messagePreview: 'Exams start Monday', createdAt: '2026-09-20T09:00:00',
    totalRecipients: 500,
    inApp: { stored: 500, opened: 212, unopened: 288 },
    push: { total: 500, accepted: 487, failed: 13, retrying: 0, skipped: 0, queued: 0 },
    email: { total: 500, accepted: 492, failed: 8, retrying: 0, skipped: 0, queued: 0 },
    ...overrides,
  });

  beforeEach(() => {
    service = jasmine.createSpyObj('NotificationDeliveryService', ['search', 'summary', 'eventCodes', 'detail']);
    service.search.and.returnValue(of({ content: [row()], page: 0, size: 25, hasNext: false }));
    service.summary.and.returnValue(of({ content: [summaryRow()], page: 0, size: 25, hasNext: false }));
    service.eventCodes.and.returnValue(of(['FEE_REMINDER', 'NOTICE_PUBLISHED']));

    TestBed.configureTestingModule({
      imports: [NotificationDeliveryLogComponent],
      providers: [
        { provide: NotificationDeliveryService, useValue: service },
        { provide: SchoolService, useValue: { listAllSchools: () => of([{ id: 1, name: 'Indra Academy' }]) } },
        { provide: LoggerService, useValue: jasmine.createSpyObj('LoggerService', ['error']) },
      ],
    });
    fixture = TestBed.createComponent(NotificationDeliveryLogComponent);
    component = fixture.componentInstance;
  });

  function openDetails(): void {
    fixture.detectChanges();
    component.showDetails();
    fixture.detectChanges();
  }

  // ─── Summary (default view) ────────────────────────────────────────

  it('opens on the Summary view and loads it — the recipient log is not fetched until needed', () => {
    fixture.detectChanges();
    expect(component.view).toBe('summary');
    expect(service.summary).toHaveBeenCalledWith(0, 25, { eventCode: null, schoolId: null, from: null, to: null, search: null });
    expect(service.search).not.toHaveBeenCalled();
  });

  it('shows per-channel accepted/failed counts and in-app stored/opened — never "delivered"', () => {
    fixture.detectChanges();
    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('Exam Notice');
    expect(text).toContain('500');
    expect(text).toContain('487 accepted');
    expect(text).toContain('13 failed');
    expect(text).toContain('492 accepted');
    expect(text).toContain('8 failed');
    expect(text).toContain('500 stored');
    expect(text).toContain('212 opened');
    expect(text).toContain('288 unopened');
    expect(text.toLowerCase()).not.toContain('delivered');
  });

  it('labels a channel with no delivery rows "Not sent"', () => {
    service.summary.and.returnValue(of({ content: [
      summaryRow({ notificationId: 1, email: null }),
      summaryRow({ notificationId: 2, push: null, email: null }),
    ], page: 0, size: 25, hasNext: false }));
    fixture.detectChanges();
    const text: string = fixture.nativeElement.textContent;
    expect(fixture.nativeElement.querySelectorAll('.ndl-none').length).toBe(3);
    expect(text).toContain('Not sent');
    expect(text).not.toContain('Records expired');
    expect(text).not.toContain('May be incomplete');
  });

  it('shows only summary filters on Summary and only recipient filters on Details', () => {
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('#ndl-search')).toBeTruthy();
    expect(el.querySelector('#ndl-status')).toBeNull();
    expect(el.querySelector('#ndl-recipient')).toBeNull();

    component.showDetails();
    fixture.detectChanges();
    expect(el.querySelector('#ndl-search')).toBeNull();
    expect(el.querySelector('#ndl-status')).toBeTruthy();
    expect(el.querySelector('#ndl-channel')).toBeTruthy();
    expect(el.querySelector('#ndl-recipient')).toBeTruthy();
  });

  it('applies summary filters (event type, school, dates, search) to the summary', () => {
    fixture.detectChanges();
    component.filterEventCode = 'NOTICE_PUBLISHED';
    component.filterSchoolId = 1;
    component.filterFrom = '2026-09-01';
    component.filterTo = '2026-09-30';
    component.filterSearch = 'exam';

    component.applyFilters();

    expect(service.summary).toHaveBeenCalledWith(0, 25,
      { eventCode: 'NOTICE_PUBLISHED', schoolId: 1, from: '2026-09-01', to: '2026-09-30', search: 'exam' });
    expect(service.search).not.toHaveBeenCalled();
  });

  it('clicking a summary drills into the existing recipient log for that notification', () => {
    fixture.detectChanges();
    component.filterStatus = 'FAILED_FINAL';
    component.filterChannel = 'EMAIL';
    component.filterRecipient = 'S9';

    component.drillDown(component.summaryRows[0]);
    fixture.detectChanges();

    expect(component.view).toBe('details');
    expect(service.search).toHaveBeenCalledWith(0, 25, jasmine.objectContaining({
      notificationId: 4812, status: null, channel: null, recipient: null,
    }));
    expect(fixture.nativeElement.textContent).toContain('Showing recipients of');
    expect(fixture.nativeElement.textContent).toContain('Exam Notice');
  });

  it('clearing the drill-down reloads the full recipient log', () => {
    fixture.detectChanges();
    component.drillDown(component.summaryRows[0]);
    service.search.calls.reset();

    component.clearDrillDown();

    expect(component.drillNotification).toBeNull();
    expect(service.search).toHaveBeenCalledWith(0, 25, jasmine.objectContaining({ notificationId: null }));
  });

  it('pages the summary and shows a validation message on 400', () => {
    service.summary.and.returnValue(of({ content: [summaryRow()], page: 0, size: 25, hasNext: true }));
    fixture.detectChanges();
    component.nextSummaryPage();
    expect(service.summary).toHaveBeenCalledWith(1, 25, jasmine.any(Object));

    service.summary.and.returnValue(throwError(() => ({ status: 400, error: { detail: 'The end date is before the start date.' } })));
    component.applyFilters();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('The end date is before the start date.');
  });

  // ─── Delivery Details (recipient-level log) ────────────────────────

  it('loads the recipient log the first time Details is opened', () => {
    openDetails();
    expect(service.search).toHaveBeenCalledWith(0, 25, jasmine.objectContaining({ notificationId: null, status: null, channel: null }));
    expect(component.rows.length).toBe(1);
    expect(fixture.nativeElement.textContent).toContain('Indra Academy');
  });

  it('applies every details filter and restarts from the first page', () => {
    openDetails();
    component.page = 3;
    component.filterStatus = 'FAILED_FINAL';
    component.filterChannel = 'EMAIL';
    component.filterEventCode = 'FEE_REMINDER';
    component.filterSchoolId = 1;
    component.filterRecipient = 'S1';
    component.filterFrom = '2026-09-01';
    component.filterTo = '2026-09-30';

    component.applyFilters();

    expect(service.search).toHaveBeenCalledWith(0, 25, {
      notificationId: null, status: 'FAILED_FINAL', channel: 'EMAIL', eventCode: 'FEE_REMINDER', schoolId: 1,
      recipient: 'S1', from: '2026-09-01', to: '2026-09-30',
    });
  });

  it('pages with Next only while the backend reports more rows', () => {
    service.search.and.returnValue(of({ content: [row()], page: 0, size: 25, hasNext: true }));
    openDetails();
    component.nextPage();
    expect(service.search).toHaveBeenCalledWith(1, 25, jasmine.any(Object));

    service.search.calls.reset();
    component.hasNext = false;
    component.nextPage();
    expect(service.search).not.toHaveBeenCalled();
  });

  it('never labels anything "Delivered" — SENT reads as accepted by the provider', () => {
    service.search.and.returnValue(of({ content: [
      row(), row({ id: 22, channel: 'EMAIL' }), row({ id: 70, channel: 'IN_APP', status: 'STORED', read: true }),
    ], page: 0, size: 25, hasNext: false }));
    openDetails();

    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('Accepted by FCM');
    expect(text).toContain('Accepted by mail server');
    expect(text).toContain('In inbox');
    expect(text).toContain('Opened');
    expect(text.toLowerCase()).not.toContain('delivered');
  });

  it('opening a row loads its detail with the status meaning and the other channels', () => {
    openDetails();
    service.detail.and.returnValue(of(detail({
      channel: 'EMAIL', status: 'FAILED_FINAL', maskedDestination: 'pr***@gmail.com', attemptCount: 5,
      lastError: 'Retry limit reached: MailSendException', providerMessageId: null,
      relatedChannels: [
        { id: 70, channel: 'IN_APP', status: 'STORED', attemptCount: 0, sentAt: null, lastError: null, read: false, readAt: null },
        { id: 21, channel: 'PUSH', status: 'SENT', attemptCount: 1, sentAt: '2026-09-20T10:00:01', lastError: null, read: null, readAt: null },
      ],
    })));

    component.open(component.rows[0]);
    fixture.detectChanges();

    expect(service.detail).toHaveBeenCalledWith('PUSH', 21);
    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('pr***@gmail.com');
    expect(text).toContain('5 of 5');
    expect(text).toContain('Retry limit reached');
    expect(text).toContain('Not provided by the mail integration');
    expect(text).toContain('Other channels for this recipient');
    expect(text).toContain('Not opened');
  });

  it('shows a truthful fallback when a detail record cannot be loaded, and close clears it', () => {
    openDetails();
    service.detail.and.returnValue(throwError(() => ({ status: 404 })));
    component.open(component.rows[0]);
    fixture.detectChanges();
    expect(component.detailFailed).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain('could not be loaded');

    component.close();
    expect(component.selected).toBeNull();
  });

  it('shows the backend validation message on a 400 and a generic fallback otherwise', () => {
    service.search.and.returnValue(throwError(() => ({ status: 400, error: { detail: 'The end date is before the start date.' } })));
    openDetails();
    expect(fixture.nativeElement.textContent).toContain('The end date is before the start date.');

    service.search.and.returnValue(throwError(() => ({ status: 500 })));
    component.applyFilters();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('temporarily unavailable');
  });

  it('humanises labels', () => {
    expect(eventCodeLabel('SUPPORT_TICKET_IN_PROGRESS')).toBe('Support ticket in progress');
    expect(deliveryStatusLabel('FAILED_RETRYABLE')).toBe('Retrying');
    expect(deliveryStatusLabel('SKIPPED')).toBe('Skipped');
  });
});
