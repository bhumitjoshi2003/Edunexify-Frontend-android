import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, OnDestroy } from '@angular/core';
import { FormGroup, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { ToastService } from '../../services/toast.service';
import { ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { passwordPolicyValidator } from '../../utils/password-policy.util';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [RouterModule, ReactiveFormsModule, CommonModule],
  templateUrl: './reset-password.component.html',
  styleUrl: './reset-password.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ResetPasswordComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  resetForm: FormGroup;
  token: string | null = null;
  loading = false;
  hideNewPassword = true;
  hideConfirmPassword = true;
  resetToken: string | null = null;

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService,
    private cdr: ChangeDetectorRef,
    private toast: ToastService
  ) {
    this.resetForm = this.fb.group({
      newPassword: ['', [Validators.required, passwordPolicyValidator]],
      confirmPassword: ['', Validators.required]
    }, { validators: this.checkPasswordMatch });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  ngOnInit(): void {
    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(params => {
      this.resetToken = params['token'];
      if (!this.resetToken) {
        this.toast.confirm({
          title: 'Invalid Reset Link',
          message: 'The password reset link is invalid or missing.',
          icon: 'danger',
          confirmText: 'OK',
        }).then(() => {
          this.router.navigate(['/']);
        });
      }
    });
  }

  checkPasswordMatch(group: FormGroup) {
    const newPassword     = group.controls['newPassword'].value;
    const confirmPassword = group.controls['confirmPassword'].value;
    return newPassword === confirmPassword ? null : { passwordMismatch: true };
  }

  onSubmit() {
    if (this.resetForm.valid && this.resetToken) {
      this.loading = true;
      this.cdr.markForCheck();
      this.authService.resetPassword(this.resetToken, this.resetForm.value.newPassword).subscribe({
        next: (response: any) => {
          this.loading = false;
          this.cdr.markForCheck();
          this.toast.confirm({
            title: 'Password Reset Successful',
            message: response.message || 'Your password has been reset. You can now sign in with your new password.',
            icon: 'success',
            confirmText: 'Sign In',
          }).then(() => {
            this.router.navigate(['/']);
          });
        },
        error: (error: any) => {
          this.loading = false;
          this.cdr.markForCheck();
          this.toast.error('Password Reset Failed', error.error || 'The link may be invalid or expired. Please request a new reset link.');
        }
      });
    } else {
      this.resetForm.markAllAsTouched();
      this.cdr.markForCheck();
    }
  }

  toggleNewPasswordVisibility() {
    this.hideNewPassword = !this.hideNewPassword;
  }

  toggleConfirmPasswordVisibility() {
    this.hideConfirmPassword = !this.hideConfirmPassword;
  }
}
