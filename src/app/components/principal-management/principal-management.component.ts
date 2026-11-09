import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Observable, Subject, takeUntil } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ToastService } from '../../services/toast.service';
import {
  EMPLOYMENT_TYPES, PrincipalAppointment, PrincipalDetails, PrincipalProfile, PrincipalService,
} from '../../services/principal.service';

type Mode = 'create' | 'edit' | 'replace' | 'activation';
type Tab = 'profile' | 'history';
type DetailsForm = { [K in keyof PrincipalDetails]: K extends 'experienceYears' ? number | null : string };

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const blankDetails = (): DetailsForm => ({
  gender: '', dob: '', phoneNumber: '', alternatePhoneNumber: '', address: '', city: '', state: '', pinCode: '',
  qualification: '', specialization: '', experienceYears: null, previousInstitution: '', joiningDate: '', employmentType: '',
});

@Component({
  selector: 'app-principal-management',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './principal-management.component.html',
  styleUrls: ['./principal-management.component.css'],
})
export class PrincipalManagementComponent implements OnInit, OnDestroy {
  profile: PrincipalProfile | null = null;
  history: PrincipalAppointment[] = [];
  mode: Mode | null = null;
  tab: Tab = 'profile';
  name = ''; email = ''; reason = '';
  details: DetailsForm = blankDetails();
  loading = false; saving = false; error = ''; loadFailed = false;
  historyLoading = false; historyFailed = false;
  photoUploading = false;
  pendingPhoto: File | null = null;
  pendingPhotoPreview: string | null = null;
  readonly employmentTypes = EMPLOYMENT_TYPES;
  readonly today = new Date().toISOString().slice(0, 10);
  private destroy$ = new Subject<void>();
  private destroyed = false;

  constructor(private principals: PrincipalService, private cdr: ChangeDetectorRef, private toast: ToastService) {}

  ngOnInit(): void { this.load(); }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.clearPendingPhoto();
    this.destroy$.next();
    this.destroy$.complete();
  }

  get currentAppointment(): PrincipalAppointment | undefined { return this.history.find(a => !a.endedAt); }
  get previousAppointments(): PrincipalAppointment[] { return this.history.filter(a => !!a.endedAt); }

  load(): void {
    if (this.loading || this.saving) return;
    this.loading = true; this.error = ''; this.loadFailed = false;
    this.principals.current().pipe(takeUntil(this.destroy$)).subscribe({
      next: data => {
        this.profile = data[0] ?? null; this.mode = null; this.loading = false;
        this.loadHistory(); this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false; this.loadFailed = true;
        this.error = 'Unable to load Principal details. Retry before making changes.'; this.cdr.markForCheck();
      },
    });
  }

  loadHistory(): void {
    this.historyLoading = true; this.historyFailed = false;
    this.principals.history().pipe(takeUntil(this.destroy$)).subscribe({
      next: history => { this.history = history; this.historyLoading = false; this.cdr.markForCheck(); },
      error: () => {
        this.history = []; this.historyLoading = false; this.historyFailed = true; this.cdr.markForCheck();
        this.toast.warning('History unavailable', 'The Principal profile loaded. Retry to load appointment history.');
      },
    });
  }

  open(mode: Mode): void {
    if (this.saving) return;
    const editing = mode === 'edit' && !!this.profile;
    this.mode = mode; this.reason = ''; this.error = ''; this.tab = 'profile';
    this.name = editing ? this.profile!.name : '';
    this.email = editing ? this.profile!.email : '';
    this.details = editing ? this.formFrom(this.profile!.details) : blankDetails();
    this.clearPendingPhoto();
    this.cdr.markForCheck();
  }

  cancel(): void {
    if (this.saving) return;
    this.mode = null; this.error = ''; this.clearPendingPhoto(); this.cdr.markForCheck();
  }

  async submit(): Promise<void> {
    if (this.saving || !this.mode || this.loading || this.loadFailed) return;
    const mode = this.mode, expected = this.profile?.userId;
    if (mode !== 'activation') {
      const problem = this.validate();
      if (problem) { this.error = problem; this.cdr.markForCheck(); return; }
    }
    if ((mode === 'replace' || mode === 'activation') && !this.reason.trim()) return;
    this.saving = true; this.error = '';
    const confirmed = await this.toast.confirm(this.confirmation(mode));
    if (this.destroyed) return;
    if (!confirmed || expected !== this.profile?.userId) { this.saving = false; this.cdr.markForCheck(); return; }
    const common = { expectedUserId: expected, confirmed: true };
    const identity = { name: this.name.trim(), email: this.email.trim() };
    const details = this.detailsPayload();
    const entered = Object.values(details).some(v => v !== null) ? { details } : {};
    let request: Observable<PrincipalProfile>;
    switch (mode) {
      case 'create': request = this.principals.create({ ...identity, ...entered }); break;
      case 'edit': request = this.principals.edit({ ...common, ...identity, details }); break;
      case 'replace': request = this.principals.replace({ ...common, ...identity, ...entered, reason: this.reason.trim() }); break;
      default: request = this.principals.activation({ ...common, active: !this.profile!.active, reason: this.reason.trim() });
    }
    const photo = mode === 'create' || mode === 'replace' ? this.pendingPhoto : null;
    request.pipe(takeUntil(this.destroy$)).subscribe({
      next: profile => {
        this.profile = profile; this.mode = null; this.saving = false; this.clearPendingPhoto();
        this.loadHistory();
        this.toast.success(this.successMessage(mode, profile));
        if (photo) this.uploadPhoto(photo);
        this.cdr.markForCheck();
      },
      error: err => {
        this.saving = false;
        this.error = err?.error?.message || 'Could not save the Principal account. Check the details and retry.';
        this.cdr.markForCheck();
      },
    });
  }

  async resend(): Promise<void> {
    if (this.saving || !this.profile?.active) return;
    const expected = this.profile.userId; this.saving = true;
    const confirmed = await this.toast.confirm({
      title: 'Send a new setup link?',
      message: `A new one-time setup link will be sent to ${this.profile.email}. Earlier setup links will stop working.`,
      confirmText: 'Send link', cancelText: 'Cancel',
    });
    if (this.destroyed) return;
    if (!confirmed || expected !== this.profile?.userId) { this.saving = false; this.cdr.markForCheck(); return; }
    this.principals.resendSetupLink(expected).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.saving = false;
        this.toast.success('Setup link sent', 'The Principal can also use Forgot password with their login ID.');
        this.cdr.markForCheck();
      },
      error: err => {
        this.saving = false; this.error = err?.error?.message || 'Could not request the setup link. Please retry.'; this.cdr.markForCheck();
      },
    });
  }

  onPhotoSelected(event: Event, stage: boolean): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!PHOTO_TYPES.includes(file.type)) { this.toast.error('Unsupported file type', 'Profile photo must be a JPEG, PNG or WebP image.'); return; }
    if (file.size > 5 * 1024 * 1024) { this.toast.error('File too large', 'Profile photo must be less than 5 MB.'); return; }
    if (stage) {
      this.clearPendingPhoto();
      this.pendingPhoto = file; this.pendingPhotoPreview = URL.createObjectURL(file);
      this.cdr.markForCheck();
    } else {
      this.uploadPhoto(file);
    }
  }

  clearPendingPhoto(): void {
    if (this.pendingPhotoPreview) URL.revokeObjectURL(this.pendingPhotoPreview);
    this.pendingPhoto = null; this.pendingPhotoPreview = null;
  }

  async copyLoginId(): Promise<void> {
    if (!this.profile) return;
    try {
      await navigator.clipboard.writeText(this.profile.loginId);
      this.toast.success('Principal ID copied');
    } catch {
      this.toast.warning('Copy unavailable', `Principal ID: ${this.profile.loginId}`);
    }
  }

  photoUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    return url.startsWith('http') || url.startsWith('blob:') ? url : `${environment.apiUrl}${url}`;
  }

  initials(name: string | null | undefined): string {
    const parts = (name ?? '').trim().split(/\s+/).filter(w => w && !/^(dr|mr|mrs|ms|prof|shri|smt)\.?$/i.test(w));
    return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || 'P';
  }

  employmentLabel(value: string | null | undefined): string | null {
    return this.employmentTypes.find(t => t.value === value)?.label ?? null;
  }

  address(d: PrincipalDetails | null): string | null {
    if (!d) return null;
    const line = [d.city, d.state].filter(Boolean).join(', ');
    return [d.address, [line, d.pinCode].filter(Boolean).join(' – ')].filter(Boolean).join('\n') || null;
  }

  tenure(from: string, to: string | null): string {
    const start = new Date(from), end = to ? new Date(to) : new Date();
    const months = Math.max(0, (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth());
    if (months < 1) return 'Less than a month';
    const years = Math.floor(months / 12), rest = months % 12;
    return [years ? `${years} yr${years > 1 ? 's' : ''}` : '', rest ? `${rest} mo` : ''].filter(Boolean).join(' ');
  }

  trackById(_: number, a: PrincipalAppointment): number { return a.id; }

  private uploadPhoto(file: File): void {
    const target = this.profile?.userId;
    if (!target) return;
    this.photoUploading = true; this.cdr.markForCheck();
    this.principals.uploadPhotoDirect(target, file).pipe(takeUntil(this.destroy$)).subscribe({
      next: res => {
        if (this.profile?.userId === target) this.profile = { ...this.profile, photoUrl: res.displayUrl };
        this.photoUploading = false; this.toast.success('Photo updated'); this.cdr.markForCheck();
      },
      error: () => {
        this.photoUploading = false; this.toast.error('Upload failed', 'Could not upload the photo. Please try again.'); this.cdr.markForCheck();
      },
    });
  }

  private validate(): string | null {
    const d = this.details;
    if (!this.name.trim()) return 'Enter the Principal’s full name.';
    if (!/^\S+@\S+\.\S+$/.test(this.email.trim())) return 'Enter a valid official email.';
    if (d.phoneNumber.trim() && !/^\d{10}$/.test(d.phoneNumber.trim())) return 'Mobile number must be 10 digits.';
    if (d.alternatePhoneNumber.trim() && !/^\d{10}$/.test(d.alternatePhoneNumber.trim())) return 'Alternate mobile number must be 10 digits.';
    if (d.pinCode.trim() && !/^\d{6}$/.test(d.pinCode.trim())) return 'PIN code must be 6 digits.';
    if (d.dob && d.dob >= this.today) return 'Date of birth must be in the past.';
    if (d.experienceYears !== null && (d.experienceYears < 0 || d.experienceYears > 60)) return 'Experience must be between 0 and 60 years.';
    return null;
  }

  private detailsPayload(): PrincipalDetails {
    const d = this.details;
    const text = (v: string) => v.trim() || null;
    const years = d.experienceYears;
    return {
      gender: (d.gender || null) as PrincipalDetails['gender'], dob: d.dob || null,
      phoneNumber: text(d.phoneNumber), alternatePhoneNumber: text(d.alternatePhoneNumber),
      address: text(d.address), city: text(d.city), state: text(d.state), pinCode: text(d.pinCode),
      qualification: text(d.qualification), specialization: text(d.specialization),
      experienceYears: years === null || (years as unknown) === '' ? null : Number(years),
      previousInstitution: text(d.previousInstitution), joiningDate: d.joiningDate || null,
      employmentType: (d.employmentType || null) as PrincipalDetails['employmentType'],
    };
  }

  private formFrom(d: PrincipalDetails | null): DetailsForm {
    const form = blankDetails();
    if (!d) return form;
    (Object.keys(form) as (keyof DetailsForm)[]).forEach(key => {
      const value = d[key];
      (form as Record<string, unknown>)[key] = key === 'experienceYears' ? value ?? null : value ?? '';
    });
    return form;
  }

  private confirmation(mode: Mode) {
    const base = { confirmText: 'Confirm', cancelText: 'Cancel' };
    switch (mode) {
      case 'replace': return { ...base, title: 'Replace the current Principal?', confirmText: 'Appoint replacement',
        message: 'The current Principal loses access immediately and is signed out everywhere. A new Principal ID and setup link will be created.' };
      case 'activation': return this.profile?.active
        ? { ...base, title: 'Deactivate this Principal?', confirmText: 'Deactivate', message: 'The Principal is signed out everywhere and cannot sign in until reactivated.' }
        : { ...base, title: 'Reactivate this Principal?', confirmText: 'Reactivate', message: 'The Principal can sign in again with their existing password.' };
      case 'create': return { ...base, title: 'Appoint this Principal?', message: 'A Principal ID is generated and a one-time password setup link is emailed.' };
      default: return { ...base, title: 'Save Principal profile?', message: 'Confirm the profile details. Changing the email signs the Principal out everywhere.' };
    }
  }

  private successMessage(mode: Mode, profile: PrincipalProfile): string {
    switch (mode) {
      case 'create': return `Principal appointed · ${profile.loginId}`;
      case 'replace': return `Replacement appointed · ${profile.loginId}`;
      case 'activation': return profile.active ? 'Principal reactivated' : 'Principal deactivated';
      default: return 'Principal profile updated';
    }
  }
}
