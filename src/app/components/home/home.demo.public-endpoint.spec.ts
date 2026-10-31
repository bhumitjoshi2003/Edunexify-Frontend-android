import { fakeAsync, TestBed, tick, flush } from '@angular/core/testing';
import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { HomeComponent } from './home.component';
import { AuthInterceptor } from '../../auth/auth.interceptor';
import { AuthService } from '../../auth/auth.service';
import { AuthStateService } from '../../auth/auth-state.service';
import { LoggerService } from '../../services/logger.service';
import { TenantService } from '../../services/tenant.service';
import { ToastService } from '../../services/toast.service';
import { PushNotificationService } from '../../services/push-notification.service';
import { DemoService } from '../../services/demo.service';
import { environment } from '../../../environments/environment';

/**
 * End to end through the real DemoService and AuthInterceptor: a public visitor submitting the
 * Book a Demo form. Whatever the outcome, the button is usable again, the visitor is told what
 * happened, and no refresh-token call is made.
 */
describe('Home demo booking — public endpoint, every outcome', () => {
  let http: HttpTestingController;
  let toast: jasmine.SpyObj<ToastService>;
  const url = `${environment.apiUrl}/demo-requests`;

  function create() {
    const fixture = TestBed.createComponent(HomeComponent);
    const c = fixture.componentInstance;
    c.openDemo();
    c.demo = { schoolName: 'School', contactName: 'Principal', email: 'office@school.test', phone: '9999999999', students: '350', city: 'City', message: 'Hi' };
    fixture.detectChanges();
    return { fixture, c, button: () => fixture.nativeElement.querySelector('.lp-submit-teal') as HTMLButtonElement };
  }

  beforeEach(() => {
    toast = jasmine.createSpyObj('ToastService', ['warning', 'error', 'confirm', 'success']);
    TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true },
        { provide: AuthService, useValue: { refreshToken: () => { throw new Error('refresh must not run'); }, logout: () => of() } },
        { provide: AuthStateService, useValue: { isLoggedIn: () => false, clearUser: () => {}, getUserRole: () => '' } },
        { provide: Router, useValue: { navigate: jasmine.createSpy('navigate') } },
        { provide: LoggerService, useValue: { error: () => {} } },
        { provide: TenantService, useValue: { isBranded: false, slug: null } },
        { provide: ToastService, useValue: toast },
        { provide: PushNotificationService, useValue: { init: () => Promise.resolve() } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const finish = (f: { fixture: any }) => f.fixture.detectChanges();

  it('1. unauthenticated valid submission: success message, form closed, button reset', () => {
    const f = create();
    f.c.submitDemo(); finish(f);
    expect(f.c.sendingDemo).toBeTrue();
    expect(f.button().disabled).toBeTrue();
    http.expectOne(url).flush(JSON.stringify({ notificationSent: true }), { status: 201, statusText: 'Created' });
    finish(f);
    expect(f.c.sendingDemo).toBeFalse();
    expect(f.c.showDemoForm).toBeFalse();
    expect(toast.confirm).toHaveBeenCalledWith(jasmine.objectContaining({ title: 'Demo Request Received!' }));
  });

  it('2. invalid form: nothing is sent and the button never locks', () => {
    const f = create();
    f.c.demo.email = 'not-an-email';
    f.c.submitDemo(); finish(f);
    http.expectNone(url);
    expect(f.c.sendingDemo).toBeFalse();
    expect(f.button().disabled).toBeFalse();
    expect(toast.warning).toHaveBeenCalledWith('Invalid Email', jasmine.any(String));
  });

  it('3a. server 400: shows the server\'s reason, keeps the form, button usable', () => {
    const f = create();
    f.c.submitDemo();
    http.expectOne(url).flush(JSON.stringify({ message: 'Email is not valid' }), { status: 400, statusText: 'Bad Request' });
    finish(f);
    expect(f.c.sendingDemo).toBeFalse();
    expect(f.button().disabled).toBeFalse();
    expect(f.c.showDemoForm).toBeTrue();
    expect(toast.error).toHaveBeenCalledWith('Please Check Your Details', 'Email is not valid');
  });

  for (const status of [401, 403]) {
    it(`3b. server ${status}: no refresh, a clear error, button usable again`, () => {
      const f = create();
      f.c.submitDemo();
      http.expectOne(url).flush(JSON.stringify({ message: 'Token Expired' }), { status, statusText: 'x' });
      http.expectNone(`${environment.apiUrl}/auth/refresh-token`);
      finish(f);
      expect(f.c.sendingDemo).toBeFalse();
      expect(f.button().disabled).toBeFalse();
      expect(toast.error).toHaveBeenCalledWith('Submission Failed', jasmine.stringContaining('support@edunexify.co.in'));
    });
  }

  it('3c. server 429: asks the visitor to wait', () => {
    const f = create();
    f.c.submitDemo();
    http.expectOne(url).flush('', { status: 429, statusText: 'Too Many Requests' });
    expect(f.c.sendingDemo).toBeFalse();
    expect(toast.error).toHaveBeenCalledWith('Too Many Requests', jasmine.any(String));
  });

  it('4. server 5xx: apologises with a next step, button usable', () => {
    const f = create();
    f.c.submitDemo();
    http.expectOne(url).flush('boom', { status: 503, statusText: 'Service Unavailable' });
    finish(f);
    expect(f.c.sendingDemo).toBeFalse();
    expect(f.button().disabled).toBeFalse();
    expect(toast.error).toHaveBeenCalledWith('Something Went Wrong', jasmine.stringContaining('support@edunexify.co.in'));
  });

  it('5a. network failure: says so, button usable', () => {
    const f = create();
    f.c.submitDemo();
    http.expectOne(url).error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });
    finish(f);
    expect(f.c.sendingDemo).toBeFalse();
    expect(f.button().disabled).toBeFalse();
    expect(toast.error).toHaveBeenCalledWith('No Connection', jasmine.any(String));
  });

  it('5b. a request that never answers times out and resets the button', fakeAsync(() => {
    const f = create();
    f.c.submitDemo();
    http.expectOne(url);
    tick(20001);
    f.fixture.detectChanges();
    expect(f.c.sendingDemo).toBeFalse();
    expect(f.button().disabled).toBeFalse();
    expect(toast.error).toHaveBeenCalledWith('Request Timed Out', jasmine.stringContaining('before submitting again'));
    flush();
  }));

  it('6. double click while in flight sends one request only', () => {
    const f = create();
    f.button().click(); f.fixture.detectChanges();
    f.button().click();
    f.c.submitDemo();
    http.expectOne(url).flush(JSON.stringify({ notificationSent: true }), { status: 201, statusText: 'Created' });
    expect(f.c.sendingDemo).toBeFalse();
  });

  it('8. an unexpected exception while sending still resets the button', () => {
    const f = create();
    spyOn(TestBed.inject(DemoService), 'submitRequest').and.throwError('boom');
    f.c.submitDemo(); f.fixture.detectChanges();
    expect(f.c.sendingDemo).toBeFalse();
    expect(f.button().disabled).toBeFalse();
    expect(toast.error).toHaveBeenCalled();
  });

  it('7. loading state resets and the form can be submitted again after a failure', () => {
    const f = create();
    f.c.submitDemo();
    http.expectOne(url).flush('x', { status: 500, statusText: 'Server Error' });
    expect(f.c.sendingDemo).toBeFalse();
    f.c.submitDemo();
    expect(f.c.sendingDemo).toBeTrue();
    http.expectOne(url).flush(JSON.stringify({ notificationSent: true }), { status: 201, statusText: 'Created' });
    expect(f.c.sendingDemo).toBeFalse();
    expect(toast.confirm).toHaveBeenCalled();
  });
});
