import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { of } from 'rxjs';
import { SuperAdminDeletionRequestsComponent } from './super-admin-deletion-requests.component';
import { AccountDeletionService } from '../../services/account-deletion.service';
import { AccountDeletionAccessCheck, AccountDeletionRequestAdminView } from '../../interfaces/account-deletion-request';
import { ToastService } from '../../services/toast.service';
import { LoggerService } from '../../services/logger.service';

describe('SuperAdminDeletionRequestsComponent', () => {
  let fixture: ComponentFixture<SuperAdminDeletionRequestsComponent>;
  let component: SuperAdminDeletionRequestsComponent;
  let service: jasmine.SpyObj<AccountDeletionService>;
  let toast: jasmine.SpyObj<ToastService>;

  const request: AccountDeletionRequestAdminView = {
    id: 5, reference: 'DEL-5', schoolId: 1, schoolName: 'Greenfield', userId: 'T1', userRole: 'TEACHER',
    platform: 'ANDROID', status: 'PENDING', reason: null, userMessage: null, internalNote: null, retainedData: null,
    resolvedBy: null, resolvedAt: null, createdAt: '2026-11-02T10:00:00', updatedAt: '2026-11-02T10:00:00',
  };

  const live: AccountDeletionAccessCheck = { login: 'ACTIVE', activeSessions: 1, pushTokens: 1, accessRemoved: false };
  const gone: AccountDeletionAccessCheck = { login: 'INACTIVE', activeSessions: 0, pushTokens: 0, accessRemoved: true };

  beforeEach(() => {
    service = jasmine.createSpyObj('AccountDeletionService', ['list', 'updateStatus', 'access', 'revokeAccess']);
    service.access.and.returnValue(of(live));
    toast = jasmine.createSpyObj('ToastService', ['success', 'error', 'confirm']);
    service.list.and.returnValue(of({ content: [request], totalElements: 1, totalPages: 1, number: 0, size: 20 }));
    TestBed.configureTestingModule({
      imports: [SuperAdminDeletionRequestsComponent],
      providers: [
        { provide: AccountDeletionService, useValue: service },
        { provide: ToastService, useValue: toast },
        { provide: LoggerService, useValue: jasmine.createSpyObj('LoggerService', ['error']) },
      ],
    });
    fixture = TestBed.createComponent(SuperAdminDeletionRequestsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('lists pending requests first', () => {
    expect(service.list).toHaveBeenCalledWith('PENDING', 0);
    expect(fixture.nativeElement.textContent).toContain('DEL-5');
  });

  it('offers only the current stage, the next one and Not fulfilled', () => {
    component.open(request);
    expect(component.allowedStatuses).toEqual(['PENDING', 'IDENTITY_VERIFIED', 'REJECTED']);
    component.open({ ...request, status: 'APPROVED' });
    expect(component.allowedStatuses).toEqual(['APPROVED', 'PROCESSING', 'REJECTED']);
  });

  it('will not reject without a reason and a message to the requester', () => {
    component.open(request);
    component.statusDraft = 'REJECTED';
    component.internalNoteDraft = 'Identity not verified';
    expect(component.canSave).toBeFalse();
    component.userMessageDraft = 'We could not verify your identity.';
    expect(component.canSave).toBeTrue();
  });

  it('will not complete while access remains, or without the retained data and confirmation', () => {
    component.open({ ...request, status: 'PROCESSING' });
    component.statusDraft = 'COMPLETED';
    component.internalNoteDraft = 'Profile anonymised per approved procedure.';
    component.retainedDataDraft = 'Attendance history kept by the school.';
    component.fulfilmentConfirmed = true;
    expect(component.access).toEqual(live);
    expect(component.canSave).toBeFalse();
    component.save();
    expect(service.updateStatus).not.toHaveBeenCalled();

    component.access = gone;
    expect(component.canSave).toBeTrue();
    component.retainedDataDraft = ' ';
    expect(component.canSave).toBeFalse();
  });

  it('revokes access only after confirmation, and only while processing', fakeAsync(() => {
    component.open(request);
    expect(component.canRevoke).toBeFalse();

    component.open({ ...request, status: 'PROCESSING' });
    toast.confirm.and.resolveTo(false);
    component.revokeAccess();
    tick();
    expect(service.revokeAccess).not.toHaveBeenCalled();

    toast.confirm.and.resolveTo(true);
    service.revokeAccess.and.returnValue(of({ sessionsRevoked: 1, pushTokensRemoved: 1, after: { ...gone, login: 'ACTIVE' as const, accessRemoved: false } }));
    component.revokeAccess();
    tick();
    expect(service.revokeAccess).toHaveBeenCalledWith(5);
    expect(component.access!.activeSessions).toBe(0);
  }));

  it('records the decision and keeps closed requests read-only', () => {
    const closed = { ...request, status: 'COMPLETED' as const, internalNote: 'Done', retainedData: 'Fees kept',
      resolvedBy: 'SA', resolvedAt: '2026-11-03T09:00:00' };
    service.updateStatus.and.returnValue(of(closed));
    service.access.and.returnValue(of(gone));
    component.open({ ...request, status: 'PROCESSING' });
    component.statusDraft = 'COMPLETED';
    component.userMessageDraft = 'Your account has been deleted.';
    component.internalNoteDraft = 'Done';
    component.retainedDataDraft = 'Fees kept';
    component.fulfilmentConfirmed = true;
    component.save();

    expect(service.updateStatus).toHaveBeenCalledWith(5, {
      status: 'COMPLETED', userMessage: 'Your account has been deleted.', internalNote: 'Done',
      retainedData: 'Fees kept', fulfilmentConfirmed: true,
    });
    expect(component.selectedIsOpen).toBeFalse();
    expect(component.canSave).toBeFalse();
  });
});
