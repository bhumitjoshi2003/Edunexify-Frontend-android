import { Subject, takeUntil, finalize } from 'rxjs';
import { adminProfileError, normalizeAdminProfile, adminDomainError } from '../../utils/admin-validation.util';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { Router } from '@angular/router';
import { AdminService } from '../../services/admin.service';
import { SchoolService, SchoolSettings } from '../../services/school.service';
import { AuthStateService } from '../../auth/auth-state.service';
import { ToastService } from '../../services/toast.service';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, OnDestroy } from '@angular/core';

@Component({
  selector: 'app-register-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './register-admin.component.html',
  styleUrl: './register-admin.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RegisterAdminComponent implements OnInit, OnDestroy {
  submitting = false;
  private destroy$ = new Subject<void>();
  adminData = {
    adminId: '',
    name: '',
    email: '',
    phoneNumber: '',
    gender: '',
    dob: '',
    schoolId: null as number | null
  };

  isSuperAdmin = false;
  schools: SchoolSettings[] = [];
  schoolsLoading = false;

  constructor(
    private adminService: AdminService,
    private schoolService: SchoolService,
    private authState: AuthStateService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private toast: ToastService
  ) {}

  ngOnInit(): void {
    this.isSuperAdmin = this.authState.getUserRole() === 'SUPER_ADMIN';
    if (this.isSuperAdmin) {
      this.schoolsLoading = true;
      this.schoolService.listAllSchools().pipe(takeUntil(this.destroy$)).subscribe({
        next: (schools) => {
          this.schools = schools.filter(s => s.active);
          this.schoolsLoading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.schoolsLoading = false;
          this.cdr.markForCheck();
          this.toast.error('Error', 'Failed to load school list.');
        }
      });
    }
  }

  schoolLabel(school: SchoolSettings): string {
    return `${school.name}  ·  ${school.slug}`;
  }

  onSubmit(form: NgForm): void {
    if (this.submitting) return;
    if (form.invalid) {
      Object.values(form.controls).forEach(control => control.markAsTouched());
      this.toast.error('Form Invalid', 'Please fill in all required fields correctly.');
      return;
    }

    if (this.isSuperAdmin && !this.adminData.schoolId) {
      this.toast.warning('Validation Error', 'Please select a school for this admin.');
      return;
    }

    const validation = adminProfileError(this.adminData);
    if (validation) { this.toast.error('Validation', validation); return; }
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(this.adminData.adminId.trim())) {
      this.toast.error('Validation', 'Admin ID must contain 1–100 letters, digits, dots, underscores or hyphens.'); return;
    }
    const payload = { ...this.adminData, ...normalizeAdminProfile(this.adminData), adminId: this.adminData.adminId.trim() };
    this.submitting = true;
    this.adminService.createAdmin(payload as any).pipe(takeUntil(this.destroy$), finalize(() => {
      this.submitting = false; this.cdr.markForCheck();
    })).subscribe({
      next: () => {
        this.toast.success('Success!', 'Administrator registered. They must use the emailed setup link to set a password. If the email does not arrive, use Forgot password with their ID and email.');
        this.router.navigate(['/dashboard/admin-list']);
      },
      error: (err) => {
        this.toast.error('Error', adminDomainError(err));
      }
    });
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  cancel(): void {
    this.router.navigate(['/dashboard/admin-list']);
  }
}