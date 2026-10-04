import { CommonModule, Location } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { ChildAccess, ParentProfile } from '../../interfaces/parent-portal';
import { ParentPortalService } from '../../services/parent-portal.service';
import { ToastService } from '../../services/toast.service';
import { ParentAccessEditorComponent } from '../parent-access-editor/parent-access-editor.component';

@Component({
  selector: 'app-parent-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, ParentAccessEditorComponent],
  templateUrl: './parent-detail.component.html',
  styleUrl: './parent-detail.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ParentDetailComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly parentService = inject(ParentPortalService);
  private readonly toast = inject(ToastService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();

  parentId = '';
  profile: ParentProfile | null = null;
  loading = true;
  working = false;
  showAccessEditor = false;
  editingChild: ChildAccess | null = null;
  showResetPassword = false;
  resettingPassword = false;
  resetPasswordError: string | null = null;
  showEditDetails = false;
  savingDetails = false;
  detailsError: string | null = null;
  editDetails = { name: '', email: '', phoneNumber: '' };
  resendingSetupLink = false;

  ngOnInit(): void {
    this.parentId = this.route.snapshot.paramMap.get('parentId') ?? '';
    this.loadProfile();
  }
  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  loadProfile(): void {
    this.loading = true;
    this.parentService.getParent(this.parentId).pipe(takeUntil(this.destroy$)).subscribe({
      next: profile => { this.profile = profile; this.loading = false; this.cdr.markForCheck(); },
      error: () => {
        this.loading = false;
        this.cdr.markForCheck();
        this.toast.error('Could not open parent', 'This account may no longer exist.');
      },
    });
  }

  goBack(): void { this.location.back(); }

  startLinking(): void {
    if (this.profile && !this.profile.parent.active) {
      this.toast.warning('Parent account is disabled', 'Reactivate this parent account before linking a student.');
      return;
    }
    this.editingChild = null;
    this.showAccessEditor = true;
  }
  editChild(child: ChildAccess): void { this.editingChild = child; this.showAccessEditor = true; }
  cancelEdit(): void { this.showAccessEditor = false; this.editingChild = null; }

  onEditorSaved(profile: ParentProfile): void {
    this.profile = profile;
    this.showAccessEditor = false;
    this.editingChild = null;
    this.cdr.markForCheck();
  }

  /** Standard Parent Portal access — the 6 baseline permissions. */
  private isStandardAccess(access: {
    canViewAttendance: boolean; canViewFees: boolean; canPayFees: boolean;
    canViewResults: boolean; canViewTimetable: boolean; canManageLeave: boolean;
  }): boolean {
    return access.canViewAttendance && access.canViewFees && access.canPayFees
      && access.canViewResults && access.canViewTimetable && access.canManageLeave;
  }

  /** Compact permission summary for a linked-child row: "Standard Access" or "Custom Access" plus what differs. */
  accessSummary(child: ChildAccess): { standard: boolean; label: string; granted: string[] } {
    const standard = this.isStandardAccess(child);
    const granted: string[] = [];
    if (child.canViewAttendance) granted.push('Attendance');
    if (child.canViewFees) granted.push('Fees');
    if (child.canPayFees) granted.push('Payments');
    if (child.canViewResults) granted.push('Results');
    if (child.canViewTimetable) granted.push('Timetable');
    if (child.canManageLeave) granted.push('Leave');
    return { standard, label: standard ? 'Standard Access' : 'Custom Access', granted };
  }

  async unlink(child: ChildAccess): Promise<void> {
    if (!this.profile) return;
    const confirmed = await this.toast.confirm({
      title: 'Remove child access?',
      message: `This will immediately remove ${this.profile.parent.name}'s access to ${child.studentName}.`,
      confirmText: 'Remove access', cancelText: 'Cancel', danger: true, icon: 'danger'
    });
    if (!confirmed) return;
    this.parentService.unlinkStudent(this.profile.parent.parentId, child.relationshipId)
      .pipe(takeUntil(this.destroy$)).subscribe({
        next: () => { this.toast.success('Access removed'); this.loadProfile(); },
        error: () => this.toast.error('Could not remove access'),
      });
  }

  openEditDetails(): void {
    if (!this.profile) return;
    const parent = this.profile.parent;
    this.editDetails = { name: parent.name, email: parent.email ?? '', phoneNumber: parent.phoneNumber };
    this.detailsError = null;
    this.showEditDetails = true;
    this.showResetPassword = false;
  }

  cancelEditDetails(): void { this.showEditDetails = false; this.detailsError = null; }

  saveDetails(): void {
    if (!this.profile || this.savingDetails) return;
    const request = {
      name: this.editDetails.name.trim(), email: this.editDetails.email.trim(), phoneNumber: this.editDetails.phoneNumber.trim(),
    };
    if (!request.name || !request.email || !request.phoneNumber) {
      this.detailsError = 'Name, email and phone are all required.';
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(request.email)) { this.detailsError = 'Enter a valid email address.'; return; }
    const emailChanged = request.email.toLowerCase() !== (this.profile.parent.email ?? '').toLowerCase();
    this.savingDetails = true;
    this.detailsError = null;
    this.parentService.updateParent(this.profile.parent.parentId, request).pipe(takeUntil(this.destroy$)).subscribe({
      next: profile => {
        this.profile = profile;
        this.savingDetails = false;
        this.showEditDetails = false;
        this.toast.success('Details saved', emailChanged
          ? 'The login email changed too. Any earlier setup link no longer works — resend it if needed.' : undefined);
        this.cdr.markForCheck();
      },
      error: err => {
        this.savingDetails = false;
        this.detailsError = err?.error?.message || (typeof err?.error === 'string' ? err.error : 'Could not save the details.');
        this.cdr.markForCheck();
      },
    });
  }

  async resendSetupLink(): Promise<void> {
    if (!this.profile || this.resendingSetupLink) return;
    const parent = this.profile.parent;
    const confirmed = await this.toast.confirm({
      title: 'Resend setup link?',
      message: `A new account setup link (valid for 72 hours) will be emailed to ${parent.email}. Any earlier link stops working. The current password is not changed.`,
      confirmText: 'Send link', cancelText: 'Cancel', icon: 'question',
    });
    if (!confirmed) return;
    this.resendingSetupLink = true;
    this.cdr.markForCheck();
    this.parentService.resendSetupLink(parent.parentId).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.resendingSetupLink = false;
        this.toast.success('Setup link sent', `${parent.name} can set their password from the email within 72 hours.`);
        this.cdr.markForCheck();
      },
      error: err => {
        this.resendingSetupLink = false;
        this.toast.error('Could not send the link', err?.error?.message || 'Please try again.');
        this.cdr.markForCheck();
      },
    });
  }

  toggleResetPassword(): void {
    this.showResetPassword = !this.showResetPassword;
    this.resetPasswordError = null;
  }
  cancelResetPassword(): void {
    this.showResetPassword = false;
    this.resetPasswordError = null;
  }

  /** Mirrors the backend's ParentPortalService.validatePasswordStrength so the admin gets instant feedback. */
  private passwordStrengthError(password: string): string | null {
    if (!password || password.length < 8) return 'Use at least 8 characters';
    if (!/[A-Z]/.test(password)) return 'Include at least one uppercase letter';
    if (!/[a-z]/.test(password)) return 'Include at least one lowercase letter';
    if (!/\d/.test(password)) return 'Include at least one digit';
    return null;
  }

  async submitResetPassword(temporaryPassword: string): Promise<void> {
    if (!this.profile) return;
    const error = this.passwordStrengthError(temporaryPassword);
    if (error) { this.resetPasswordError = error; this.cdr.markForCheck(); return; }
    const parent = this.profile.parent;
    const confirmed = await this.toast.confirm({
      title: 'Reset parent password?',
      message: `${parent.name} will be signed out of any active session and must sign in with this temporary password, then set a new one.`,
      confirmText: 'Reset password', cancelText: 'Cancel', danger: true, icon: 'warning'
    });
    if (!confirmed) return;
    this.resettingPassword = true;
    this.resetPasswordError = null;
    this.parentService.resetPassword(parent.parentId, temporaryPassword).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.resettingPassword = false;
        this.showResetPassword = false;
        this.toast.success('Password reset', `${parent.name} must sign in with the new temporary password and will be prompted to set their own.`);
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.resettingPassword = false;
        this.resetPasswordError = err?.error?.message || 'Could not reset password';
        this.cdr.markForCheck();
      },
    });
  }

  async toggleLogin(): Promise<void> {
    if (!this.profile) return;
    const parent = this.profile.parent;
    if (parent.active) {
      const confirmed = await this.toast.confirm({
        title: 'Disable parent login?',
        message: `${parent.name} will no longer be able to sign in. Student links and permissions will be preserved.`,
        confirmText: 'Disable login', cancelText: 'Cancel', danger: true, icon: 'warning'
      });
      if (!confirmed) return;
    }
    this.working = true;
    this.parentService.setActive(parent.parentId, !parent.active).pipe(
      takeUntil(this.destroy$),
    ).subscribe({
      next: () => {
        this.working = false;
        this.toast.success(parent.active ? 'Parent access disabled' : 'Parent access restored');
        if (this.profile) this.profile = { ...this.profile, parent: { ...this.profile.parent, active: !parent.active } };
        this.cdr.markForCheck();
      },
      error: () => {
        this.working = false;
        this.toast.error('Could not update parent access');
        this.cdr.markForCheck();
      },
    });
  }
}
