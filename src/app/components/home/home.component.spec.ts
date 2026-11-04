import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { HomeComponent } from './home.component';
import { AuthService } from '../../auth/auth.service';
import { AuthStateService } from '../../auth/auth-state.service';
import { LoggerService } from '../../services/logger.service';
import { PushNotificationService } from '../../services/push-notification.service';
import { DemoService } from '../../services/demo.service';
import { ToastService } from '../../services/toast.service';
import { TenantService } from '../../services/tenant.service';
import { PRIVACY_POLICY_URL } from '../../utils/legal-links';

describe('HomeComponent privacy policy link', () => {
  let fixture: ComponentFixture<HomeComponent>;

  function create(tenant: Partial<TenantService>): void {
    TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [
        { provide: AuthService, useValue: jasmine.createSpyObj('AuthService', ['login']) },
        { provide: AuthStateService, useValue: jasmine.createSpyObj('AuthStateService', { isLoggedIn: false, mustChangePassword: false }) },
        { provide: Router, useValue: jasmine.createSpyObj('Router', ['navigate', 'navigateByUrl']) },
        { provide: LoggerService, useValue: jasmine.createSpyObj('LoggerService', ['log', 'error']) },
        { provide: PushNotificationService, useValue: jasmine.createSpyObj('PushNotificationService', ['init']) },
        { provide: DemoService, useValue: jasmine.createSpyObj('DemoService', ['submit']) },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['warning', 'error', 'success']) },
        { provide: TenantService, useValue: { slug: null, school: null, clearSchool: () => {}, ...tenant } },
      ],
    });
    fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
  }

  const links = (): HTMLButtonElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('[data-testid="login-privacy-link"]'));

  it('is on the generic sign-in page and inside its sign-in sheet, and opens in the browser', () => {
    create({ isBranded: false } as Partial<TenantService>);
    expect(links().length).toBe(1);

    (fixture.nativeElement.querySelector('.gl-signin-btn') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(links().length).toBe(2);

    const open = spyOn(window, 'open');
    links()[1].click();
    expect(open).toHaveBeenCalledWith(PRIVACY_POLICY_URL, '_blank', 'noopener');
  });

  it('is on the school-branded sign-in card', () => {
    create({ isBranded: true, slug: 'greenfield', school: { name: 'Greenfield Public School', themeColor: '#0f766e' } } as unknown as Partial<TenantService>);
    expect(links().length).toBe(1);
    expect(links()[0].textContent).toContain('Privacy Policy');
  });
});
