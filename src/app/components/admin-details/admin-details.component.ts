import { adminProfileError, adminDomainError } from '../../utils/admin-validation.util';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AdminService } from '../../services/admin.service';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { FormsModule, NgForm } from '@angular/forms';
import { AuthService } from '../../auth/auth.service';
import { AuthStateService } from '../../auth/auth-state.service';
import { ToastService } from '../../services/toast.service';
import { setupLinkError, setupLinkFeedback } from '../../utils/school-admin.util';
import { environment } from '../../../environments/environment';
import { passwordPolicyViolation } from '../../utils/password-policy.util';

interface Admin {
  adminId: string;
  name: string;
  email: string;
  phoneNumber: string;
  dob: string;
  gender: string;
  photoUrl?: string;
}

@Component({
  selector: 'app-admin-details',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-details.component.html',
  styleUrl: './admin-details.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdminDetailsComponent implements OnInit, OnDestroy {
  adminId: string = '';
  adminDetails: Admin | null = null;
  updatedDetails: Admin | null = null;

  loggedInUserRole: string = '';
  loggedInUserId: string = '';
  isEditing: boolean = false;
  isNewAdmin: boolean = false;

  // Change-password modal state
  showPasswordModal = false;
  cpOldPw = '';
  cpNewPw = '';
  cpConfirmPw = '';
  cpShowOld = false;
  cpShowNew = false;
  cpShowConfirm = false;
  cpShowOldField = false;

  private ngUnsubscribe = new Subject<void>();

  /** A setup-link request is in flight (blocks a double click). */
  sendingSetupLink = false;

  // Photo upload state
  photoUploading = false;
  @ViewChild('photoInput') photoInput!: ElementRef<HTMLInputElement>;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private adminService: AdminService,
    private authService: AuthService,
    private authStateService: AuthStateService,
    private cdr: ChangeDetectorRef,
    private toast: ToastService
  ) { }

  ngOnInit(): void {
    const user = this.authStateService.getUser();
    if (user) {
      this.loggedInUserRole = user.role;
      this.loggedInUserId = user.userId;
    }

    this.route.params.pipe(takeUntil(this.ngUnsubscribe)).subscribe(params => {
      this.adminId = params['adminId'];
      if (this.adminId === 'new') {
        this.prepareCreateMode();
      } else if (this.adminId) {
        this.loadAdminDetails(this.adminId);
      }
    });
  }

  ngOnDestroy(): void {
    this.ngUnsubscribe.next();
    this.ngUnsubscribe.complete();
  }

  loadAdminDetails(id: string): void {
    this.adminService.getAdminById(id).pipe(takeUntil(this.ngUnsubscribe)).subscribe({
      next: (data) => {
        this.adminDetails = data;
        this.updatedDetails = { ...data };
        this.cdr.markForCheck();
      },
      error: () => this.toast.error('Error', 'Could not load admin details')
    });
  }

  prepareCreateMode(): void {
    if (this.loggedInUserRole !== 'SUPER_ADMIN') {
      this.router.navigate(['/dashboard/admin-list']);
      return;
    }
    this.isNewAdmin = true;
    this.isEditing = true;
    this.updatedDetails = { adminId: '', name: '', email: '', phoneNumber: '', dob: '', gender: '' };
  }

  canEdit(): boolean {
    return this.loggedInUserRole === 'SUPER_ADMIN' || this.loggedInUserId === this.adminId;
  }

  enableEditMode(): void {
    this.isEditing = true;
  }

  cancelEdit(): void {
    if (this.isNewAdmin) {
      this.router.navigate(['/dashboard/admin-list']);
    } else {
      this.isEditing = false;
      this.updatedDetails = { ...this.adminDetails! };
    }
  }

  saveAdmin(form: NgForm): void {
    if (form.invalid) {
      form.control.markAllAsTouched();
      this.toast.error('Error', 'Please correct the invalid fields.');
      return;
    }

    if (this.updatedDetails) {
      const error = adminProfileError(this.updatedDetails);
      if (error) { this.toast.error('Validation', error); return; }
    }
    const action = this.isNewAdmin
      ? this.adminService.createAdmin(this.updatedDetails!)
      : this.adminService.updateAdmin(this.adminId, this.updatedDetails!);

    this.toast.confirm({
      title: 'Confirm Save',
      message: 'Save administrator details?',
      icon: 'question',
      confirmText: 'Yes, Save',
      cancelText: 'Cancel',
    }).then((confirmed) => {
      if (confirmed) {
        action.pipe(takeUntil(this.ngUnsubscribe)).subscribe({
          next: (savedAdmin) => {
            this.adminDetails = savedAdmin;
            this.updatedDetails = { ...savedAdmin };
            this.isEditing = false;
            this.cdr.markForCheck();
            this.toast.success('Saved!', 'Admin details updated successfully.');
          },
          error: (err) => this.toast.error('Error', adminDomainError(err))
        });
      }
    });
  }

  openPasswordModal(): void {
    this.cpOldPw = '';
    this.cpNewPw = '';
    this.cpConfirmPw = '';
    this.cpShowOld = false;
    this.cpShowNew = false;
    this.cpShowConfirm = false;
    this.cpShowOldField = (this.loggedInUserId === this.adminId);
    this.showPasswordModal = true;
  }

  closePasswordModal(): void {
    this.showPasswordModal = false;
    this.cdr.markForCheck();
  }

  submitPasswordChange(): void {
    if (this.cpShowOldField && !this.cpOldPw) {
      this.toast.error('Error', 'Current password is required to verify identity.');
      return;
    }
    if (!this.cpNewPw || !this.cpConfirmPw) {
      this.toast.error('Error', 'New password and confirmation are required.');
      return;
    }
    // The backend's password rule (utils/password-policy.util.ts); the value is sent exactly as typed.
    const passwordError = passwordPolicyViolation(this.cpNewPw, 'New password');
    if (passwordError) {
      this.toast.error('Error', passwordError);
      return;
    }
    if (this.cpNewPw !== this.cpConfirmPw) {
      this.toast.error('Error', 'New passwords do not match.');
      return;
    }
    const isSuperAdminResettingOther = (this.loggedInUserRole === 'SUPER_ADMIN' && this.loggedInUserId !== this.adminId);
    const payload = {
      userId: this.adminId,
      oldPassword: this.cpOldPw,
      newPassword: this.cpNewPw,
      isAdministrativeReset: isSuperAdminResettingOther
    };
    this.authService.changePassword(payload).pipe(takeUntil(this.ngUnsubscribe)).subscribe({
      next: () => {
        this.closePasswordModal();
        this.toast.success('Success', 'Password updated successfully');
      },
      error: (err) => this.toast.error('Error', err.error || 'Failed to update password')
    });
  }

  deleteAdmin(): void {
    this.toast.confirm({
      title: 'Are you sure?',
      message: 'This action cannot be undone!',
      icon: 'warning',
      danger: true,
      confirmText: 'Yes, Delete Admin',
      cancelText: 'Cancel',
    }).then((confirmed) => {
      if (confirmed) {
        this.adminService.deleteAdmin(this.adminId).pipe(takeUntil(this.ngUnsubscribe)).subscribe({
          next: () => {
            this.toast.success('Deleted', 'Administrator removed.');
            this.router.navigate(['/dashboard/admin-list']);
          }
        });
      }
    });
  }

  /** Another administrator's account: a super admin (any school) or an admin (their own school —
   *  the server enforces it) may email them a fresh setup link instead of choosing a password. */
  canSendSetupLink(): boolean {
    return !this.isNewAdmin && !!this.adminId && this.loggedInUserId !== this.adminId
      && (this.loggedInUserRole === 'SUPER_ADMIN' || this.loggedInUserRole === 'ADMIN');
  }

  sendSetupLink(): void {
    if (!this.canSendSetupLink() || this.sendingSetupLink) return;
    this.sendingSetupLink = true;
    this.cdr.markForCheck();
    this.adminService.sendSetupLink(this.adminId).pipe(takeUntil(this.ngUnsubscribe)).subscribe({
      next: (result) => {
        this.sendingSetupLink = false;
        const feedback = setupLinkFeedback(result);
        feedback.level === 'success' ? this.toast.success(feedback.title, feedback.message) : this.toast.info(feedback.title, feedback.message);
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.sendingSetupLink = false;
        this.toast.error('Setup link not sent', setupLinkError(err));
        this.cdr.markForCheck();
      },
    });
  }

  canUploadPhoto(): boolean {
    return !this.isNewAdmin && (
      this.loggedInUserRole === 'SUPER_ADMIN' || this.loggedInUserId === this.adminId
    );
  }

  getInitials(): string {
    return this.adminDetails?.name?.charAt(0).toUpperCase() ?? '?';
  }

  getPhotoUrl(relativePath: string): string {
    if (relativePath.startsWith('http')) return relativePath;
    return `${environment.apiUrl}${relativePath}`;
  }

  triggerPhotoUpload(): void {
    this.photoInput?.nativeElement.click();
  }

  private static readonly ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

  onPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    input.value = '';

    if (!AdminDetailsComponent.ALLOWED_PHOTO_TYPES.includes(file.type)) {
      this.toast.error('Unsupported File Type', 'Profile photo must be a JPEG, PNG, or WebP image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.toast.error('File Too Large', 'Profile photo must be less than 5MB.');
      return;
    }

    this.photoUploading = true;
    this.cdr.markForCheck();

    // Direct-to-object-storage upload: bytes go straight from this browser to object storage,
    // never through our own backend — see AdminService.uploadAdminPhotoDirect.
    this.adminService.uploadAdminPhotoDirect(this.adminId, file).pipe(takeUntil(this.ngUnsubscribe)).subscribe({
      next: (res) => {
        if (this.adminDetails) {
          this.adminDetails = { ...this.adminDetails, photoUrl: res.displayUrl };
        }
        this.photoUploading = false;
        this.cdr.markForCheck();
        this.toast.success('Photo updated!');
      },
      error: () => {
        this.photoUploading = false;
        this.cdr.markForCheck();
        this.toast.error('Upload failed', 'Could not upload photo. Please try again.');
      }
    });
  }
}
