import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { AccountDeletionRequestComponent } from './account-deletion-request.component';
import { AccountDeletionService } from '../../services/account-deletion.service';
import { AccountDeletionRequest } from '../../interfaces/account-deletion-request';
import { ToastService } from '../../services/toast.service';
import { LoggerService } from '../../services/logger.service';
import { PRIVACY_POLICY_URL } from '../../utils/legal-links';

describe('AccountDeletionRequestComponent', () => {
  let fixture: ComponentFixture<AccountDeletionRequestComponent>;
  let component: AccountDeletionRequestComponent;
  let service: jasmine.SpyObj<AccountDeletionService>;
  let toast: jasmine.SpyObj<ToastService>;

  const pending: AccountDeletionRequest = {
    reference: 'DEL-12', status: 'PENDING', requestedAt: '2026-11-02T10:00:00', resolvedAt: null, userMessage: null,
  };

  function create(existing: AccountDeletionRequest | null): void {
    service.mine.and.returnValue(of(existing));
    fixture = TestBed.createComponent(AccountDeletionRequestComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  const el = (): HTMLElement => fixture.nativeElement;
  const submitButton = (): HTMLButtonElement => el().querySelector('.adr-submit') as HTMLButtonElement;

  beforeEach(() => {
    service = jasmine.createSpyObj('AccountDeletionService', ['mine', 'submit']);
    toast = jasmine.createSpyObj('ToastService', ['success', 'error']);
    TestBed.configureTestingModule({
      imports: [AccountDeletionRequestComponent],
      providers: [
        { provide: AccountDeletionService, useValue: service },
        { provide: ToastService, useValue: toast },
        { provide: LoggerService, useValue: jasmine.createSpyObj('LoggerService', ['error']) },
      ],
    });
  });

  it('explains that a request does not delete the account immediately and that some records may be kept', () => {
    create(null);
    const text = el().textContent ?? '';
    expect(text).toContain('does not immediately delete');
    expect(text).toContain('educational, financial or legal reasons');
  });

  it('cannot be submitted until the user explicitly confirms', () => {
    create(null);
    expect(submitButton().disabled).toBeTrue();
    component.submit();
    expect(service.submit).not.toHaveBeenCalled();

    const checkbox = el().querySelector('.adr-confirm input') as HTMLInputElement;
    checkbox.click();
    fixture.detectChanges();
    expect(component.confirmed).toBeTrue();
  });

  it('submits once confirmed and shows the reference and status', fakeAsync(() => {
    create(null);
    service.submit.and.returnValue(of(pending));
    component.confirmed = true;
    component.reason = '  Left the school  ';
    component.submit();
    tick();
    fixture.detectChanges();

    expect(service.submit).toHaveBeenCalledOnceWith('  Left the school  ');
    expect(toast.success).toHaveBeenCalledWith('Request received', 'Your reference is DEL-12.');
    const status = el().querySelector('[data-testid="deletion-status"]')!.textContent!;
    expect(status).toContain('DEL-12');
    expect(status).toContain('Received');
    expect(el().querySelector('[data-testid="deletion-form"]')).toBeNull();
  }));

  it('shows an existing open request instead of the form, so it is not submitted twice', () => {
    create({ ...pending, status: 'PROCESSING' });
    expect(el().querySelector('[data-testid="deletion-status"]')!.textContent).toContain('Processing');
    expect(el().querySelector('[data-testid="deletion-form"]')).toBeNull();
    component.confirmed = true;
    component.submit();
    expect(service.submit).not.toHaveBeenCalled();
  });

  it('lets the user ask again after a request was not fulfilled, and shows the message they were sent', () => {
    create({ ...pending, status: 'REJECTED', resolvedAt: '2026-11-03T09:00:00', userMessage: 'Please ask your school admin.' });
    expect(el().textContent).toContain('Please ask your school admin.');
    expect(el().querySelector('[data-testid="deletion-form"]')).not.toBeNull();
  });

  it('says when it was throttled', () => {
    create(null);
    service.submit.and.returnValue(throwError(() => new HttpErrorResponse({ status: 429 })));
    component.confirmed = true;
    component.submit();
    expect(toast.error).toHaveBeenCalledWith('Request not sent', 'Too many requests. Please try again later.');
    expect(component.submitting).toBeFalse();
  });

  it('opens the privacy policy outside the app', () => {
    create(null);
    const open = spyOn(window, 'open');
    (el().querySelector('.adr-link') as HTMLButtonElement).click();
    expect(open).toHaveBeenCalledWith(PRIVACY_POLICY_URL, '_blank', 'noopener');
  });
});
