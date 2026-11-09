import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { SuperAdminPaymentGatewaysComponent } from './super-admin-payment-gateways.component';
import { PaymentGatewayService } from '../../services/payment-gateway.service';
import { SchoolService, SchoolSettings } from '../../services/school.service';
import { ToastService } from '../../services/toast.service';
import { LoggerService } from '../../services/logger.service';
import { SchoolPaymentGateway } from '../../interfaces/payment-gateway';

describe('SuperAdminPaymentGatewaysComponent', () => {
  let fixture: ComponentFixture<SuperAdminPaymentGatewaysComponent>;
  let c: SuperAdminPaymentGatewaysComponent;
  let gatewayService: any;
  let toast: any;

  const gateway = (over: Partial<SchoolPaymentGateway> = {}): SchoolPaymentGateway => ({
    id: 11, schoolId: 5, schoolName: 'Green Valley', provider: 'RAZORPAY', maskedKeyId: 'rzp_live_••••9876',
    liveMode: true, status: 'PENDING', submittedBy: 'gv_admin', submittedAt: '2026-10-05T09:00:00',
    verifiedAt: '2026-10-05T09:00:00', activatedAt: null, activatedBy: null, retiredAt: null, rejectedAt: null,
    statusReason: null, lastWebhookAt: null, setupConfirmedAt: null, ...over,
  });

  const school = (over: Partial<SchoolSettings> = {}): SchoolSettings => ({
    id: 5, name: 'Green Valley', slug: 'gv', address: null, city: null, state: null, pincode: null, phone: null,
    email: null, website: null, logoUrl: null, themeColor: null, contactPersonName: null, boardType: null, plan: null,
    maxStudents: null, expiryDate: null, active: true, razorpayConfigured: false, platformPaymentFallbackUntil: null,
    academicYearStartMonth: 4, workingDays: 'MONDAY', periodsPerDay: 8, gradingSystem: 'CBSE', ...over,
  });

  beforeEach(async () => {
    gatewayService = {
      list: jasmine.createSpy().and.callFake((status: string) =>
        of(status === 'PENDING' ? [gateway()] : [gateway({ id: 12, schoolId: 6, schoolName: 'Hill Top', status: 'ACTIVE',
          activatedAt: '2026-10-01T09:00:00', activatedBy: 'sa', lastWebhookAt: '2026-10-05T10:00:00' })])),
      activate: jasmine.createSpy().and.returnValue(of(gateway({ status: 'ACTIVE' }))),
      reject: jasmine.createSpy().and.returnValue(of(gateway({ status: 'REJECTED' }))),
      retire: jasmine.createSpy().and.returnValue(of(gateway({ status: 'RETIRED' }))),
      getPlatformFallbackPolicy: jasmine.createSpy().and.returnValue(of({ latestCutoff: '2026-11-15' })),
      setPlatformFallback: jasmine.createSpy().and.returnValue(of({ schoolId: 5, platformPaymentFallbackUntil: '2026-11-01' })),
    };
    toast = jasmine.createSpyObj('ToastService', ['success', 'error', 'warning', 'confirm', 'confirmWithReason']);
    await TestBed.configureTestingModule({
      imports: [SuperAdminPaymentGatewaysComponent],
      providers: [
        { provide: PaymentGatewayService, useValue: gatewayService },
        { provide: SchoolService, useValue: { listAllSchools: () => of([school(), school({ id: 6, name: 'Hill Top', razorpayConfigured: true })]) } },
        { provide: ToastService, useValue: toast },
        { provide: LoggerService, useValue: jasmine.createSpyObj('LoggerService', ['error']) },
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(SuperAdminPaymentGatewaysComponent);
    c = fixture.componentInstance;
    fixture.detectChanges();
  });

  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  it('lists pending and active gateways with masked keys, live badge and webhook state', () => {
    expect(fixture.nativeElement.querySelectorAll('[data-testid="pending-gateway"]').length).toBe(1);
    expect(fixture.nativeElement.querySelectorAll('[data-testid="active-gateway"]').length).toBe(1);
    expect(text()).toContain('rzp_live_••••9876');
    expect(text()).toContain('LIVE');
    expect(text()).toContain('none received yet');
    expect(text()).toContain('last valid one');
  });

  it("shows whether the school says it finished the Razorpay-side setup", () => {
    expect(fixture.nativeElement.querySelector('[data-testid="setup-confirmed"]').textContent)
      .toContain("School hasn't confirmed the Razorpay webhook setup yet");

    c.pending = [gateway({ setupConfirmedAt: '2026-10-06T10:05:00' })];
    fixture.componentRef.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="setup-confirmed"]').textContent)
      .toContain('School says the Razorpay webhook is set up');
  });

  it('takes the fallback cut-off from the server and limits the date picker with it', () => {
    expect(gatewayService.getPlatformFallbackPolicy).toHaveBeenCalled();
    expect(c.fallbackCutoff).toBe('2026-11-15');
    expect(fixture.nativeElement.querySelector('[data-testid="fallback-cutoff"]').textContent).toContain('15 Nov 2026');
    expect((fixture.nativeElement.querySelector('#fbUntil') as HTMLInputElement).getAttribute('max')).toBe('2026-11-15');
  });

  it('follows a different server cut-off instead of any built-in date', () => {
    gatewayService.getPlatformFallbackPolicy.and.returnValue(of({ latestCutoff: '2026-10-31' }));
    c.load();
    fixture.detectChanges();
    expect(c.fallbackCutoff).toBe('2026-10-31');
    expect((fixture.nativeElement.querySelector('#fbUntil') as HTMLInputElement).getAttribute('max')).toBe('2026-10-31');
    expect((SuperAdminPaymentGatewaysComponent as any).FALLBACK_LATEST_CUTOFF).toBeUndefined();

    jasmine.clock().install();
    jasmine.clock().mockDate(new Date(2026, 9, 6));
    try {
      c.fallbackSchoolId = 5;
      c.fallbackReason = 'KYC pending';
      c.fallbackUntil = '2026-11-01';
      c.saveFallback(false);
      expect(gatewayService.setPlatformFallback).not.toHaveBeenCalled();
      expect(toast.warning).toHaveBeenCalledWith('Validation', "The platform fallback can't run past 2026-10-31.");
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('activates only after confirmation and reloads', async () => {
    toast.confirm.and.returnValue(Promise.resolve(false));
    await c.activate(c.pending[0]);
    expect(gatewayService.activate).not.toHaveBeenCalled();

    toast.confirm.and.returnValue(Promise.resolve(true));
    await c.activate(c.pending[0]);
    expect(gatewayService.activate).toHaveBeenCalledWith(11);
    expect(gatewayService.list).toHaveBeenCalledTimes(4); // initial + reload, PENDING and ACTIVE each
  });

  it('shows the server reason when activation fails (e.g. Razorpay rejected the keys)', async () => {
    toast.confirm.and.returnValue(Promise.resolve(true));
    gatewayService.activate.and.returnValue(throwError(() => ({ status: 400, error: { message: 'Razorpay rejected this Key ID and Key Secret.' } })));
    await c.activate(c.pending[0]);
    expect(toast.error).toHaveBeenCalledWith('Not done', 'Razorpay rejected this Key ID and Key Secret.');
    expect(c.busyGatewayId).toBeNull();
  });

  it('reject and retire require a reason', async () => {
    toast.confirmWithReason.and.returnValue(Promise.resolve(null));
    await c.reject(c.pending[0]);
    await c.retire(c.active[0]);
    expect(gatewayService.reject).not.toHaveBeenCalled();
    expect(gatewayService.retire).not.toHaveBeenCalled();

    toast.confirmWithReason.and.returnValue(Promise.resolve('  Webhook missing  '));
    await c.reject(c.pending[0]);
    expect(gatewayService.reject).toHaveBeenCalledWith(11, 'Webhook missing');
    await c.retire(c.active[0]);
    expect(gatewayService.retire).toHaveBeenCalledWith(12, 'Webhook missing');
  });

  it('fallback requires a school, a reason, and a date no later than the global cut-off', () => {
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date(2026, 9, 6));
    try {
      checkFallbackValidation();
    } finally {
      jasmine.clock().uninstall();
    }
  });

  const checkFallbackValidation = () => {
    c.saveFallback(false);
    expect(gatewayService.setPlatformFallback).not.toHaveBeenCalled();

    c.fallbackSchoolId = 5;
    c.fallbackUntil = '2026-11-01';
    c.saveFallback(false);
    expect(gatewayService.setPlatformFallback).not.toHaveBeenCalled(); // no reason

    c.fallbackReason = 'KYC pending';
    c.fallbackUntil = '2026-11-16';
    c.saveFallback(false);
    expect(gatewayService.setPlatformFallback).not.toHaveBeenCalled(); // past cut-off
    expect(toast.warning).toHaveBeenCalledWith('Validation', "The platform fallback can't run past 2026-11-15.");
  };

  it('grants a fallback and reflects the saved date', () => {
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date(2026, 9, 6));
    try {
      c.fallbackSchoolId = 5;
      c.fallbackUntil = '2026-11-01';
      c.fallbackReason = ' KYC pending ';
      c.saveFallback(false);
      expect(gatewayService.setPlatformFallback).toHaveBeenCalledWith(5, '2026-11-01', 'KYC pending');
      expect(c.selectedSchool?.platformPaymentFallbackUntil).toBe('2026-11-01');
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('stops a fallback by sending null', () => {
    gatewayService.setPlatformFallback.and.returnValue(of({ schoolId: 5, platformPaymentFallbackUntil: null }));
    c.schools[0].platformPaymentFallbackUntil = '2026-11-01';
    c.fallbackSchoolId = 5;
    c.fallbackReason = 'Gateway approved';
    c.saveFallback(true);
    expect(gatewayService.setPlatformFallback).toHaveBeenCalledWith(5, null, 'Gateway approved');
    expect(c.schools.find(s => s.id === 5)?.platformPaymentFallbackUntil).toBeNull();
  });
});
