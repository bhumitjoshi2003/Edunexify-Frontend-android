import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { AuthService } from '../../auth/auth.service';
import { AuthStateService } from '../../auth/auth-state.service';
import { Router } from '@angular/router';
import { LoggerService } from '../../services/logger.service';
import { PushNotificationService } from '../../services/push-notification.service';
import { TenantService } from '../../services/tenant.service';

import { FormsModule } from '@angular/forms';
import { DemoService } from '../../services/demo.service';
import { Subject, takeUntil, timeout, TimeoutError } from 'rxjs';

import { ToastService } from '../../services/toast.service';
import { consumeIntendedRoute, clearIntendedRoute } from '../../auth/redirect-url.util';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HomeComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  authenticated    = false;
  showLoginForm    = false;
  showDemoForm     = false;
  showForgotForm   = false;
  userId   = '';
  password = '';
  hidePassword = true;

  forgotUserId  = '';
  forgotEmail   = '';
  sendingReset  = false;
  sendingDemo   = false;

  demo = {
    schoolName:   '',
    contactName:  '',
    email:        '',
    phone:        '',
    students:     '',
    city:         '',
    message:      ''
  };

  constructor(
    private authService: AuthService,
    private authStateService: AuthStateService,
    private router: Router,
    private logger: LoggerService,
    private cdr: ChangeDetectorRef,
    private pushNotificationService: PushNotificationService,
    private demoService: DemoService,
    private toast: ToastService,
    public tenantService: TenantService
  ) { }

  ngOnInit() {
    // Bootstrap/AuthStateService is the authoritative source of truth for whether a session
    // exists — this component only ever reacts to an ALREADY-settled isLoggedIn(), it never
    // itself decides or repairs auth state. Honors a saved redirectUrl (set by a guard, or by
    // AuthInterceptor before an authoritative logout) so a user who ends up here mid-session —
    // then recovers, whether by logging back in or simply because a later check confirms the
    // session was fine all along — returns to the page they were using, not always /dashboard.
    if (this.authStateService.isLoggedIn()) {
      this.authenticated = true;
      if (this.authStateService.mustChangePassword()) {
        this.router.navigate(['/change-initial-password']);
      } else {
        this.router.navigateByUrl(consumeIntendedRoute());
      }
    }
  }

  changeSchool() {
    this.tenantService.clearSchool();
    this.showForgotForm = false;
    this.userId   = '';
    this.password = '';
    this.cdr.markForCheck();
  }

  getInitials(name?: string | null): string {
    if (!name) return '?';
    return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }

  login() {
    this.showLoginForm = true;
  }

  cancelLogin() {
    this.showLoginForm = false;
  }

  submitLogin() {
    if (!this.userId.trim() || !this.password.trim()) {
      this.toast.warning('Missing Information', 'Please enter your User ID and Password.');
      return;
    }

    // Capture slug now — this is the school whose branded page the user is on (null on generic page)
    const brandedSlug = this.tenantService.slug;

    this.authService.login(this.userId, this.password, brandedSlug).pipe(takeUntil(this.destroy$)).subscribe({
      next: (response) => {
        // Option A — frontend safety net: if on a branded page, verify the logged-in
        // user actually belongs to this school before setting any app state.
        // The backend (Option B) already rejects mismatches with 403, so this only
        // fires if something slips through.
        if (brandedSlug && response.schoolSlug && response.schoolSlug !== brandedSlug) {
          this.authService.logout().pipe(takeUntil(this.destroy$)).subscribe();
          this.toast.error('Wrong School', 'This account does not belong to this school. Please use the correct login page.');
          return;
        }

        this.authStateService.setUser(response);

        // If school slug is not stored yet but the login response carries one,
        // resolve and store it so the X-School-Slug header is sent on all subsequent requests.
        const afterSchool = (response.schoolSlug && !this.tenantService.slug)
          ? this.tenantService.lookupSchool(response.schoolSlug).then(info => {
              if (info) this.tenantService.setSchool(response.schoolSlug!, info);
            })
          : Promise.resolve();

        afterSchool.then(() => {
          this.authenticated = true;
          this.showLoginForm = false;
          this.cdr.markForCheck();

          this.pushNotificationService.init();

          // First-login (or admin-reset) accounts land on the mandatory password-change
          // page instead of the dashboard — enforced server-side too (JwtAuthFilter).
          if (response.mustChangePassword) {
            clearIntendedRoute();
            this.router.navigateByUrl('/change-initial-password');
            return;
          }

          this.router.navigateByUrl(consumeIntendedRoute());
        });
      },
      error: (error) => {
        let text: string;
        if (error.status === 0) {
          text = 'Cannot reach the server. Please check your internet connection.';
        } else if (error.status === 403) {
          text = typeof error.error === 'string' && error.error.length < 200
            ? error.error
            : 'Access denied. Please contact support.';
        } else {
          text = 'Incorrect User ID or Password.';
        }
        this.toast.error('Login Failed', text);
        this.logger.error('Login error:', error);
      }
    });
  }

  logout() {
    this.authService.logout().pipe(takeUntil(this.destroy$)).subscribe({
      next: () => { this.authenticated = false; this.cdr.markForCheck(); },
      error: () => { this.authenticated = false; this.cdr.markForCheck(); }
    });
  }

  openDemo() {
    this.showDemoForm = true;
    this.cdr.markForCheck();
  }

  closeDemo() {
    this.showDemoForm = false;
    this.cdr.markForCheck();
  }

  submitDemo() {
    const { schoolName, contactName, email, phone } = this.demo;
    if (!schoolName.trim() || !contactName.trim() || !email.trim() || !phone.trim()) {
      this.toast.warning('Required Fields', 'Please fill in School Name, Contact Name, Email and Phone.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      this.toast.warning('Invalid Email', 'Please enter a valid email address.');
      return;
    }

    this.sendingDemo = true;
    this.cdr.markForCheck();

    this.demoService.submitRequest({
      schoolName:       this.demo.schoolName.trim(),
      contactName:      this.demo.contactName.trim(),
      email:            this.demo.email.trim(),
      phone:            this.demo.phone.trim(),
      numberOfStudents: this.demo.students.trim() || undefined,
      city:             this.demo.city.trim() || undefined,
      message:          this.demo.message.trim() || undefined
    }).pipe(timeout(20000), takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.sendingDemo = false;
        this.showDemoForm = false;
        this.demo = { schoolName: '', contactName: '', email: '', phone: '', students: '', city: '', message: '' };
        this.cdr.markForCheck();
        this.toast.confirm({ title: 'Demo Request Received!', html: '<p style="color:#64748b;font-size:.88rem;line-height:1.6">Thank you! Our team will reach out within <strong style="color:#1e3a5f">24 hours</strong> to schedule your personalised demo.</p>', confirmText: 'Awesome, Thanks!', icon: 'success' });
      },
      error: (err) => {
        this.sendingDemo = false;
        this.cdr.markForCheck();
        this.logger.error('Demo request failed:', err);
        const isTimeout = err instanceof TimeoutError;
        isTimeout
          ? this.toast.error('Request Timed Out', 'The server took too long to respond. Please check your connection and try again.')
          : this.toast.error('Submission Failed', 'Could not send your request. Please try again or contact us directly.');
      }
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  togglePasswordVisibility() {
    this.hidePassword = !this.hidePassword;
  }

  forgotPassword() {
    this.showLoginForm  = false;
    this.forgotUserId   = '';
    this.forgotEmail    = '';
    this.sendingReset   = false;
    this.showForgotForm = true;
    this.cdr.markForCheck();
  }

  cancelForgot() {
    this.showForgotForm = false;
    this.cdr.markForCheck();
  }

  submitForgot() {
    const uid   = this.forgotUserId.trim();
    const email = this.forgotEmail.trim();
    if (!uid || !email) {
      this.toast.warning('Required', 'Please enter both your User ID and registered email.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.toast.warning('Invalid Email', 'Please enter a valid email address.');
      return;
    }

    this.sendingReset = true;
    this.cdr.markForCheck();

    this.authService.requestPasswordReset(uid, email).pipe(takeUntil(this.destroy$)).subscribe({
      next: (response: any) => {
        this.sendingReset   = false;
        this.showForgotForm = false;
        this.cdr.markForCheck();
        this.toast.confirm({
          title: 'Check Your Email',
          html: `<p style="color:#64748b;font-size:.88rem;line-height:1.6">If the User ID and email match an account, a password reset link has been sent to <strong style="color:#1e3a5f">${email}</strong>. Check your inbox (and spam folder) and follow the link to set your new password.</p>`,
          confirmText: 'Got it!',
          icon: 'success',
        });
      },
      error: (error: any) => {
        this.sendingReset = false;
        this.cdr.markForCheck();
        this.toast.error('Could Not Send Link', error?.error || 'Please verify your User ID and registered email, then try again.');
      }
    });
  }
}

