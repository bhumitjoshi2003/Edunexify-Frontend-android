import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { Subject, takeUntil, firstValueFrom } from 'rxjs';
import { SchoolService, SchoolSettings, SchoolEntitlementSummary, PlanDetail, SubscriptionHistoryItem, SchoolFeature } from '../../services/school.service';
import { AuthStateService } from '../../auth/auth-state.service';
import { TenantService } from '../../services/tenant.service';
import { LoggerService } from '../../services/logger.service';
import { ToastService } from '../../services/toast.service';
import { AcademicSessionService } from '../../services/academic-session.service';
import { AcademicSession } from '../../interfaces/academic-session';
import { FeeWorkflowSettings } from '../../interfaces/fee-workflow';
import { FeeWorkflowService } from '../../services/fee-workflow.service';

@Component({
  selector: 'app-school-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './school-settings.component.html',
  styleUrl: './school-settings.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SchoolSettingsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  role = '';
  settings: SchoolSettings | null = null;
  loading = false;
  saving = false;
  savingRazorpay = false;
  feePolicy?: FeeWorkflowSettings;
  feePolicyLoading = false;
  feePolicySaving = false;

  isEditing = false;
  editForm: Partial<SchoolSettings> = {};

  activeTab: 'general' | 'razorpay' | 'features' | 'subscription' | 'staff-attendance' = 'general';
  razorpayKeyId = '';
  razorpayKeySecret = '';

  // Features tab
  featuresLoading = false;
  schoolFeatures: SchoolFeature[] = [];
  savingFeatureKey: string | null = null;

  // Subscription tab
  entitlementLoading = false;
  entitlement: SchoolEntitlementSummary | null = null;
  availablePlans: PlanDetail[] = [];
  plansLoading = false;
  upgradingPlanId: number | null = null;
  billingCycle: 'MONTHLY' | 'ANNUAL' = 'MONTHLY';
  subscriptionHistory: SubscriptionHistoryItem[] = [];
  historyLoading = false;

  // Academic sessions
  sessions: AcademicSession[] = [];
  sessionsLoading = false;
  creatingSession = false;

  // Staff attendance settings
  staffAttendanceForm: Partial<{
    schoolLatitude: number;
    schoolLongitude: number;
    geofenceRadius: number;
    schoolStartTime: string;
    lateThresholdMinutes: number;
    checkinWindowStart: string;
    checkinWindowEnd: string;
    staffAttendanceTrackingStartDate: string;
    teacherAttendanceReminderEnabled: boolean;
    teacherAttendanceReminderTime: string;
  }> = {};
  isEditingStaffAttendance = false;
  savingStaffAttendance = false;
  fetchingLocation = false;

  // Logo upload
  logoPreviewUrl: string | null = null;
  logoFile: File | null = null;
  uploadingLogo = false;

  // Report card header image upload
  headerImagePreviewUrl: string | null = null;
  headerImageFile: File | null = null;
  uploadingHeaderImage = false;

  readonly boardTypes = ['CBSE', 'ICSE', 'STATE', 'IB', 'IGCSE', 'OTHER'];
  readonly gradingSystems = [
    { value: 'CBSE', label: 'CBSE (A1/A2/B1…)' },
    { value: 'LETTER', label: 'Letter Grades (A+/A/B+…)' },
    { value: 'PERCENTAGE', label: 'Percentage Only' },
  ];
  readonly monthOptions = [
    { value: 1, label: 'January' }, { value: 2, label: 'February' }, { value: 3, label: 'March' },
    { value: 4, label: 'April' },   { value: 5, label: 'May' },       { value: 6, label: 'June' },
    { value: 7, label: 'July' },    { value: 8, label: 'August' },    { value: 9, label: 'September' },
    { value: 10, label: 'October' },{ value: 11, label: 'November' }, { value: 12, label: 'December' },
  ];
  readonly allDayOptions = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

  constructor(
    private schoolService: SchoolService,
    private authStateService: AuthStateService,
    public tenantService: TenantService,
    private cdr: ChangeDetectorRef,
    private logger: LoggerService,
    private toast: ToastService,
    private route: ActivatedRoute,
    private academicSessionService: AcademicSessionService,
    private feeWorkflowService: FeeWorkflowService
  ) {}

  ngOnInit(): void {
    const user = this.authStateService.getUser();
    this.role = user?.role ?? '';
    const tab = this.route.snapshot.queryParamMap.get('tab');
    if (tab === 'subscription' || tab === 'features' || tab === 'razorpay' || tab === 'staff-attendance') {
      this.activeTab = tab;
    }

    this.loadSettings();
    this.loadEntitlement();
    this.loadSessions();
    this.loadFeePolicy();
    if (this.activeTab === 'subscription') {
      this.loadAvailablePlans();
    }
  }

  loadFeePolicy(): void {
    this.feePolicyLoading = true;
    this.feeWorkflowService.getSettings().pipe(takeUntil(this.destroy$)).subscribe({
      next: (settings) => {
        this.feePolicy = settings;
        this.feePolicyLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.feePolicyLoading = false;
        this.toast.error('Fee policy unavailable', 'Unable to load the school fee policy.');
        this.cdr.markForCheck();
      },
    });
  }

  saveFeePolicy(): void {
    if (!this.feePolicy || this.feePolicySaving) return;
    this.feePolicySaving = true;
    const value: FeeWorkflowSettings = {
      ...this.feePolicy,
      operationalStatus: 'ACTIVE',
      automaticAnnualGeneration: false,
    };
    this.feeWorkflowService.updateSettings(value).pipe(takeUntil(this.destroy$)).subscribe({
      next: (saved) => {
        this.feePolicy = saved;
        this.feePolicySaving = false;
        this.toast.success('Fee policy saved', 'New previews and fee generation will use this policy.');
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.feePolicySaving = false;
        this.toast.error('Unable to save fee policy', error.error?.error || 'Please try again.');
        this.cdr.markForCheck();
      },
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadSettings(): void {
    this.loading = true;
    this.cdr.markForCheck();
    this.schoolService.getSettings().pipe(takeUntil(this.destroy$)).subscribe({
      next: (s) => {
        this.settings = s;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: (e) => {
        this.logger.error('Failed to load school settings', e);
        this.toast.error('Error', 'Failed to load school settings.');
        this.loading = false;
        this.cdr.markForCheck();
      }
    });
  }

  startEdit(): void {
    if (!this.settings) return;
    this.editForm = {
      name: this.settings.name,
      address: this.settings.address,
      city: this.settings.city,
      state: this.settings.state,
      pincode: this.settings.pincode,
      phone: this.settings.phone,
      email: this.settings.email,
      website: this.settings.website,
      boardType: this.settings.boardType,
      affiliationNumber: this.settings.affiliationNumber ?? '',
      schoolCode: this.settings.schoolCode ?? '',
      academicYearStartMonth: this.settings.academicYearStartMonth ?? 4,
      workingDays: this.settings.workingDays ?? '',
      periodsPerDay: this.settings.periodsPerDay ?? 8,
      gradingSystem: this.settings.gradingSystem ?? 'CBSE',
    };
    this.isEditing = true;
  }

  cancelEdit(): void {
    this.isEditing = false;
    this.editForm = {};
  }

  saveSettings(): void {
    if (!this.editForm.name?.trim()) {
      this.toast.warning('Validation', 'School name is required.');
      return;
    }
    if (this.editForm.phone && !/^\d{10}$/.test(this.editForm.phone.trim())) {
      this.toast.warning('Validation', 'Phone number must be exactly 10 digits.');
      return;
    }
    if (this.editForm.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.editForm.email.trim())) {
      this.toast.warning('Validation', 'Please enter a valid email address.');
      return;
    }
    if (this.editForm.pincode && !/^\d{6}$/.test(this.editForm.pincode.trim())) {
      this.toast.warning('Validation', 'Pincode must be exactly 6 digits.');
      return;
    }
    if (this.editForm.website && !/^https?:\/\/.+/.test(this.editForm.website.trim())) {
      this.toast.warning('Validation', 'Website URL must start with http:// or https://.');
      return;
    }
    if (!this.editForm.workingDays || this.editForm.workingDays.trim() === '') {
      this.toast.warning('Validation', 'At least one working day must be selected.');
      return;
    }
    this.saving = true;
    this.cdr.markForCheck();
    this.schoolService.updateSettings(this.editForm).pipe(takeUntil(this.destroy$)).subscribe({
      next: (updated) => {
        this.settings = updated;
        this.isEditing = false;
        this.editForm = {};
        this.saving = false;
        this.toast.success('Saved', 'School settings updated successfully.');
        this.cdr.markForCheck();
      },
      error: (e) => {
        this.logger.error('Failed to save school settings', e);
        this.toast.error('Error', 'Failed to save settings. Please try again.');
        this.saving = false;
        this.cdr.markForCheck();
      }
    });
  }

  get gradingSystemLabel(): string {
    const found = this.gradingSystems.find(g => g.value === this.settings?.gradingSystem);
    return found?.label ?? this.settings?.gradingSystem ?? 'CBSE';
  }

  get academicYearStartLabel(): string {
    const m = this.settings?.academicYearStartMonth;
    const found = this.monthOptions.find(o => o.value === m);
    return found?.label ?? 'April';
  }

  // ── Working days helpers ─────────────────────────────────────────────────

  isWorkingDay(day: string): boolean {
    const days = (this.editForm.workingDays ?? '').split(',').map(d => d.trim().toUpperCase());
    return days.includes(day.toUpperCase());
  }

  toggleWorkingDay(day: string): void {
    const days = (this.editForm.workingDays ?? '').split(',').map(d => d.trim().toUpperCase()).filter(d => d);
    const idx = days.indexOf(day.toUpperCase());
    if (idx >= 0) {
      days.splice(idx, 1);
    } else {
      // Insert in canonical order
      const order = this.allDayOptions;
      const insertAt = order.findIndex(d => !days.includes(d) ? false : d === day || order.indexOf(d) > order.indexOf(day));
      days.push(day.toUpperCase());
      days.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    }
    this.editForm.workingDays = days.join(',');
  }

  saveRazorpayKeys(): void {
    if (!this.razorpayKeyId.trim() || !this.razorpayKeySecret.trim()) {
      this.toast.warning('Validation', 'Both Razorpay Key ID and Key Secret are required.');
      return;
    }
    this.savingRazorpay = true;
    this.cdr.markForCheck();
    this.schoolService.updateRazorpayKeys(this.razorpayKeyId.trim(), this.razorpayKeySecret.trim())
      .pipe(takeUntil(this.destroy$)).subscribe({
        next: () => {
          this.razorpayKeySecret = '';
          this.savingRazorpay = false;
          if (this.settings) this.settings.razorpayConfigured = true;
          this.toast.success('Saved', 'Razorpay keys updated successfully.');
          this.cdr.markForCheck();
        },
        error: (e) => {
          this.logger.error('Failed to save Razorpay keys', e);
          this.toast.error('Error', 'Failed to save Razorpay keys. Please try again.');
          this.savingRazorpay = false;
          this.cdr.markForCheck();
        }
      });
  }

  loadFeatures(): void {
    if (this.schoolFeatures.length || this.featuresLoading) return;
    this.featuresLoading = true;
    this.cdr.markForCheck();
    this.schoolService.getSchoolFeatures().pipe(takeUntil(this.destroy$)).subscribe({
      next: (features) => {
        this.schoolFeatures = features;
        this.featuresLoading = false;
        this.cdr.markForCheck();
      },
      error: (e) => {
        this.logger.error('Failed to load school features', e);
        this.toast.error('Error', 'Failed to load features.');
        this.featuresLoading = false;
        this.cdr.markForCheck();
      }
    });
  }

  toggleFeatureOverride(feature: SchoolFeature): void {
    if (feature.isAlwaysOn || !feature.planGranted) return;
    const newState: 'DEFAULT' | 'DISABLED' = feature.overrideState === 'DISABLED' ? 'DEFAULT' : 'DISABLED';
    this.savingFeatureKey = feature.featureKey;
    this.cdr.markForCheck();
    this.schoolService.setFeatureOverride(feature.featureKey, newState).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        feature.overrideState = newState;
        feature.effectivelyOn = newState !== 'DISABLED';
        this.authStateService.setFeatureEnabled(feature.featureKey, feature.effectivelyOn);
        void this.authStateService.loadCurrentUser().finally(() => this.cdr.markForCheck());
        this.savingFeatureKey = null;
        this.toast.success('Saved', `Feature ${newState === 'DISABLED' ? 'disabled' : 'restored'}.`);
        this.cdr.markForCheck();
      },
      error: (e) => {
        this.logger.error('Failed to set feature override', e);
        this.toast.error('Error', 'Failed to update feature.');
        this.savingFeatureKey = null;
        this.cdr.markForCheck();
      }
    });
  }

  loadEntitlement(force = false): void {
    if (!force && (this.entitlement || this.entitlementLoading)) return;
    this.entitlementLoading = true;
    this.cdr.markForCheck();
    this.schoolService.getEntitlement().pipe(takeUntil(this.destroy$)).subscribe({
      next: (e) => {
        this.entitlement = e;
        this.entitlementLoading = false;
        this.cdr.markForCheck();
        this.loadSubscriptionHistory(force);
      },
      error: (err) => {
        this.logger.error('Failed to load entitlement', err);
        this.toast.error('Error', 'Failed to load subscription data.');
        this.entitlementLoading = false;
        this.cdr.markForCheck();
      }
    });
  }

  loadSubscriptionHistory(force = false): void {
    if (!force && (this.subscriptionHistory.length || this.historyLoading)) return;
    this.historyLoading = true;
    this.cdr.markForCheck();
    this.schoolService.getSubscriptionHistory().pipe(takeUntil(this.destroy$)).subscribe({
      next: (history) => {
        this.subscriptionHistory = history;
        this.historyLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.historyLoading = false;
        this.cdr.markForCheck();
      }
    });
  }

  eventTypeLabel(eventType: string): string {
    const labels: Record<string, string> = {
      TRIAL_STARTED:   'Trial Started',
      PLAN_ASSIGNED:   'Plan Assigned',
      PLAN_UPDATED:    'Plan Updated',
      PAYMENT_SUCCESS: 'Payment Successful',
      STATUS_CHANGED:  'Status Changed',
    };
    return labels[eventType] ?? eventType;
  }

  usagePct(current: number, max: number | null): number {
    if (!max || max <= 0) return 0;
    return Math.min(100, Math.round((current / max) * 100));
  }

  usageBarColor(pct: number, softPct: number | null, hardPct: number | null): string {
    const soft = softPct ?? 90;
    const hard = hardPct ?? 105;
    if (pct >= hard) return '#dc2626';
    if (pct >= soft) return '#d97706';
    return '#059669';
  }

  loadAvailablePlans(): void {
    if (this.availablePlans.length || this.plansLoading) return;
    this.plansLoading = true;
    this.cdr.markForCheck();
    this.schoolService.getPublicPlans().pipe(takeUntil(this.destroy$)).subscribe({
      next: (plans) => {
        this.availablePlans = plans;
        this.plansLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.plansLoading = false;
        this.cdr.markForCheck();
      }
    });
  }

  startUpgrade(plan: PlanDetail): void {
    if (this.upgradingPlanId) return;
    const price = this.billingCycle === 'ANNUAL' ? plan.annualPricePaise : plan.monthlyPricePaise;
    if (!price || price <= 0) {
      this.toast.info('Free Plan', 'Contact support to activate this plan.');
      return;
    }
    this.upgradingPlanId = plan.id;
    this.cdr.markForCheck();
    this.schoolService.createUpgradeOrder(plan.id, this.billingCycle).pipe(takeUntil(this.destroy$)).subscribe({
      next: (order) => this.openRazorpay(order, plan),
      error: (err) => {
        const msg = err?.error;
        this.toast.error('Error', typeof msg === 'string' ? msg : 'Failed to create payment order.');
        this.upgradingPlanId = null;
        this.cdr.markForCheck();
      }
    });
  }

  private openRazorpay(order: any, plan: PlanDetail): void {
    this.loadRazorpayScript().then(() => {
      const options = {
        key: order.razorpayKey,
        amount: order.amount,
        currency: 'INR',
        name: 'Edunexify',
        description: `${plan.name} Plan — ${this.billingCycle === 'ANNUAL' ? 'Annual' : 'Monthly'}`,
        order_id: order.orderId,
        handler: (response: any) => this.verifyUpgrade(response, plan.id),
        modal: { ondismiss: () => { this.upgradingPlanId = null; this.cdr.markForCheck(); } },
        theme: { color: '#1d4ed8' }
      };
      new (window as any).Razorpay(options).open();
    }).catch(() => {
      this.toast.error('Error', 'Failed to load payment gateway. Please try again.');
      this.upgradingPlanId = null;
      this.cdr.markForCheck();
    });
  }

  private verifyUpgrade(response: any, planId: number): void {
    const payload = {
      razorpay_payment_id: response.razorpay_payment_id,
      razorpay_order_id:   response.razorpay_order_id,
      razorpay_signature:  response.razorpay_signature,
      planId:              String(planId),
      billingCycle:        this.billingCycle,
    };
    this.schoolService.verifyUpgradePayment(payload).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.toast.success('Upgraded!', 'Your subscription has been activated successfully.');
        this.upgradingPlanId = null;
        this.entitlement = null;
        this.entitlementLoading = false; // reset guard so force reload works
        this.loadEntitlement(true);
        this.cdr.markForCheck();
      },
      error: () => {
        this.toast.error('Verification Failed', 'Payment received but activation failed. Please contact support with your payment ID.');
        this.upgradingPlanId = null;
        this.cdr.markForCheck();
      }
    });
  }

  private loadRazorpayScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      if ((window as any).Razorpay) { resolve(); return; }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Razorpay'));
      document.body.appendChild(script);
    });
  }

  private static readonly ALLOWED_LOGO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

  onLogoSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!SchoolSettingsComponent.ALLOWED_LOGO_TYPES.includes(file.type)) {
      this.toast.warning('Unsupported File Type', 'Logo must be a JPEG, PNG, or WebP image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.toast.warning('File Too Large', 'Logo must be under 5 MB.');
      return;
    }
    this.logoFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
      this.logoPreviewUrl = e.target?.result as string;
      this.cdr.markForCheck();
    };
    reader.readAsDataURL(file);
  }

  cancelLogoUpload(): void {
    this.logoFile = null;
    this.logoPreviewUrl = null;
    this.cdr.markForCheck();
  }

  uploadLogo(): void {
    if (!this.logoFile) return;
    this.uploadingLogo = true;
    this.cdr.markForCheck();
    this.schoolService.uploadLogoDirect(this.logoFile).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        if (this.settings) this.settings.logoUrl = res.displayUrl;
        this.logoFile = null;
        this.logoPreviewUrl = null;
        this.uploadingLogo = false;
        this.toast.success('Logo Updated', 'School logo uploaded successfully.');
        this.cdr.markForCheck();
      },
      error: (e) => {
        this.logger.error('Failed to upload school logo', e);
        this.toast.error('Upload Failed', e?.error?.message || 'Could not upload logo. Please try again.');
        this.uploadingLogo = false;
        this.cdr.markForCheck();
      }
    });
  }

  onHeaderImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const maxSize = 10 * 1024 * 1024;
    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      this.toast.error('Invalid File', 'Only PNG, JPG, or WebP images are supported.');
      return;
    }
    if (file.size > maxSize) {
      this.toast.error('File Too Large', 'Header image must be under 10 MB.');
      return;
    }
    this.headerImageFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
      this.headerImagePreviewUrl = e.target?.result as string;
      this.cdr.markForCheck();
    };
    reader.readAsDataURL(file);
  }

  cancelHeaderImageUpload(): void {
    this.headerImageFile = null;
    this.headerImagePreviewUrl = null;
    this.cdr.markForCheck();
  }

  uploadHeaderImage(): void {
    if (!this.headerImageFile) return;
    this.uploadingHeaderImage = true;
    this.cdr.markForCheck();
    this.schoolService.uploadReportCardHeaderDirect(this.headerImageFile).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        if (this.settings) this.settings.reportCardHeaderImageUrl = res.displayUrl;
        this.headerImageFile = null;
        this.headerImagePreviewUrl = null;
        this.uploadingHeaderImage = false;
        this.toast.success('Header Updated', 'Report card header image uploaded successfully.');
        this.cdr.markForCheck();
      },
      error: (e) => {
        this.logger.error('Failed to upload report card header', e);
        this.toast.error('Upload Failed', e?.error?.message || 'Could not upload header image. Please try again.');
        this.uploadingHeaderImage = false;
        this.cdr.markForCheck();
      }
    });
  }

  removeHeaderImage(): void {
    this.toast.confirm({
      title: 'Remove Header Image',
      message: 'This will revert to the auto-generated header on all report cards. Continue?',
      confirmText: 'Remove',
      cancelText: 'Cancel',
      danger: true
    }).then(confirmed => {
      if (!confirmed) return;
      this.schoolService.removeReportCardHeader().pipe(takeUntil(this.destroy$)).subscribe({
        next: () => {
          if (this.settings) this.settings.reportCardHeaderImageUrl = null;
          this.toast.success('Removed', 'Report card header image removed.');
          this.cdr.markForCheck();
        },
        error: () => {
          this.toast.error('Error', 'Failed to remove header image.');
        }
      });
    });
  }

  featuresByCategory(): { category: string; features: SchoolFeature[] }[] {
    const map = new Map<string, SchoolFeature[]>();
    for (const f of this.schoolFeatures) {
      if (!map.has(f.category)) map.set(f.category, []);
      map.get(f.category)!.push(f);
    }
    return Array.from(map.entries()).map(([category, features]) => ({ category, features }));
  }

  get isAdmin(): boolean {
    return this.role === 'ADMIN';
  }

  get schoolInitials(): string {
    const name = this.settings?.name ?? '';
    return name.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase() || '?';
  }

  // ── Academic Sessions ──────────────────────────────────────────────
  loadSessions(): void {
    this.sessionsLoading = true;
    this.cdr.markForCheck();
    this.academicSessionService.getAllSessions().pipe(takeUntil(this.destroy$)).subscribe({
      next: (sessions) => {
        this.sessions = sessions;
        this.sessionsLoading = false;
        this.cdr.markForCheck();
      },
      error: (e) => {
        this.logger.error('Failed to load academic sessions', e);
        this.sessionsLoading = false;
        this.cdr.markForCheck();
      }
    });
  }

  createNextSession(): void {
    const startMonth = this.settings?.academicYearStartMonth || 4;
    let nextStartYear: number;

    if (this.sessions.length === 0) {
      const now = new Date();
      nextStartYear = (now.getMonth() + 1) >= startMonth ? now.getFullYear() : now.getFullYear() - 1;
    } else {
      const sorted = [...this.sessions].sort((a, b) => a.label.localeCompare(b.label));
      const lastLabel = sorted[sorted.length - 1].label;
      nextStartYear = parseInt(lastLabel.split('-')[0]) + 1;
    }

    const label = `${nextStartYear}-${nextStartYear + 1}`;
    if (this.sessions.some(s => s.label === label)) {
      this.toast.warning('Exists', `Session ${label} already exists.`);
      return;
    }

    const startDate = `${nextStartYear}-${String(startMonth).padStart(2, '0')}-01`;
    const endDt = new Date(nextStartYear + 1, startMonth - 1, 0);
    const endDate = `${endDt.getFullYear()}-${String(endDt.getMonth() + 1).padStart(2, '0')}-${String(endDt.getDate()).padStart(2, '0')}`;

    this.creatingSession = true;
    this.cdr.markForCheck();
    this.academicSessionService.createSession({
      label, startDate, endDate, current: this.sessions.length === 0
    } as any).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.toast.success('Created', `Session ${label} created.`);
        this.creatingSession = false;
        this.loadSessions();
      },
      error: (e) => {
        this.logger.error('Failed to create session', e);
        const msg = typeof e?.error === 'string' ? e.error : e?.error?.message;
        this.toast.error('Error', msg || 'Failed to create session.');
        this.creatingSession = false;
        this.cdr.markForCheck();
      }
    });
  }

  /** Phase G: "Make Current" now shows the class-teacher activation impact BEFORE confirming,
   *  since the session switch itself is the deliberate activation event — see
   *  AcademicSessionActivationService (backend) for why this is one atomic action rather than a
   *  separate mandatory step. {@code configuredCount} (not becomingLive/changing/clearing alone)
   *  is what actually tells us whether the target has zero/unusable configuration — those counts
   *  alone can't distinguish "nothing configured" from "configured but already matches live." */
  async setCurrentSession(session: AcademicSession): Promise<void> {
    const activeSession = this.sessions.find(s => s.current);
    const fromHtml = activeSession
      ? `<strong>${activeSession.label}</strong> (${this.formatSessionRange(activeSession)})`
      : '<em>none set</em>';

    let preview;
    try {
      preview = await firstValueFrom(this.academicSessionService.getActivationPreview(session.id));
    } catch (e) {
      this.logger.error('Failed to load class-teacher activation preview', e);
      this.toast.error('Error', 'Failed to check the class-teacher activation impact. Please try again.');
      return;
    }

    const configuredCount = preview.configuredCount ?? 0;
    const noUsableConfiguration = configuredCount === 0
      || (preview.ineligibleTeacher + preview.invalidClassOrSection) === configuredCount;
    const showsClearingWarning = noUsableConfiguration && preview.clearing > 0;
    const warningHtml = showsClearingWarning
      ? `<p style="color:#92400e;"><strong>Warning:</strong> This session has no usable class-teacher ` +
        `responsibilities configured. Making it current will remove the existing live class-teacher ` +
        `assignment${preview.clearing === 1 ? '' : 's'} (${preview.clearing}).</p>`
      : '';

    const confirmed = await this.toast.confirm({
      title: `Make ${session.label} Current?`,
      html: `<p>Current session: ${fromHtml}</p>` +
            `<p>Activating: <strong>${session.label}</strong> (${this.formatSessionRange(session)})</p>` +
            `<p>This will:</p>` +
            `<ul style="text-align:left; margin:4px 0 12px;">` +
              `<li>make ${session.label} the school's current academic session</li>` +
              `<li>make its timetable the operational/current timetable</li>` +
              `<li>activate its configured class-teacher responsibilities</li>` +
            `</ul>` +
            `<p><strong>Class-teacher preview:</strong> Unchanged ${preview.unchanged}, ` +
            `Becoming live ${preview.becomingLive}, Changing ${preview.changing}, Removed ${preview.clearing}.</p>` +
            warningHtml,
      confirmText: 'Confirm & Make Current',
      cancelText: 'Cancel',
      icon: showsClearingWarning ? 'warning' : 'question',
      danger: showsClearingWarning,
    });
    if (!confirmed) return;

    this.academicSessionService.setCurrentSession(session.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: (outcome) => {
        if (outcome.activationPerformed && outcome.activation) {
          this.toast.success('Updated', `${session.label} is now current. Class-teacher access updated: ` +
            `${outcome.activation.applied} granted, ${outcome.activation.cleared} cleared.`);
        } else {
          this.toast.success('Updated', `${session.label} is already the current session.`);
        }
        this.loadSessions();
      },
      error: (e) => {
        this.logger.error('Failed to set current session', e);
        this.toast.error('Error', 'Failed to update current session.');
      }
    });
  }

  private formatSessionRange(session: AcademicSession): string {
    const format = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    return `${format(session.startDate)} – ${format(session.endDate)}`;
  }

  async deleteSession(session: AcademicSession): Promise<void> {
    const confirmed = await this.toast.confirm({
      title: `Delete Session ${session.label}?`,
      html: `<p>This will permanently delete the academic session <strong>${session.label}</strong> and all associated fee structure rules and student fee configs.</p><p>This action <strong>cannot be undone</strong>.</p>`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      danger: true,
      icon: 'danger',
      requiredInput: 'DELETE',
    });
    if (!confirmed) return;

    this.sessionsLoading = true;
    this.cdr.markForCheck();
    this.academicSessionService.deleteSession(session.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.toast.success('Deleted', `Session ${session.label} has been deleted.`);
        this.loadSessions();
      },
      error: (e) => {
        this.logger.error('Failed to delete session', e);
        const msg = typeof e?.error === 'string' ? e.error : e?.error?.message;
        this.toast.error('Error', msg || 'Failed to delete session.');
        this.sessionsLoading = false;
        this.cdr.markForCheck();
      }
    });
  }

  // ── Staff Attendance Settings ─────────────────────────────────────
  startStaffAttendanceEdit(): void {
    if (!this.settings) return;
    this.staffAttendanceForm = {
      schoolLatitude: this.settings.schoolLatitude ?? undefined,
      schoolLongitude: this.settings.schoolLongitude ?? undefined,
      geofenceRadius: this.settings.geofenceRadius ?? 200,
      schoolStartTime: this.settings.schoolStartTime ?? '',
      lateThresholdMinutes: this.settings.lateThresholdMinutes ?? 5,
      checkinWindowStart: this.settings.checkinWindowStart ?? '',
      checkinWindowEnd: this.settings.checkinWindowEnd ?? '',
      staffAttendanceTrackingStartDate: this.settings.staffAttendanceTrackingStartDate ?? '',
      teacherAttendanceReminderEnabled: this.settings.teacherAttendanceReminderEnabled ?? false,
      teacherAttendanceReminderTime: this.settings.teacherAttendanceReminderTime ?? '',
    };
    this.isEditingStaffAttendance = true;
  }

  cancelStaffAttendanceEdit(): void {
    this.isEditingStaffAttendance = false;
    this.staffAttendanceForm = {};
  }

  useCurrentLocation(): void {
    if (!navigator.geolocation) {
      this.toast.warning('Not Supported', 'Geolocation is not supported by your browser.');
      return;
    }
    this.fetchingLocation = true;
    this.cdr.markForCheck();
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.staffAttendanceForm.schoolLatitude = Math.round(pos.coords.latitude * 1000000) / 1000000;
        this.staffAttendanceForm.schoolLongitude = Math.round(pos.coords.longitude * 1000000) / 1000000;
        this.fetchingLocation = false;
        this.toast.success('Location Found', 'GPS coordinates captured successfully.');
        this.cdr.markForCheck();
      },
      (err) => {
        this.fetchingLocation = false;
        this.toast.error('Location Error', 'Could not get your location. Please enter coordinates manually.');
        this.logger.error('Geolocation error', err);
        this.cdr.markForCheck();
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  saveStaffAttendanceSettings(): void {
    const f = this.staffAttendanceForm;
    if (f.schoolLatitude == null || f.schoolLongitude == null) {
      this.toast.warning('Validation', 'School coordinates are required.');
      return;
    }
    if (!f.schoolStartTime) {
      this.toast.warning('Validation', 'School start time is required.');
      return;
    }
    if (!f.checkinWindowStart || !f.checkinWindowEnd) {
      this.toast.warning('Validation', 'Check-in window start and end times are required.');
      return;
    }
    if (!f.staffAttendanceTrackingStartDate) {
      this.toast.warning('Validation', 'Staff attendance tracking start date is required.');
      return;
    }
    if (f.teacherAttendanceReminderEnabled && !f.teacherAttendanceReminderTime) {
      this.toast.warning('Validation', 'Reminder time is required when the teacher attendance reminder is enabled.');
      return;
    }
    this.savingStaffAttendance = true;
    this.cdr.markForCheck();
    this.schoolService.updateSettings(f as any).pipe(takeUntil(this.destroy$)).subscribe({
      next: (updated) => {
        this.settings = updated;
        this.isEditingStaffAttendance = false;
        this.savingStaffAttendance = false;
        this.toast.success('Saved', 'Staff attendance settings updated successfully.');
        this.cdr.markForCheck();
      },
      error: (e) => {
        this.logger.error('Failed to save staff attendance settings', e);
        this.toast.error('Error', 'Failed to save settings. Please try again.');
        this.savingStaffAttendance = false;
        this.cdr.markForCheck();
      }
    });
  }

  get isStaffAttendanceConfigured(): boolean {
    return !!(this.settings?.schoolLatitude && this.settings?.schoolLongitude && this.settings?.schoolStartTime);
  }

  /** Non-blocking guidance only — backend validation never requires the reminder to fall
   * inside the check-in window, so this never prevents a save. "HH:mm" strings compare
   * correctly as plain strings. */
  get reminderTimeWarning(): string | null {
    const f = this.staffAttendanceForm;
    if (!f.teacherAttendanceReminderEnabled || !f.teacherAttendanceReminderTime) return null;
    const time = f.teacherAttendanceReminderTime;
    if (f.checkinWindowStart && time < f.checkinWindowStart) {
      return `This is before the check-in window opens (${f.checkinWindowStart}) — teachers may not have had a chance to check in yet.`;
    }
    if (f.checkinWindowEnd && time > f.checkinWindowEnd) {
      return `This is well after the check-in window closes (${f.checkinWindowEnd}) — consider an earlier time so the reminder is still useful.`;
    }
    return null;
  }
}
