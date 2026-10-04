import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, inject, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { LoggerService } from '../../services/logger.service';
import { ActivatedRoute, Router } from '@angular/router';
import { StudentService } from '../../services/student.service';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../auth/auth.service';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../services/toast.service';
import { Subject, forkJoin, takeUntil, switchMap } from 'rxjs';
import { Location } from '@angular/common';
import { environment } from '../../../environments/environment';
import { SchoolService, SchoolClass } from '../../services/school.service';
import { SectionService } from '../../services/section.service';
import { Section } from '../../interfaces/section';
import { GuardianLink } from '../../interfaces/parent-portal';
import { ParentPortalService } from '../../services/parent-portal.service';
import { StudentExitRequest, PendingDuesInfo, EnrollmentHistoryItem, StudentLoginStatus } from '../../interfaces/student';

interface StudentDetails {
  studentId?: string;
  name?: string;
  className?: string;
  sectionId?: number | null;
  sectionName?: string;
  phoneNumber?: string;
  email?: string;
  gender?: string;
  dob?: string;
  fatherName?: string;
  motherName?: string;
  takesBus?: boolean;
  distance?: number | null;
  joiningDate?: string;
  leavingDate?: string;
  status?: string;
  photoUrl?: string;
  reasonForLeaving?: string;
  conductAtLeaving?: string;
  exitRemarks?: string;
}

@Component({
  selector: 'app-student-details',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './student-details.component.html',
  styleUrl: './student-details.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StudentDetailsComponent implements OnInit, OnDestroy {
  studentId: string = '';
  studentDetails: StudentDetails | null = null;
  role: string = '';
  isEditing: boolean = false;
  updatedDetails: StudentDetails | null = null;
  private ngUnsubscribe = new Subject<void>();
  effectiveFromMonth: number | null = null;

  // Track validation errors for CSS classes
  validationErrors: { [key: string]: boolean } = {};

  // Photo upload state
  photoUploading = false;
  photoLoadFailed = false;
  @ViewChild('photoInput') photoInput!: ElementRef<HTMLInputElement>;

  // Change-password modal state
  showPasswordModal = false;
  cpOldPw = '';
  cpNewPw = '';
  cpConfirmPw = '';
  cpShowOld = false;
  cpShowNew = false;
  cpShowConfirm = false;
  cpShowOldField = false;

  academicMonths = [
    { value: 0, label: 'New Academic Year' },
    { value: 1, label: 'April' }, { value: 2, label: 'May' }, { value: 3, label: 'June' },
    { value: 4, label: 'July' }, { value: 5, label: 'August' }, { value: 6, label: 'September' },
    { value: 7, label: 'October' }, { value: 8, label: 'November' }, { value: 9, label: 'December' },
    { value: 10, label: 'January' }, { value: 11, label: 'February' }, { value: 12, label: 'March' }
  ];
  classList: string[] = [];
  managedClasses: SchoolClass[] = [];
  sections: Section[] = [];

  // Exit modal state
  showExitModal = false;
  exitLoading = false;
  acknowledgedDues: boolean = false;
  exitRequest: StudentExitRequest = {
    exitType: 'WITHDRAWN',
    reasonForLeaving: '',
    conductAtLeaving: '',
    leavingDate: new Date().toISOString().split('T')[0],
    exitRemarks: ''
  };
  pendingDues: PendingDuesInfo | null = null;

  // Admin lifecycle extras (Student Admission Phase 1)
  enrollmentHistory: EnrollmentHistoryItem[] = [];
  /** Read-only Guardians panel (admin). null = not loaded / Parent Portal not available. */
  guardians: GuardianLink[] | null = null;
  private readonly parentPortal = inject(ParentPortalService);
  enrollmentHistoryFailed = false;
  loginStatus: StudentLoginStatus | null = null;
  lifecycleBusy = false;

  // Readmit modal state
  showReadmitModal = false;
  readmitLoading = false;
  readmitClassName = '';
  readmitSectionId: number | null = null;
  readmitDate = '';
  readmitSections: Section[] = [];

  readonly exitReasons = [
    'Family relocation',
    'Admitted to another school',
    'Financial reasons',
    'Health reasons',
    'Completed studies',
    'Disciplinary action',
    'Migration abroad',
    'Other'
  ];

  readonly conductOptions = ['Excellent', 'Good', 'Satisfactory', 'Needs Improvement'];

  constructor(
    private route: ActivatedRoute,
    public router: Router,
    private studentService: StudentService,
    private authService: AuthService,
    private location: Location,
    private logger: LoggerService,
    private cdr: ChangeDetectorRef,
    private toast: ToastService,
    private schoolService: SchoolService,
    private sectionService: SectionService
  ) { }

  ngOnInit(): void {
    this.role = this.authService.getUserRole();

    // Load both class lists first, then process route params.
    // This ensures managedClasses is populated before loadStudentDetails
    // calls loadSectionsForClass — preventing the race where sections never load.
    forkJoin({
      classes: this.schoolService.getClasses(),
      managedClasses: this.schoolService.getManagedClasses(),
    }).pipe(
      takeUntil(this.ngUnsubscribe),
      switchMap(({ classes, managedClasses }) => {
        this.classList = classes;
        this.managedClasses = managedClasses;
        this.cdr.markForCheck();
        return this.route.params;
      })
    ).subscribe((params) => {
      this.studentId = params['studentId'];
      if (this.studentId) {
        this.loadStudentDetails(this.studentId);
      }
    });
  }

  ngOnDestroy(): void {
    this.ngUnsubscribe.next();
    this.ngUnsubscribe.complete();
  }

  loadStudentDetails(studentId: string): void {
    this.studentService.getStudent(studentId).pipe(takeUntil(this.ngUnsubscribe)).subscribe({
      next: (details) => {
        this.studentDetails = details;
        this.updatedDetails = { ...details };
        this.photoLoadFailed = false;
        if (details.className) this.loadSectionsForClass(details.className);
        this.loadAdminExtras();
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.logger.error('Error fetching details:', error);
        this.toast.error('Error', 'Failed to load details.');
      }
    });
  }

  getUserRole(): string {
    return this.role;
  }

  enableEditMode(): void {
    this.toast.confirm({
      title: 'Are you sure?',
      message: 'Do you want to edit the details?',
      confirmText: 'Yes, edit it!',
      cancelText: 'Cancel',
    }).then((confirmed) => {
      if (confirmed) {
        this.isEditing = true;
        this.validationErrors = {};
        this.cdr.markForCheck();
      }
    });
  }

  cancelEditMode(): void {
    this.isEditing = false;
    this.updatedDetails = { ...this.studentDetails! };
    this.effectiveFromMonth = null;
    this.validationErrors = {};
    this.toast.info('Cancelled', 'Edit mode cancelled. No changes saved.');
  }

  validateFields(): boolean {
    this.validationErrors = {};
    let isValid = true;
    let errors: string[] = [];

    if (!this.updatedDetails) return false;

    // Name Validation
    if (!this.updatedDetails.name || this.updatedDetails.name.trim().length === 0) {
      this.validationErrors['name'] = true;
      errors.push("Student Name is mandatory.");
      isValid = false;
    }

    // Phone Validation
    const phoneRegex = /^[0-9]{10}$/;
    if (!this.updatedDetails.phoneNumber || this.updatedDetails.phoneNumber.trim().length === 0) {
      this.validationErrors['phoneNumber'] = true;
      errors.push("Phone Number is mandatory.");
      isValid = false;
    } else if (!phoneRegex.test(this.updatedDetails.phoneNumber)) {
      this.validationErrors['phoneNumber'] = true;
      errors.push("Phone Number must be exactly 10 digits.");
      isValid = false;
    }

    // Email Validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!this.updatedDetails.email || this.updatedDetails.email.trim().length === 0) {
      this.validationErrors['email'] = true;
      errors.push("Email Address is mandatory.");
      isValid = false;
    } else if (!emailRegex.test(this.updatedDetails.email)) {
      this.validationErrors['email'] = true;
      errors.push("Please enter a valid email address.");
      isValid = false;
    }

    // Distance Validation
    if (this.updatedDetails.takesBus && (this.updatedDetails.distance === null || this.updatedDetails.distance === undefined)) {
      this.validationErrors['distance'] = true;
      errors.push("Distance is required when Bus Facility is enabled.");
      isValid = false;
    }

    if (!isValid) {
      this.toast.confirm({
        title: 'Validation Failed',
        html: `<ul style="text-align: left;">${errors.map(err => `<li>${err}</li>`).join('')}</ul>`,
        confirmText: 'OK',
        icon: 'danger',
      });
    }

    return isValid;
  }

  async saveStudentDetails(): Promise<void> {
    if (!this.validateFields()) {
      return;
    }

    let needsEffectiveMonth = false;

    if (this.updatedDetails && this.studentDetails) {
      if (this.updatedDetails.takesBus !== this.studentDetails.takesBus) {
        needsEffectiveMonth = true;
      } else if (this.updatedDetails.takesBus && this.studentDetails.takesBus && this.updatedDetails.distance !== this.studentDetails.distance) {
        needsEffectiveMonth = true;
      }
    }


    if (needsEffectiveMonth) {
      const month = await this.toast.selectMonth({
        title: 'Select Effective Month',
        options: this.academicMonths,
        confirmText: 'Save with Selected Month',
      });

      if (month !== null) {
        this.effectiveFromMonth = month;
        this.executeUpdate();
      }
    } else {
      this.executeUpdate();
    }
  }

  /** True when an enrolled (ACTIVE) student's class or section is being changed. */
  get isActiveMembershipChange(): boolean {
    if (!this.studentDetails || !this.updatedDetails || this.studentDetails.status !== 'ACTIVE') return false;
    return this.updatedDetails.className !== this.studentDetails.className
      || (this.updatedDetails.sectionId ?? null) !== (this.studentDetails.sectionId ?? null);
  }

  /** Only the admin-editable fields — never status, exit details or the (signed) photo URL. */
  private editablePayload(d: StudentDetails) {
    return {
      name: d.name, email: d.email, phoneNumber: d.phoneNumber, dob: d.dob,
      className: d.className, sectionId: d.sectionId ?? null, gender: d.gender,
      fatherName: d.fatherName, motherName: d.motherName, takesBus: d.takesBus,
      distance: d.distance ?? null, joiningDate: d.joiningDate,
    };
  }

  executeUpdate(): void {
    this.toast.confirm({
      title: 'Are you sure?',
      message: this.isActiveMembershipChange
        ? 'The new class/section applies from today. Attendance and marks already recorded stay with the previous class/section.'
        : 'Do you want to save the changes to the details?',
      icon: this.isActiveMembershipChange ? 'warning' : 'question',
      confirmText: 'Yes, save it!',
      cancelText: 'Cancel',
    }).then((confirmed) => {
      if (confirmed) {
        if (this.updatedDetails) {
          const payload = {
            studentDetails: this.editablePayload(this.updatedDetails),
            effectiveFromMonth: this.effectiveFromMonth
          };
          this.studentService.updateStudent(this.studentId, payload).pipe(takeUntil(this.ngUnsubscribe)).subscribe({
            next: (response) => {
              this.studentDetails = { ...this.updatedDetails, ...response, photoUrl: this.studentDetails?.photoUrl };
              this.updatedDetails = { ...this.studentDetails };
              this.loadAdminExtras();
              this.isEditing = false;
              this.effectiveFromMonth = null;
              this.validationErrors = {};
              this.cdr.markForCheck();
              this.toast.success('Success!', 'Details have been updated.');
            },
            error: (error) => {
              this.logger.error('Error updating details:', error);
              this.toast.error('Error!', this.serverMessage(error, 'Failed to update details.'));
            }
          });
        }
      }
    });
  }

  updateFieldValue(field: keyof StudentDetails, event: Event): void {
    if (this.updatedDetails) {
      const target = event.target as HTMLInputElement;
      (this.updatedDetails as Record<string, unknown>)[field] = (field === 'takesBus') ? target.checked : target.value;

      // Clear error immediately when user fixes the field
      if (this.validationErrors[field]) {
        delete this.validationErrors[field];
      }
    }
  }

  viewAttendanceSummary(): void {
    this.router.navigate(['/dashboard/attendance-summary'], {
      queryParams: { studentId: this.studentId, className: this.studentDetails?.className }
    });
  }

  viewPaymentHistory(): void {
    this.router.navigate(['/dashboard/payment-history', this.studentId]);
  }

  viewLeaves(): void {
    this.router.navigate(['/dashboard/view-leaves', this.studentId]);
  }

  viewFeeDetails(): void {
    this.router.navigate(['/dashboard/fees', this.studentId]);
  }

  openPasswordModal(): void {
    this.cpOldPw = '';
    this.cpNewPw = '';
    this.cpConfirmPw = '';
    this.cpShowOld = false;
    this.cpShowNew = false;
    this.cpShowConfirm = false;
    this.cpShowOldField = (this.role !== 'ADMIN');
    this.showPasswordModal = true;
  }

  closePasswordModal(): void {
    this.showPasswordModal = false;
    this.cdr.markForCheck();
  }

  submitPasswordChange(): void {
    if (this.cpShowOldField && !this.cpOldPw) {
      this.toast.error('Error', 'Current password is required');
      return;
    }
    if (!this.cpNewPw || !this.cpConfirmPw) {
      this.toast.error('Error', 'New password and confirmation are required');
      return;
    }
    if (this.cpNewPw.length < 6) {
      this.toast.error('Error', 'New password must be at least 6 characters');
      return;
    }
    if (this.cpNewPw !== this.cpConfirmPw) {
      this.toast.error('Error', 'New passwords do not match');
      return;
    }
    const payload = { userId: this.studentId, oldPassword: this.cpOldPw, newPassword: this.cpNewPw };
    this.authService.changePassword(payload).pipe(takeUntil(this.ngUnsubscribe)).subscribe({
      next: () => {
        this.closePasswordModal();
        this.toast.success('Success', 'Password changed successfully!');
      },
      error: (error) => {
        this.logger.error('Error changing password', error);
        this.toast.error('Error', error.error || 'Failed to change password');
      }
    });
  }

  canUploadPhoto(): boolean {
    const role = this.getUserRole();
    return role === 'ADMIN' || role === 'SUB_ADMIN' || role === 'SUPER_ADMIN';
  }

  getInitials(): string {
    return this.studentDetails?.name?.charAt(0).toUpperCase() ?? '?';
  }

  hasValue(value: unknown): boolean {
    return value !== null && value !== undefined && String(value).trim().length > 0;
  }

  hasFamilyInfo(): boolean {
    return this.hasValue(this.studentDetails?.fatherName) || this.hasValue(this.studentDetails?.motherName);
  }

  onPhotoError(): void {
    this.photoLoadFailed = true;
    this.cdr.markForCheck();
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

    if (!StudentDetailsComponent.ALLOWED_PHOTO_TYPES.includes(file.type)) {
      this.toast.error('Unsupported File Type', 'Profile photo must be a JPEG, PNG, or WebP image.');
      return;
    }
    // Issue #58: File size check
    if (file.size > 5 * 1024 * 1024) {
      this.toast.error('File Too Large', 'Profile photo must be less than 5MB.');
      return;
    }

    this.photoUploading = true;
    this.cdr.markForCheck();

    // Direct-to-object-storage upload: bytes go straight from this browser to object storage,
    // never through our own backend — see StudentService.uploadStudentPhotoDirect.
    this.studentService.uploadStudentPhotoDirect(this.studentId, file).pipe(takeUntil(this.ngUnsubscribe)).subscribe({
      next: (res) => {
        if (this.studentDetails) {
          this.studentDetails = { ...this.studentDetails, photoUrl: res.displayUrl };
        }
        this.photoLoadFailed = false;
        this.photoUploading = false;
        this.cdr.markForCheck();
        this.toast.success('Photo updated!');
      },
      error: (err) => {
        this.logger.error('Photo upload error:', err);
        this.photoUploading = false;
        this.cdr.markForCheck();
        this.toast.error('Upload failed', 'Could not upload photo. Please try again.');
      }
    });
  }

  loadSectionsForClass(className: string): void {
    const cls = this.managedClasses.find(c => c.name === className);
    if (!cls) { this.sections = []; return; }
    this.sectionService.getSectionsForClass(cls.id).pipe(takeUntil(this.ngUnsubscribe)).subscribe({
      next: sections => { this.sections = sections; this.cdr.markForCheck(); },
      error: () => { this.sections = []; }
    });
  }

  onClassChangeInEdit(className: string): void {
    this.sections = [];
    if (this.updatedDetails) {
      this.updatedDetails.sectionId = undefined;
      this.updatedDetails.sectionName = undefined;
    }
    this.loadSectionsForClass(className);
  }

  // ── Exit Workflow ──────────────────────────────────────────────────

  isExitStatus(): boolean {
    const s = this.studentDetails?.status;
    return s === 'GRADUATED' || s === 'TRANSFERRED' || s === 'WITHDRAWN' || s === 'ADMISSION_CANCELLED';
  }

  statusLabel(status?: string): string {
    return status === 'ADMISSION_CANCELLED' ? 'Admission cancelled' : (status ?? '');
  }

  // ── Admin lifecycle extras ─────────────────────────────────────────

  private loadAdminExtras(): void {
    if (this.getUserRole() !== 'ADMIN' || !this.studentId) return;
    this.studentService.getEnrollmentHistory(this.studentId).pipe(takeUntil(this.ngUnsubscribe)).subscribe({
      next: history => { this.enrollmentHistory = history; this.enrollmentHistoryFailed = false; this.cdr.markForCheck(); },
      error: () => { this.enrollmentHistory = []; this.enrollmentHistoryFailed = true; this.cdr.markForCheck(); }
    });
    this.studentService.getLoginStatus(this.studentId).pipe(takeUntil(this.ngUnsubscribe)).subscribe({
      next: status => { this.loginStatus = status; this.cdr.markForCheck(); },
      error: () => { this.loginStatus = null; this.cdr.markForCheck(); }
    });
    this.parentPortal.getGuardians(this.studentId).pipe(takeUntil(this.ngUnsubscribe)).subscribe({
      next: guardians => { this.guardians = guardians; this.cdr.markForCheck(); },
      // Parent Portal not enabled for this school (or unavailable): the panel stays hidden.
      error: () => { this.guardians = null; this.cdr.markForCheck(); }
    });
  }

  guardianAccessSummary(g: GuardianLink): string {
    const granted = [
      g.canViewAttendance && 'Attendance', g.canViewFees && 'Fees', g.canPayFees && 'Payments',
      g.canViewResults && 'Results', g.canViewTimetable && 'Timetable', g.canManageLeave && 'Leave',
    ].filter(Boolean);
    return granted.length === 6 ? 'Standard access' : granted.length ? granted.join(' · ') : 'No access';
  }

  guardianLoginLabel(g: GuardianLink): string {
    if (!g.parentActive) return 'Account disabled';
    return g.loginState === 'ACTIVE' ? 'Login active' : g.loginState === 'DISABLED' ? 'Login disabled' : 'No login';
  }

  get canCreateLogin(): boolean {
    const s = this.studentDetails?.status;
    return this.getUserRole() === 'ADMIN' && !!this.loginStatus && !this.loginStatus.exists
      && s !== 'TRANSFERRED' && s !== 'WITHDRAWN' && s !== 'ADMISSION_CANCELLED';
  }

  historyStateLabel(item: EnrollmentHistoryItem): string {
    switch (item.state) {
      case 'CURRENT': return 'Current';
      case 'UPCOMING': return 'Upcoming';
      case 'CANCELLED': return 'Cancelled';
      default: return 'Closed';
    }
  }

  closureLabel(reason?: string | null): string {
    switch (reason) {
      case 'SESSION_COMPLETED': return 'Session completed';
      case 'CLASS_CHANGE': return 'Class changed';
      case 'SECTION_CHANGE': return 'Section changed';
      case 'GRADUATED': return 'Graduated';
      case 'TRANSFERRED': return 'Transferred';
      case 'WITHDRAWN': return 'Withdrawn';
      case 'CANCELLED_BEFORE_START': return 'Cancelled before start';
      default: return '';
    }
  }

  async cancelAdmission(): Promise<void> {
    const reason = await this.toast.confirmWithReason({
      title: 'Cancel admission?',
      message: `${this.studentDetails?.name} has not joined yet. The admission is kept in history, the student will not be activated on the joining date, and any login and parent access are switched off.`,
      confirmText: 'Cancel admission',
      cancelText: 'Keep admission',
      danger: true,
      reasonInput: { label: 'Reason (optional)', placeholder: 'e.g. Family chose another school', required: false, maxLength: 500 },
    });
    if (reason === null) return;
    this.lifecycleBusy = true;
    this.cdr.markForCheck();
    this.studentService.cancelAdmission(this.studentId, reason).pipe(takeUntil(this.ngUnsubscribe)).subscribe({
      next: student => {
        this.lifecycleBusy = false;
        this.studentDetails = { ...student, photoUrl: this.studentDetails?.photoUrl };
        this.updatedDetails = { ...this.studentDetails };
        this.loadAdminExtras();
        this.cdr.markForCheck();
        this.toast.success('Admission cancelled', `${student.name} will not be activated.`);
      },
      error: err => {
        this.lifecycleBusy = false;
        this.cdr.markForCheck();
        this.toast.error('Error', this.serverMessage(err, 'Failed to cancel the admission.'));
      }
    });
  }

  createMissingLogin(): void {
    this.toast.confirm({
      title: 'Create login?',
      message: `Creates the login for ${this.studentDetails?.name}. Initial password: date of birth (YYYYMMDD); it must be changed at first sign-in. A welcome email is sent if an email is on file.`,
      confirmText: 'Create login',
      cancelText: 'Cancel',
    }).then(confirmed => {
      if (!confirmed) return;
      this.lifecycleBusy = true;
      this.cdr.markForCheck();
      this.studentService.createMissingLogin(this.studentId).pipe(takeUntil(this.ngUnsubscribe)).subscribe({
        next: status => {
          this.lifecycleBusy = false;
          this.loginStatus = status;
          this.cdr.markForCheck();
          this.toast.success('Login created', 'Initial password is the date of birth in YYYYMMDD format.');
        },
        error: err => {
          this.lifecycleBusy = false;
          this.loadAdminExtras();
          this.cdr.markForCheck();
          this.toast.error('Error', this.serverMessage(err, 'Failed to create the login.'));
        }
      });
    });
  }

  private serverMessage(err: any, fallback: string): string {
    const e = err?.error;
    if (typeof e === 'string' && e) return e;
    return e?.message || e?.detail || fallback;
  }

  get todayStr(): string {
    return new Date().toISOString().split('T')[0];
  }

  openExitModal(): void {
    this.exitRequest = {
      exitType: 'WITHDRAWN',
      reasonForLeaving: '',
      conductAtLeaving: '',
      leavingDate: new Date().toISOString().split('T')[0],
      exitRemarks: ''
    };
    this.pendingDues = null;
    this.acknowledgedDues = false;
    this.showExitModal = true;
    this.cdr.markForCheck();

    this.studentService.checkPendingDues(this.studentId).pipe(takeUntil(this.ngUnsubscribe)).subscribe({
      next: (dues) => { this.pendingDues = dues; this.cdr.markForCheck(); },
      error: () => {}
    });
  }

  closeExitModal(): void {
    this.showExitModal = false;
    this.cdr.markForCheck();
  }

  submitExit(): void {
    if (!this.exitRequest.reasonForLeaving) {
      this.toast.error('Required', 'Please select a reason for leaving.');
      return;
    }
    if (!this.exitRequest.leavingDate) {
      this.toast.error('Required', 'Please set a leaving date.');
      return;
    }

    // Issue #34: Validate leaving date is not in the future and not before joining date
    if (this.exitRequest.leavingDate) {
      const leaving = new Date(this.exitRequest.leavingDate);
      const today = new Date(); today.setHours(23, 59, 59, 999);
      if (leaving > today) {
        this.toast.error('Invalid Date', 'Leaving date cannot be in the future.');
        return;
      }
      if (this.studentDetails?.joiningDate && leaving < new Date(this.studentDetails.joiningDate)) {
        this.toast.error('Invalid Date', 'Leaving date cannot be before the student\'s joining date.');
        return;
      }
    }

    // Issue #12: Block exit if pending dues are unacknowledged
    if (this.pendingDues?.hasPendingDues && !this.acknowledgedDues) {
      this.toast.error('Pending Dues', 'Student has outstanding fees. Please acknowledge before proceeding with exit.');
      return;
    }

    this.exitLoading = true;
    this.cdr.markForCheck();

    this.studentService.exitStudent(this.studentId, this.exitRequest).pipe(takeUntil(this.ngUnsubscribe)).subscribe({
      next: (student) => {
        this.studentDetails = student;
        this.updatedDetails = { ...student };
        this.showExitModal = false;
        this.exitLoading = false;
        this.cdr.markForCheck();

        const label = this.exitRequest.exitType === 'GRADUATED' ? 'graduated' :
                      this.exitRequest.exitType === 'TRANSFERRED' ? 'transferred' : 'withdrawn';
        this.toast.success('Done', `Student has been marked as ${label}.`);
      },
      error: (err) => {
        this.exitLoading = false;
        this.cdr.markForCheck();
        const msg = typeof err?.error === 'string' ? err.error : 'Failed to exit student.';
        this.toast.error('Error', msg);
      }
    });
  }

  readmitStudent(): void {
    this.openReadmitModal();
  }

  openReadmitModal(): void {
    this.readmitClassName = this.studentDetails?.className ?? '';
    this.readmitSectionId = this.studentDetails?.sectionId ?? null;
    this.readmitDate = this.todayStr;
    this.readmitSections = [];
    this.loadReadmitSections(this.readmitClassName, true);
    this.showReadmitModal = true;
    this.cdr.markForCheck();
  }

  closeReadmitModal(): void {
    this.showReadmitModal = false;
    this.cdr.markForCheck();
  }

  onReadmitClassChange(className: string): void {
    this.readmitSectionId = null;
    this.loadReadmitSections(className, false);
  }

  private loadReadmitSections(className: string, keepSelection: boolean): void {
    const cls = this.managedClasses.find(c => c.name === className);
    if (!cls) { this.readmitSections = []; return; }
    this.sectionService.getSectionsForClass(cls.id).pipe(takeUntil(this.ngUnsubscribe)).subscribe({
      next: sections => {
        this.readmitSections = sections;
        if (!keepSelection || !sections.some(sec => sec.id === this.readmitSectionId)) {
          this.readmitSectionId = keepSelection && sections.some(sec => sec.id === this.readmitSectionId) ? this.readmitSectionId : null;
        }
        this.cdr.markForCheck();
      },
      error: () => { this.readmitSections = []; this.cdr.markForCheck(); }
    });
  }

  submitReadmit(): void {
    const cls = this.managedClasses.find(c => c.name === this.readmitClassName);
    if (!cls) {
      this.toast.error('Required', 'Choose the class to readmit into.');
      return;
    }
    if (this.readmitSections.length && this.readmitSectionId == null) {
      this.toast.error('Required', 'Choose a section.');
      return;
    }
    if (!this.readmitDate || this.readmitDate > this.todayStr) {
      this.toast.error('Invalid Date', 'The readmission date cannot be in the future.');
      return;
    }
    this.readmitLoading = true;
    this.cdr.markForCheck();
    this.studentService.readmitStudent(this.studentId, {
      classId: cls.id, sectionId: this.readmitSectionId, readmissionDate: this.readmitDate,
    }).pipe(takeUntil(this.ngUnsubscribe)).subscribe({
      next: (student) => {
        this.readmitLoading = false;
        this.showReadmitModal = false;
        this.studentDetails = { ...student, photoUrl: this.studentDetails?.photoUrl };
        this.updatedDetails = { ...this.studentDetails };
        this.loadAdminExtras();
        this.cdr.markForCheck();
        this.toast.success('Re-admitted', `${student.name} is now active again.`);
        this.offerParentLinkRestore();
      },
      error: (err) => {
        this.readmitLoading = false;
        this.cdr.markForCheck();
        this.toast.error('Error', this.serverMessage(err, 'Failed to re-admit student.'));
      }
    });
  }

  /** After readmission, parent access ended by the exit is restored only if the admin confirms. */
  private offerParentLinkRestore(): void {
    this.studentService.getRestorableParentLinks(this.studentId).pipe(takeUntil(this.ngUnsubscribe)).subscribe({
      next: links => {
        if (!links.length) return;
        const names = links.map(l => `${l.parentName} (${l.relationshipType.toLowerCase()})`).join(', ');
        this.toast.confirm({
          title: 'Restore parent access?',
          message: `Parent access ended when this student left: ${names}. Restore it now?`,
          confirmText: 'Restore access',
          cancelText: 'Not now',
        }).then(confirmed => {
          if (!confirmed) return;
          this.studentService.restoreParentLinks(this.studentId, links.map(l => l.relationshipId))
            .pipe(takeUntil(this.ngUnsubscribe)).subscribe({
              next: res => this.toast.success('Parent access restored', `${res.restored} parent link(s) restored.`),
              error: err => this.toast.error('Error', this.serverMessage(err, 'Failed to restore parent access.')),
            });
        });
      },
      error: () => { /* optional follow-up; readmission itself already succeeded */ }
    });
  }

  goBack(): void {
    this.location.back();
  }
}
