import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { SchoolPaymentConnectionComponent } from './school-payment-connection.component';
import { PaymentGatewayService } from '../../services/payment-gateway.service';
import { AuthStateService } from '../../auth/auth-state.service';
import { ToastService } from '../../services/toast.service';
import { LoggerService } from '../../services/logger.service';
import { SchoolPaymentGateway, SchoolPaymentGatewayOverview, SchoolPaymentSetupDetails } from '../../interfaces/payment-gateway';

describe('SchoolPaymentConnectionComponent (Connect Razorpay)', () => {
  let fixture: ComponentFixture<SchoolPaymentConnectionComponent>;
  let c: SchoolPaymentConnectionComponent;
  let api: any;
  let toast: any;
  let overview: SchoolPaymentGatewayOverview;

  const SECURITY_CODE = 'Gen3rated-Security_Code-0123456789abcdefghij';
  const CONNECTION_URL = 'https://edunexify.co.in/api/webhooks/razorpay/tok-abc';

  const gateway = (over: Partial<SchoolPaymentGateway> = {}): SchoolPaymentGateway => ({
    id: 7, schoolId: 1, schoolName: 'Green Valley', provider: 'RAZORPAY', maskedKeyId: 'rzp_live_••••3456',
    liveMode: true, status: 'PENDING', submittedBy: 'Admin_IAS_2008_1', submittedAt: '2026-10-06T10:00:00',
    verifiedAt: '2026-10-06T10:00:00', activatedAt: null, activatedBy: null, retiredAt: null, rejectedAt: null,
    statusReason: null, lastWebhookAt: null, setupConfirmedAt: null, ...over,
  });

  const baseOverview = (over: Partial<SchoolPaymentGatewayOverview> = {}): SchoolPaymentGatewayOverview => ({
    route: 'UNAVAILABLE', platformFallbackUntil: null, requireLiveKeys: true, encryptionConfigured: true, gateways: [], ...over,
  });

  const setup = (): SchoolPaymentSetupDetails => ({
    gatewayId: 7, connectionUrl: CONNECTION_URL, securityCode: SECURITY_CODE,
    razorpayEvents: ['payment.captured', 'refund.processed', 'refund.failed'],
  });

  beforeEach(async () => {
    overview = baseOverview();
    api = {
      getOverview: jasmine.createSpy().and.callFake(() => of(overview)),
      submit: jasmine.createSpy().and.callFake(() => of({ gateway: gateway(), setup: setup() })),
      getSetupDetails: jasmine.createSpy().and.callFake(() => of(setup())),
      confirmSetup: jasmine.createSpy().and.callFake(() => of(gateway({ setupConfirmedAt: '2026-10-06T10:05:00' }))),
    };
    toast = jasmine.createSpyObj('ToastService', ['success', 'error', 'warning', 'info']);
    await TestBed.configureTestingModule({
      imports: [SchoolPaymentConnectionComponent],
      providers: [
        { provide: PaymentGatewayService, useValue: api },
        { provide: AuthStateService, useValue: { getUser: () => ({ userId: 'Admin_IAS_2008_1', role: 'ADMIN' }) } },
        { provide: ToastService, useValue: toast },
        { provide: LoggerService, useValue: jasmine.createSpyObj('LoggerService', ['error']) },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(SchoolPaymentConnectionComponent);
    c = fixture.componentInstance;
  });

  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent ?? '';
  const q = (sel: string) => el().querySelector(sel) as HTMLElement | null;
  const click = (sel: string) => { (q(sel) as HTMLElement).click(); fixture.detectChanges(); };
  const clickText = (label: string) => {
    const btn = Array.from(el().querySelectorAll('button, a')).find(b => b.textContent?.trim().startsWith(label)) as HTMLElement;
    expect(btn).withContext(`button "${label}"`).toBeTruthy();
    btn.click();
    fixture.detectChanges();
  };
  const type = (sel: string, value: string) => {
    const input = q(sel) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const submitForm = (testId: string) => {
    (q(`[data-testid="${testId}"]`) as HTMLFormElement).dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  };

  /** Words a school admin should never meet outside the exact Razorpay instructions. */
  const JARGON = /webhook|gateway|callback|token|payment\.captured|refund\.|PENDING|ACTIVE|RETIRED|REJECTED|pricing|secret key|api key/i;

  // ── initial state ─────────────────────────────────────────────────────────

  it('starts simple: "Not connected" and one "Connect Razorpay" button — no fields, no technical words', () => {
    fixture.detectChanges();
    expect(q('[data-testid="connection-status"]')?.textContent).toContain('Not connected');
    expect(q('[data-testid="connect"]')?.textContent).toContain('Connect Razorpay');
    expect(text()).toContain('Let parents pay school fees online');
    expect(el().querySelectorAll('input').length).toBe(0);
    expect(text()).not.toMatch(JARGON);
  });

  it('tells the school setup is unavailable (instead of a broken form) when the server cannot store keys', () => {
    overview = baseOverview({ encryptionConfigured: false });
    fixture.detectChanges();
    expect(q('[data-testid="state-unavailable"]')).not.toBeNull();
    expect(q('[data-testid="connect"]')).toBeNull();
  });

  // ── wizard ────────────────────────────────────────────────────────────────

  it('walks through the steps with Back and Cancel, keeping Razorpay keys and the password on separate steps', async () => {
    fixture.detectChanges();
    click('[data-testid="connect"]');
    expect(q('[data-testid="step-1"]')).not.toBeNull();
    expect(text()).toContain('Open your school\'s Razorpay account');
    const dashboardLink = q('a[href="https://dashboard.razorpay.com/"]') as HTMLAnchorElement;
    expect(dashboardLink.target).toBe('_blank');
    expect(dashboardLink.rel).toContain('noopener');
    expect(el().querySelectorAll('input').length).toBe(0);

    clickText('I\'m ready');
    expect(q('[data-testid="step-2"]')).not.toBeNull();
    expect(q('#pcRzpKeyId')).not.toBeNull();
    expect(q('#pcRzpKeySecret')).not.toBeNull();
    expect(q('[data-testid="step-2"] input[type="password"]')).toBeNull();
    expect(text()).not.toMatch(/webhook|security code/i);

    await fixture.whenStable();
    type('#pcRzpKeyId', 'rzp_live_AbCdEf123456');
    type('#pcRzpKeySecret', 'LiveSecretAbc123456789XY');
    submitForm('step-2');
    expect(q('[data-testid="step-3"]')).not.toBeNull();
    expect(q('#pcRzpKeyId')).toBeNull();   // keys are not on the password step

    clickText('Back');
    expect(q('[data-testid="step-2"]')).not.toBeNull();
    clickText('Back');
    expect(q('[data-testid="step-1"]')).not.toBeNull();
    clickText('Cancel');
    expect(q('[data-testid="wizard"]')).toBeNull();
    expect(c.keyId).toBe('');
    expect(c.keySecret).toBe('');
  });

  it('checks the Key ID format and refuses a test key before asking for the password', async () => {
    fixture.detectChanges();
    c.startWizard(); c.ready(); fixture.detectChanges();
    await fixture.whenStable();

    type('#pcRzpKeyId', 'Admin_IAS_2008_1');
    type('#pcRzpKeySecret', 'LiveSecretAbc123456789XY');
    submitForm('step-2');
    expect(q('[data-testid="step-2"]')).not.toBeNull();
    expect(text()).toContain('doesn\'t look like a Razorpay Key ID');

    type('#pcRzpKeyId', 'rzp_test_AbCdEf123456');
    submitForm('step-2');
    expect(text()).toContain('This is a test key');
    expect(api.submit).not.toHaveBeenCalled();
  });

  // ── autofill semantics ────────────────────────────────────────────────────

  it('never gives the Razorpay fields login/password semantics, so password managers leave them alone', () => {
    fixture.detectChanges();
    c.startWizard(); c.ready(); fixture.detectChanges();
    const form = q('[data-testid="step-2"]') as HTMLFormElement;
    const keyId = q('#pcRzpKeyId') as HTMLInputElement;
    const keySecret = q('#pcRzpKeySecret') as HTMLInputElement;

    expect(form.getAttribute('autocomplete')).toBe('off');
    expect(Array.from(form.querySelectorAll('input')).map(i => i.type)).toEqual(['text', 'text']);
    for (const input of [keyId, keySecret]) {
      expect(input.type).toBe('text');
      expect(input.getAttribute('autocomplete')).toBe('off');
      expect(input.name).not.toMatch(/user|login|email|pass/i);
      expect(input.id).not.toMatch(/user|login|email|pass/i);
      expect(input.getAttribute('spellcheck')).toBe('false');
      expect(input.getAttribute('data-1p-ignore')).toBe('true');
      expect(input.getAttribute('data-lpignore')).toBe('true');
    }
    expect(keyId.value).toBe('');   // nothing pre-filled
  });

  it('puts the Edunexify password in its own form with proper username/current-password semantics', () => {
    fixture.detectChanges();
    c.startWizard(); c.ready(); c.keyId = 'rzp_live_AbCdEf123456'; c.keySecret = 'LiveSecretAbc123456789XY';
    c.continueFromKeys(); fixture.detectChanges();
    const form = q('[data-testid="step-3"]') as HTMLFormElement;
    const username = form.querySelector('input[autocomplete="username"]') as HTMLInputElement;
    const password = form.querySelector('input[type="password"]') as HTMLInputElement;

    expect(username.value).toBe('Admin_IAS_2008_1');
    expect(username.readOnly).toBeTrue();
    expect(username.tabIndex).toBe(-1);
    expect(password.getAttribute('autocomplete')).toBe('current-password');
    expect(form.querySelectorAll('input').length).toBe(2);
  });

  // ── verification → finish setup ───────────────────────────────────────────

  const goToStep3 = () => {
    fixture.detectChanges();
    c.startWizard(); c.ready(); c.keyId = ' rzp_live_AbCdEf123456 '; c.keySecret = 'LiveSecretAbc123456789XY';
    c.continueFromKeys(); fixture.detectChanges();
  };

  it('verifies with the server (no security code chosen by the school) and moves to "Finish Razorpay setup"', async () => {
    goToStep3();
    await fixture.whenStable();
    type('#pcPassword', 'right');
    submitForm('step-3');

    expect(api.submit).toHaveBeenCalledWith({ keyId: 'rzp_live_AbCdEf123456', keySecret: 'LiveSecretAbc123456789XY', currentPassword: 'right' });
    expect(Object.keys(api.submit.calls.mostRecent().args[0])).not.toContain('webhookSecret');
    expect(q('[data-testid="step-4"]')).not.toBeNull();
    expect(text()).toContain('Finish Razorpay setup');
    expect(text()).toContain('Razorpay needs one final connection');
    expect(c.keySecret).toBe('');
    expect(c.password).toBe('');
  });

  it('shows the generated Connection URL and a masked Security code with copy buttons and exact Razorpay steps', () => {
    goToStep3();
    c.password = 'right';
    c.verify(); fixture.detectChanges();

    expect(q('[data-testid="connection-url"]')?.textContent).toContain(CONNECTION_URL);
    expect(q('[data-testid="security-code"]')?.textContent).not.toContain(SECURITY_CODE);
    clickText('Show');
    expect(q('[data-testid="security-code"]')?.textContent).toContain(SECURITY_CODE);
    const steps = q('[data-testid="razorpay-instructions"]')!.textContent!;
    expect(steps).toContain('Account & Settings → Webhooks');
    expect(steps).toContain('Add New Webhook');
    expect(steps).toContain('Webhook URL');
    expect(steps).toContain('Secret');
    expect(steps).toContain('payment.captured');
    expect(steps).toContain('refund.processed');
    expect(steps).toContain('refund.failed');
    expect(steps).toContain('Create Webhook');
    // The headline is not "webhook configuration".
    expect(el().querySelector('[data-testid="step-4"] .pc-step-title')!.textContent).not.toMatch(/webhook/i);
  });

  it('copies the Security code to the clipboard', async () => {
    const write = spyOn(navigator.clipboard, 'writeText').and.returnValue(Promise.resolve());
    goToStep3();
    c.password = 'right';
    c.verify(); fixture.detectChanges();

    clickText('Copy');   // Connection URL
    expect(write).toHaveBeenCalledWith(CONNECTION_URL);
    const copyButtons = Array.from(el().querySelectorAll('button')).filter(b => b.textContent?.trim() === 'Copy') as HTMLElement[];
    copyButtons[1].click();
    expect(write).toHaveBeenCalledWith(SECURITY_CODE);
  });

  it('a wrong password keeps the keys and asks only for the password again', () => {
    api.submit.and.returnValue(throwError(() => ({ status: 403, error: { message: 'Your password is incorrect.' } })));
    goToStep3();
    c.password = 'wrong';
    c.verify(); fixture.detectChanges();

    expect(q('[data-testid="step-3"]')).not.toBeNull();
    expect(text()).toContain('Your password is incorrect.');
    expect(c.password).toBe('');
    expect(c.keyId.trim()).toBe('rzp_live_AbCdEf123456');
  });

  it('keys Razorpay refuses send the admin back to the keys, with the secret cleared', () => {
    api.submit.and.returnValue(throwError(() => ({ status: 400,
      error: { message: 'Razorpay didn\'t accept these keys. Check that you copied the Key ID and Key Secret from the same Live key.' } })));
    goToStep3();
    c.password = 'right';
    c.verify(); fixture.detectChanges();

    expect(q('[data-testid="step-2"]')).not.toBeNull();
    expect(text()).toContain('Razorpay didn\'t accept these keys');
    expect(c.keySecret).toBe('');
    expect(c.password).toBe('');
  });

  it('"I\'ve completed this in Razorpay" is recorded and the screen moves to waiting for approval', () => {
    goToStep3();
    c.password = 'right';
    c.verify(); fixture.detectChanges();
    overview = baseOverview({ gateways: [gateway({ setupConfirmedAt: '2026-10-06T10:05:00' })] });

    clickText('I\'ve completed this in Razorpay');

    expect(api.confirmSetup).toHaveBeenCalledWith(7);
    expect(q('[data-testid="step-4"]')).toBeNull();
    expect(c.setup).toBeNull();   // the code is no longer held in the page
    expect(q('[data-testid="state-waiting"]')).not.toBeNull();
  });

  // ── states after setup ────────────────────────────────────────────────────

  it('a verified account whose Razorpay setup isn\'t confirmed asks to finish it (password needed to see the code)', async () => {
    overview = baseOverview({ gateways: [gateway()] });
    fixture.detectChanges();
    expect(q('[data-testid="state-finish-setup"]')).not.toBeNull();
    expect(text()).not.toContain(SECURITY_CODE);

    clickText('Finish Razorpay setup');
    const form = q('[data-testid="reveal-form"]') as HTMLFormElement;
    expect(form.querySelector('input[autocomplete="current-password"]')).not.toBeNull();
    expect(form.querySelector('input[autocomplete="username"]')).not.toBeNull();
    expect(api.getSetupDetails).not.toHaveBeenCalled();

    await fixture.whenStable();
    type('#pcRevealPassword', 'right');
    submitForm('reveal-form');
    expect(api.getSetupDetails).toHaveBeenCalledWith(7, 'right');
    expect(q('[data-testid="step-4"]')).not.toBeNull();
    expect(c.revealPassword).toBe('');
  });

  it('a wrong password does not show the setup details', () => {
    api.getSetupDetails.and.returnValue(throwError(() => ({ status: 403, error: { message: 'Your password is incorrect.' } })));
    overview = baseOverview({ gateways: [gateway()] });
    fixture.detectChanges();
    c.askToReveal(overview.gateways[0]); c.revealPassword = 'wrong'; c.reveal(); fixture.detectChanges();

    expect(q('[data-testid="step-4"]')).toBeNull();
    expect(text()).toContain('Your password is incorrect.');
    expect(text()).not.toContain(SECURITY_CODE);
  });

  it('waiting for approval: plain words only', () => {
    overview = baseOverview({ gateways: [gateway({ setupConfirmedAt: '2026-10-06T10:05:00' })] });
    fixture.detectChanges();
    expect(q('[data-testid="connection-status"]')?.textContent).toContain('Waiting for approval');
    expect(text()).toContain('We\'re reviewing your Razorpay connection. Online payments will become available after approval.');
    expect(text()).not.toMatch(JARGON);
  });

  it('connected: masked account, connected date and payment-confirmation status — nothing internal', () => {
    overview = baseOverview({ route: 'SCHOOL_GATEWAY', gateways: [gateway({ status: 'ACTIVE', activatedAt: '2026-10-02T09:00:00',
      lastWebhookAt: '2026-10-05T11:30:00', setupConfirmedAt: '2026-10-01T10:00:00' })] });
    fixture.detectChanges();
    expect(q('[data-testid="connection-status"]')?.textContent).toContain('Connected');
    expect(text()).toContain('Parents can now pay fees directly to your school through Razorpay.');
    expect(text()).toContain('rzp_live_••••3456');
    expect(text()).toContain('2 Oct 2026');
    expect(q('[data-testid="confirmations"]')?.textContent).toContain('Working');
    expect(text()).not.toMatch(JARGON);
  });

  it('connected but no payment yet: confirmations explained as normal, not as an error', () => {
    overview = baseOverview({ route: 'SCHOOL_GATEWAY', gateways: [gateway({ status: 'ACTIVE', activatedAt: '2026-10-02T09:00:00' })] });
    fixture.detectChanges();
    expect(q('[data-testid="confirmations"]')?.textContent).toContain('updates after the first online payment');
  });

  it('a connected account can show its setup again after the password, and "done" changes nothing', () => {
    overview = baseOverview({ route: 'SCHOOL_GATEWAY', gateways: [gateway({ status: 'ACTIVE', activatedAt: '2026-10-02T09:00:00' })] });
    fixture.detectChanges();
    c.askToReveal(overview.gateways[0]); c.revealPassword = 'right'; c.reveal(); fixture.detectChanges();
    expect(q('[data-testid="step-4"]')).not.toBeNull();

    clickText('I\'ve completed this in Razorpay');
    expect(api.confirmSetup).not.toHaveBeenCalled();
    expect(q('[data-testid="state-connected"]')).not.toBeNull();
  });

  it('not approved: the reason in plain words and a way to connect again', () => {
    overview = baseOverview({ gateways: [gateway({ status: 'REJECTED', rejectedAt: '2026-10-06T12:00:00',
      statusReason: 'The Razorpay account belongs to a different organisation' })] });
    fixture.detectChanges();
    expect(q('[data-testid="not-approved"]')?.textContent).toContain('wasn\'t approved: The Razorpay account belongs to a different organisation');
    expect(q('[data-testid="connect"]')).not.toBeNull();
    expect(text()).not.toContain('REJECTED');
  });

  it('temporary Edunexify account: explains the date and the convenience fee', () => {
    overview = baseOverview({ route: 'PLATFORM_FALLBACK', platformFallbackUntil: '2026-11-15' });
    fixture.detectChanges();
    expect(q('[data-testid="temporary-account"]')?.textContent).toContain('15 Nov 2026');
    expect(q('[data-testid="temporary-account"]')?.textContent).toContain('convenience fee');
    expect(q('[data-testid="connect"]')).not.toBeNull();
  });

  it('never renders internal ids, tokens or statuses from the overview', () => {
    overview = baseOverview({ route: 'SCHOOL_GATEWAY', gateways: [
      { ...gateway({ status: 'ACTIVE', activatedAt: '2026-10-02T09:00:00' }), webhookToken: 'tok-SHOULD-NOT-SHOW',
        gatewayAccountId: 991122, pricingVersion: 'SCHOOL_GATEWAY_V1' } as any,
      gateway({ id: 3, status: 'RETIRED', maskedKeyId: 'rzp_live_••••0000' }),
    ] });
    fixture.detectChanges();
    expect(text()).not.toContain('tok-SHOULD-NOT-SHOW');
    expect(text()).not.toContain('991122');
    expect(text()).not.toContain('SCHOOL_GATEWAY_V1');
    expect(text()).not.toContain('rzp_live_••••0000');   // previous connections stay out of the school's view
  });
});
