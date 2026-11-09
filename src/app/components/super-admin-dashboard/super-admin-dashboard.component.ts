import { adminProfileError } from '../../utils/admin-validation.util';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, forkJoin, takeUntil } from 'rxjs';
import { ToastService } from '../../services/toast.service';
import { FestivalCampaign, FestivalCampaignService } from '../../services/festival-campaign.service';

import {
  SchoolService,
  SuperAdminStats,
  SchoolSettings,
  PlanDetail,
  FeatureCatalogItem,
  GlobalSubscriptionConfig,
  SubscriptionHealthItem,
  SchoolFeature,
  SchoolSubscription,
} from '../../services/school.service';
import { LoggerService } from '../../services/logger.service';
import { activationDialog, activationResultMessage, schoolEditPayload, schoolOnboardPayload, schoolSlugFromName, onboardingResultDialog, setupLinkError, setupLinkFeedback } from '../../utils/school-admin.util';
import { AdminService } from '../../services/admin.service';
import { FeatureOverrideActions, featureOperationKey, featureOverrideActions, featureOverrideErrorMessage } from '../../utils/feature-override.util';

interface OnboardForm {
  name: string;
  slug: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  email: string;
  website: string;
  boardType: string;
  academicYearStartMonth: number;
  adminUserId: string;
  adminEmail: string;
  adminName: string;
  adminPhone: string;
  adminDob: string;
  adminGender: string;
  trialPlanId: number | null;
  trialEndsAt: string;
}

interface EditForm {
  name: string;
  slug: string;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  contactPersonName: string | null;
  boardType: string | null;
  plan: string | null;
  maxStudents: number | null;
  expiryDate: string | null;
}

@Component({
  selector: 'app-super-admin-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './super-admin-dashboard.component.html',
  styleUrl: './super-admin-dashboard.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuperAdminDashboardComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  activeTab: 'overview' | 'schools' | 'plans' | 'health' = 'overview';
  festival: FestivalCampaign | null = null;
  festivalSaving = false;
  stats: SuperAdminStats | null = null;
  schools: SchoolSettings[] = [];
  loading = false;

  // Onboard form
  showOnboardForm = false;
  onboarding = false;
  onboardForm: OnboardForm = this.emptyOnboardForm();

  // Edit form
  editingSchoolId: number | null = null;
  editForm: EditForm = this.emptyEditForm();
  saving = false;
  /** Admin ID a setup link is being sent for (blocks a second click). */
  sendingSetupLinkFor: string | null = null;

  readonly legacyPlans = ['TRIAL', 'FREE', 'BASIC', 'STANDARD', 'PREMIUM', 'ENTERPRISE'];
  readonly boardTypes = ['CBSE', 'ICSE', 'STATE', 'IB', 'IGCSE', 'OTHER'];
  readonly academicMonths = [
    { value: 1, label: 'January' }, { value: 2, label: 'February' }, { value: 3, label: 'March' },
    { value: 4, label: 'April' }, { value: 5, label: 'May' }, { value: 6, label: 'June' },
    { value: 7, label: 'July' }, { value: 8, label: 'August' }, { value: 9, label: 'September' },
    { value: 10, label: 'October' }, { value: 11, label: 'November' }, { value: 12, label: 'December' },
  ];

  constructor(
    private schoolService: SchoolService,
    private festivalService: FestivalCampaignService,
    private logger: LoggerService,
    private cdr: ChangeDetectorRef,
    private toast: ToastService,
    private adminService: AdminService,
  ) {}

  ngOnInit(): void {
    this.loadOverview();
    this.loadFestival();
  }

  loadFestival(): void {
    this.festivalService.getCurrent().pipe(takeUntil(this.destroy$)).subscribe({
      next: campaign => { this.festival = campaign; this.cdr.markForCheck(); },
      error: () => { this.festival = null; this.cdr.markForCheck(); },
    });
  }

  toggleFestival(): void {
    if (!this.festival || this.festivalSaving) return;
    this.festivalSaving = true;
    this.festivalService.setEnabled(!this.festival.enabled).pipe(takeUntil(this.destroy$)).subscribe({
      next: campaign => {
        this.festival = campaign;
        this.festivalSaving = false;
        this.toast.success(campaign.enabled ? 'Diwali greeting enabled' : 'Diwali greeting disabled');
        this.cdr.markForCheck();
      },
      error: () => {
        this.festivalSaving = false;
        this.toast.error('Could not update Diwali greeting');
        this.cdr.markForCheck();
      },
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadOverview(): void {
    this.loading = true;
    this.cdr.markForCheck();

    forkJoin({
      stats: this.schoolService.getDashboard(),
      schools: this.schoolService.listAllSchools(),
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ stats, schools }) => {
          this.stats = stats;
          this.schools = schools;
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.logger.error('Failed to load super admin data', err);
          this.loading = false;
          this.cdr.markForCheck();
          this.toast.error('Error', 'Failed to load dashboard data.');
        },
      });
  }

  submitOnboard(): void {
    if (this.onboarding) return;
    const error = this.validateOnboardForm();
    if (error) {
      this.toast.warning('Validation Error', error);
      return;
    }

    this.onboarding = true;
    this.cdr.markForCheck();

    const payload = schoolOnboardPayload({
      ...this.onboardForm,
      trialPlanId: this.onboardForm.trialPlanId || null,
    });

    this.schoolService
      .onboardSchool(payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (school) => {
          this.schools = [school, ...this.schools];
          this.showOnboardForm = false;
          this.onboardForm = this.emptyOnboardForm();
          this.onboarding = false;
          this.cdr.markForCheck();
          this.toast.confirm(onboardingResultDialog(school, { userId: payload.adminUserId, email: payload.adminEmail }));
        },
        error: (err) => {
          this.logger.error('Onboard failed', err);
          this.onboarding = false;
          this.cdr.markForCheck();
          const msg = err?.error?.message ?? err?.error ?? 'Failed to onboard school.';
          this.toast.error('Error', typeof msg === 'string' ? msg : 'Failed to onboard school.');
        },
      });
  }

  private validateEditForm(): string | null {
    const f = this.editForm;
    const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRx = /^[0-9]{10}$/;
    const slugRx  = /^[a-z0-9][a-z0-9-]*$/;

    if (!f.name.trim())                             return 'School name is required.';
    if (f.slug.trim() && !slugRx.test(f.slug.trim()))
                                                    return 'Slug must be lowercase letters, digits, and hyphens only.';
    if (f.email && !emailRx.test(f.email.trim()))   return 'School email is not valid.';
    if (f.phone && !phoneRx.test(f.phone.trim()))   return 'School phone must be exactly 10 digits.';
    return null;
  }

  private validateOnboardForm(): string | null {
    const f = this.onboardForm;
    const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRx = /^[0-9]{10}$/;
    const slugRx  = /^[a-z0-9][a-z0-9-]*$/;

    if (!f.name.trim())                               return 'School name is required.';
    if (!f.slug.trim())                               return 'Slug is required.';
    if (!slugRx.test(f.slug.trim()))                  return 'Slug must be lowercase letters, digits, and hyphens only.';
    if (f.email && !emailRx.test(f.email.trim()))     return 'School email is not valid.';
    if (f.phone && !phoneRx.test(f.phone.trim()))     return 'School phone must be exactly 10 digits.';
    if (!f.adminName.trim())                          return 'Admin name is required.';
    if (!f.adminUserId.trim())                        return 'Admin user ID is required.';
    if (!f.adminEmail.trim())                         return 'Admin email is required.';
    if (!emailRx.test(f.adminEmail.trim()))           return 'Admin email is not a valid email address.';
    if (!f.adminPhone.trim())                         return 'Admin phone is required.';
    if (!phoneRx.test(f.adminPhone.trim()))           return 'Admin phone must be exactly 10 digits.';
    if (!f.adminDob)                                  return 'Admin date of birth is required.';
    if (!f.adminGender?.trim())                       return 'Admin gender is required.';
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(f.adminUserId.trim())) return 'Admin ID must contain 1–100 letters, digits, dots, underscores or hyphens.';
    const profileError = adminProfileError({ name: f.adminName, email: f.adminEmail, phoneNumber: f.adminPhone, dob: f.adminDob, gender: f.adminGender });
    if (profileError) return profileError;
    return null;
  }

  startEdit(school: SchoolSettings): void {
    this.editingSchoolId = school.id;
    this.editForm = {
      name: school.name,
      slug: school.slug ?? '',
      address: school.address,
      city: school.city,
      state: school.state,
      pincode: school.pincode,
      phone: school.phone,
      email: school.email,
      website: school.website ?? '',
      contactPersonName: school.contactPersonName ?? '',
      boardType: school.boardType,
      plan: school.plan,
      maxStudents: school.maxStudents,
      expiryDate: school.expiryDate,
    };
    this.cdr.markForCheck();
  }

  /** Emails the school's administrator a fresh one-hour setup link (never a password). */
  sendSetupLink(adminUserId: string | null | undefined): void {
    if (!adminUserId || this.sendingSetupLinkFor) return;
    this.sendingSetupLinkFor = adminUserId;
    this.cdr.markForCheck();
    this.adminService.sendSetupLink(adminUserId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (result) => {
        this.sendingSetupLinkFor = null;
        const feedback = setupLinkFeedback(result);
        feedback.level === 'success' ? this.toast.success(feedback.title, feedback.message) : this.toast.info(feedback.title, feedback.message);
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.logger.error('Setup link failed', err);
        this.sendingSetupLinkFor = null;
        this.toast.error('Setup link not sent', setupLinkError(err));
        this.cdr.markForCheck();
      },
    });
  }

  cancelEdit(): void {
    this.editingSchoolId = null;
    this.editForm = this.emptyEditForm();
    this.cdr.markForCheck();
  }

  saveEdit(): void {
    if (!this.editingSchoolId) return;

    const error = this.validateEditForm();
    if (error) {
      this.toast.warning('Validation Error', error);
      return;
    }

    this.saving = true;
    this.cdr.markForCheck();

    const payload = schoolEditPayload(this.editForm);

    this.schoolService
      .updateSchoolAll(this.editingSchoolId, payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (updated) => {
          this.schools = this.schools.map((s) =>
            s.id === updated.id ? updated : s
          );

          this.saving = false;
          this.editingSchoolId = null;
          this.cdr.markForCheck();
          this.toast.success('Saved');
        },
        error: (err) => {
          this.logger.error('Save failed', err);
          this.saving = false;
          this.cdr.markForCheck();
          const msg = err?.error?.message;
          this.toast.error('Error', typeof msg === 'string' && msg.trim() ? msg : 'Failed to save school settings.');
        },
      });
  }

  confirmToggleActive(school: SchoolSettings): void {
    const action = school.active ? 'deactivate' : 'activate';
    this.toast.confirm(activationDialog(school)).then((confirmed) => {
      if (!confirmed) return;

      this.schoolService
        .deleteSchool(school.id)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.schools = this.schools.map((s) =>
              s.id === school.id ? { ...s, active: !s.active } : s
            );
            this.cdr.markForCheck();
            this.toast.success('Done', activationResultMessage(school, !school.active));
          },
          error: (err) => {
            this.logger.error('Toggle active failed', err);
            this.toast.error('Error', `Failed to ${action} school.`);
            this.cdr.markForCheck();
          },
        });
    });
  }

  generateSlug(): void {
    this.onboardForm.slug = schoolSlugFromName(this.onboardForm.name);
    this.cdr.markForCheck();
  }

  formatCurrency(amount: number): string {
    return `₹${amount.toLocaleString('en-IN')}`;
  }

  trackById(_: number, school: SchoolSettings): number {
    return school.id;
  }

  get activeCount(): number {
    return this.schools.filter((s) => s.active).length;
  }

  // ── Health Tab ────────────────────────────────────────────────────────────

  healthData: SubscriptionHealthItem[] = [];
  healthLoading = false;

  reloadHealthTab(): void {
    this.healthData = [];
    this.loadHealthTab();
  }

  loadHealthTab(): void {
    if (this.healthLoading || this.healthData.length) return;
    this.healthLoading = true;
    this.cdr.markForCheck();
    this.schoolService.getSubscriptionHealth().pipe(takeUntil(this.destroy$)).subscribe({
      next: (data) => {
        this.healthData = data;
        this.healthLoading = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.logger.error('Failed to load subscription health', err);
        this.healthLoading = false;
        this.cdr.markForCheck();
        this.toast.error('Error', 'Failed to load subscription health data.');
      }
    });
  }

  healthStatusClass(status: string | null): string {
    switch (status) {
      case 'ACTIVE':  return 'health-status-active';
      case 'TRIAL':   return 'health-status-trial';
      case 'GRACE':   return 'health-status-grace';
      case 'EXPIRED': return 'health-status-expired';
      default:        return 'health-status-none';
    }
  }

  healthExpiryDate(item: SubscriptionHealthItem): string | null {
    if (item.subscriptionStatus === 'TRIAL') return item.trialEndsAt;
    if (item.subscriptionStatus === 'GRACE') return item.graceEndsAt;
    return item.expiresAt;
  }

  // ── Plans Tab ─────────────────────────────────────────────────────────────

  plans: PlanDetail[] = [];
  allFeatures: FeatureCatalogItem[] = [];
  subscriptionConfig: GlobalSubscriptionConfig | null = null;
  plansLoading = false;

  // plan create/edit
  editingPlanId: number | null = null;
  showPlanForm = false;
  savingPlan = false;
  planForm = this.emptyPlanForm();

  // feature removal policy picker
  removingFeatureKey: string | null = null;
  removingPlanId: number | null = null;
  removalPolicy = 'NEXT_MONTHLY';
  readonly removalPolicies = [
    { value: 'IMMEDIATE',      label: 'Immediately' },
    { value: 'NEXT_MONTHLY',   label: 'Next month' },
    { value: 'NEXT_QUARTERLY', label: 'Next quarter' },
    { value: 'NEXT_ANNUAL',    label: 'Next academic year (Apr 1)' },
  ];

  // global config
  editingConfig = false;
  configForm = { gracePeriodDays: 15, defaultTrialDays: 30, expiryNotifyDays: 1 };

  loadPlansTab(): void {
    if (this.plans.length && this.allFeatures.length) return; // already loaded
    this.plansLoading = true;
    this.cdr.markForCheck();

    forkJoin({
      plans:   this.schoolService.getPlans(true),
      features: this.schoolService.getFeatureCatalog(),
      config:  this.schoolService.getSubscriptionConfig(),
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: ({ plans, features, config }) => {
        this.plans              = plans;
        this.allFeatures        = features;
        this.subscriptionConfig = config;
        this.configForm         = {
          gracePeriodDays:  config.gracePeriodDays,
          defaultTrialDays: config.defaultTrialDays,
          expiryNotifyDays: config.expiryNotifyDays,
        };
        this.plansLoading = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.logger.error('Failed to load plans tab', err);
        this.plansLoading = false;
        this.cdr.markForCheck();
        this.toast.error('Error', 'Failed to load plans data.');
      },
    });
  }

  openCreatePlan(): void {
    this.editingPlanId = null;
    this.planForm      = this.emptyPlanForm();
    this.showPlanForm  = true;
    this.cdr.markForCheck();
  }

  openEditPlan(plan: PlanDetail): void {
    this.editingPlanId = plan.id;
    this.planForm = {
      name:                 plan.name,
      tier:                 plan.tier,
      isPublic:             plan.isPublic,
      maxStudents:          plan.maxStudents ?? null,
      studentSoftLimitPct:  plan.studentSoftLimitPct,
      studentHardLimitPct:  plan.studentHardLimitPct,
      maxStaff:             plan.maxStaff ?? null,
      staffSoftLimitPct:    plan.staffSoftLimitPct,
      staffHardLimitPct:    plan.staffHardLimitPct,
      storageGbLimit:       plan.storageGbLimit ?? null,
      storageSoftLimitPct:  plan.storageSoftLimitPct,
      storageHardLimitPct:  plan.storageHardLimitPct,
      monthlyPricePaise:    plan.monthlyPricePaise ?? null,
      annualPricePaise:     plan.annualPricePaise ?? null,
      priorityScore:        plan.priorityScore,
    };
    this.showPlanForm = true;
    this.cdr.markForCheck();
  }

  cancelPlanForm(): void {
    this.showPlanForm  = false;
    this.editingPlanId = null;
    this.cdr.markForCheck();
  }

  savePlan(): void {
    if (!this.planForm.name?.trim() || !this.planForm.tier?.trim()) {
      this.toast.warning('Required', 'Plan name and tier are required.');
      return;
    }
    this.savingPlan = true;
    this.cdr.markForCheck();

    const req$ = this.editingPlanId
      ? this.schoolService.updatePlan(this.editingPlanId, this.planForm)
      : this.schoolService.createPlan(this.planForm as any);

    req$.pipe(takeUntil(this.destroy$)).subscribe({
      next: (saved) => {
        if (this.editingPlanId) {
          this.plans = this.plans.map(p => p.id === saved.id ? saved : p);
        } else {
          this.plans = [...this.plans, saved].sort((a, b) => a.priorityScore - b.priorityScore);
        }
        this.showPlanForm  = false;
        this.editingPlanId = null;
        this.savingPlan    = false;
        this.cdr.markForCheck();
        this.toast.success('Saved', `Plan "${saved.name}" has been saved.`);
      },
      error: (err) => {
        this.logger.error('Save plan failed', err);
        this.savingPlan = false;
        this.cdr.markForCheck();
        this.toast.error('Error', 'Failed to save plan.');
      },
    });
  }

  togglePlanFeature(plan: PlanDetail, featureKey: string): void {
    if (this.isAlwaysOnFeature(featureKey)) return;
    const hasIt = plan.features.some(f => f.featureKey === featureKey);

    if (!hasIt) {
      // Add immediately
      this.schoolService.addFeatureToPlan(plan.id, featureKey)
        .pipe(takeUntil(this.destroy$)).subscribe({
          next: () => {
            this.refreshPlan(plan.id);
            this.toast.success('Feature Added');
          },
          error: (err) => {
            const msg = err?.error?.message ?? err?.error ?? 'Failed to add feature.';
            this.toast.error('Error', typeof msg === 'string' ? msg : 'Failed to add feature.');
          },
        });
    } else {
      // Show removal policy picker scoped to this plan
      this.removingFeatureKey = featureKey;
      this.removingPlanId     = plan.id;
      this.removalPolicy      = 'NEXT_MONTHLY';
      this.cdr.markForCheck();
    }
  }

  confirmRemoveFeature(plan: PlanDetail): void {
    if (!this.removingFeatureKey) return;
    const key = this.removingFeatureKey;
    this.removingFeatureKey = null;
    this.removingPlanId     = null;
    this.cdr.markForCheck();

    this.schoolService.removeFeatureFromPlan(plan.id, key, this.removalPolicy)
      .pipe(takeUntil(this.destroy$)).subscribe({
        next: () => {
          this.refreshPlan(plan.id);
          this.toast.success('Feature Scheduled', 'Removal scheduled successfully.');
        },
        error: (err) => {
          const msg = err?.error?.message ?? err?.error ?? 'Failed to schedule feature removal.';
          this.toast.error('Error', typeof msg === 'string' ? msg : 'Failed to schedule feature removal.');
        },
      });
  }

  cancelRemoveFeature(): void {
    this.removingFeatureKey = null;
    this.removingPlanId     = null;
    this.cdr.markForCheck();
  }

  isAlwaysOnFeature(featureKey: string): boolean {
    return this.allFeatures.find(f => f.featureKey === featureKey)?.isAlwaysOn ?? false;
  }

  deactivatePlan(plan: PlanDetail): void {
    this.toast.confirm({
      title: 'Deactivate Plan?',
      message: `"${plan.name}" will no longer be assignable to new schools. Existing subscribers are unaffected.`,
      icon: 'warning',
      confirmText: 'Deactivate',
      cancelText: 'Cancel',
      danger: true,
    }).then(confirmed => {
      if (!confirmed) return;
      this.schoolService.deactivatePlan(plan.id)
        .pipe(takeUntil(this.destroy$)).subscribe({
          next: () => {
            this.plans = this.plans.map(p => p.id === plan.id ? { ...p, isActive: false } : p);
            this.cdr.markForCheck();
            this.toast.success('Plan Deactivated');
          },
          error: () => this.toast.error('Error', 'Failed to deactivate plan.'),
        });
    });
  }

  reactivatePlan(plan: PlanDetail): void {
    this.toast.confirm({
      title: 'Reactivate Plan?',
      message: `"${plan.name}" will become available for assignment to new schools again.`,
      icon: 'info',
      confirmText: 'Reactivate',
      cancelText: 'Cancel',
      danger: false,
    }).then(confirmed => {
      if (!confirmed) return;
      this.schoolService.reactivatePlan(plan.id)
        .pipe(takeUntil(this.destroy$)).subscribe({
          next: (updated) => {
            this.plans = this.plans.map(p => p.id === updated.id ? updated : p);
            this.cdr.markForCheck();
            this.toast.success('Plan Reactivated', `"${updated.name}" is now active.`);
          },
          error: () => this.toast.error('Error', 'Failed to reactivate plan.'),
        });
    });
  }

  saveConfig(): void {
    this.schoolService.updateSubscriptionConfig(this.configForm)
      .pipe(takeUntil(this.destroy$)).subscribe({
        next: (updated) => {
          this.subscriptionConfig = updated;
          this.editingConfig      = false;
          this.cdr.markForCheck();
          this.toast.success('Config Saved');
        },
        error: () => this.toast.error('Error', 'Failed to save configuration.'),
      });
  }

  isPlanFeatureActive(plan: PlanDetail, featureKey: string): boolean {
    return plan.features.some(f => f.featureKey === featureKey);
  }

  isPlanFeaturePendingRemoval(plan: PlanDetail, featureKey: string): boolean {
    return plan.pendingChanges.some(
      c => c.featureKey === featureKey && c.actionType === 'REMOVE'
    );
  }

  formatPaise(paise: number | null): string {
    if (paise == null) return '—';
    return `₹${(paise / 100).toLocaleString('en-IN')}`;
  }

  featuresByCategory(): { category: string; features: FeatureCatalogItem[] }[] {
    const map = new Map<string, FeatureCatalogItem[]>();
    for (const f of this.allFeatures) {
      if (!map.has(f.category)) map.set(f.category, []);
      map.get(f.category)!.push(f);
    }
    return Array.from(map.entries()).map(([category, features]) => ({ category, features }));
  }

  startEditConfig(): void { this.editingConfig = true; this.cdr.markForCheck(); }
  cancelEditConfig(): void { this.editingConfig = false; this.cdr.markForCheck(); }

  // ── Subscription management (per-school) ──────────────────────────────────

  subscriptionPanelId: number | null = null;
  schoolSubscriptions = new Map<number, any>();
  loadingSubFor: number | null = null;
  savingSubFor: number | null = null;
  refreshingSubFor: number | null = null;
  subForm: { planId: number | null; trialEndsAt: string; expiresAt: string; graceEndsAt: string; notes: string } = {
    planId: null, trialEndsAt: '', expiresAt: '', graceEndsAt: '', notes: ''
  };

  toggleSubscriptionPanel(school: SchoolSettings): void {
    if (this.subscriptionPanelId === school.id) {
      this.subscriptionPanelId = null;
      this.cdr.markForCheck();
      return;
    }
    this.subscriptionPanelId = school.id;
    this.subForm = { planId: null, trialEndsAt: '', expiresAt: '', graceEndsAt: '', notes: '' };
    // Ensure plans are loaded for the plan selector dropdown
    if (!this.plans.length) {
      this.schoolService.getPlans(true).pipe(takeUntil(this.destroy$)).subscribe({
        next: (plans) => { this.plans = plans; this.cdr.markForCheck(); },
        error: (err) => this.logger.error('Failed to load plans', err)
      });
    }
    this.loadSchoolSubscription(school.id);
    this.loadSchoolFeatures(school.id);
    this.cdr.markForCheck();
  }

  loadSchoolSubscription(schoolId: number): void {
    this.loadingSubFor = schoolId;
    this.cdr.markForCheck();
    this.schoolService.getSchoolSubscription(schoolId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (sub) => {
        this.schoolSubscriptions.set(schoolId, sub);
        if (sub) {
          this.subForm = {
            planId: sub.planId ?? null,
            trialEndsAt: sub.trialEndsAt ? sub.trialEndsAt.substring(0, 10) : '',
            expiresAt: sub.expiresAt ? sub.expiresAt.substring(0, 10) : '',
            graceEndsAt: sub.graceEndsAt ? sub.graceEndsAt.substring(0, 10) : '',
            notes: sub.notes ?? '',
          };
        }
        this.loadingSubFor = null;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loadingSubFor = null;
        this.cdr.markForCheck();
      }
    });
  }

  saveSubscription(schoolId: number): void {
    if (!this.subForm.planId) {
      this.toast.warning('Required', 'Please select a plan.');
      return;
    }
    this.savingSubFor = schoolId;
    this.cdr.markForCheck();
    const existing = this.schoolSubscriptions.get(schoolId);
    const req$ = existing
      ? this.schoolService.updateSchoolSubscription(schoolId, this.subForm)
      : this.schoolService.assignSubscription(schoolId, this.subForm);
    req$.pipe(takeUntil(this.destroy$)).subscribe({
      next: (sub: SchoolSubscription) => {
        this.schoolSubscriptions.set(schoolId, sub);
        this.savingSubFor = null;
        this.cdr.markForCheck();
        this.toast.success('Saved', 'Subscription updated successfully.');
      },
      error: (err) => {
        this.logger.error('Save subscription failed', err);
        this.savingSubFor = null;
        this.cdr.markForCheck();
        const msg = err?.error?.message ?? 'Failed to save subscription.';
        this.toast.error('Error', typeof msg === 'string' ? msg : 'Failed to save subscription.');
      }
    });
  }

  doRefreshEntitlement(schoolId: number): void {
    this.refreshingSubFor = schoolId;
    this.cdr.markForCheck();
    this.schoolService.refreshEntitlement(schoolId).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.refreshingSubFor = null;
        this.toast.success('Refreshed', 'Entitlement rebuilt successfully.');
        this.loadSchoolSubscription(schoolId);
      },
      error: () => {
        this.refreshingSubFor = null;
        this.cdr.markForCheck();
        this.toast.error('Error', 'Failed to refresh entitlement.');
      }
    });
  }

  // ── Per-school feature overrides ─────────────────────────────────────────

  schoolFeatures = new Map<number, SchoolFeature[]>();
  loadingFeaturesFor: number | null = null;
  /** In-flight override saves, keyed by school + feature (see utils/feature-override.util.ts). */
  readonly savingFeatureKeys = new Set<string>();

  loadSchoolFeatures(schoolId: number): void {
    this.loadingFeaturesFor = schoolId;
    this.cdr.markForCheck();
    this.schoolService.getSuperAdminSchoolFeatures(schoolId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (features) => {
        this.schoolFeatures.set(schoolId, features);
        this.loadingFeaturesFor = null;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loadingFeaturesFor = null;
        this.cdr.markForCheck();
        this.toast.error('Error', 'Failed to load school features.');
      }
    });
  }

  setSchoolFeatureOverride(schoolId: number, featureKey: string, overrideState: string): void {
    const key = featureOperationKey(schoolId, featureKey);
    if (this.savingFeatureKeys.has(key)) return;
    this.savingFeatureKeys.add(key);
    this.cdr.markForCheck();
    this.schoolService.setSuperAdminFeatureOverride(schoolId, featureKey, overrideState)
      .pipe(takeUntil(this.destroy$)).subscribe({
        next: () => {
          this.savingFeatureKeys.delete(key);
          this.loadSchoolFeatures(schoolId); // reload: the backend decides the effective state
          this.toast.success('Saved', 'Feature override updated.');
        },
        error: (err) => {
          this.savingFeatureKeys.delete(key);
          this.cdr.markForCheck();
          this.toast.error('Error', featureOverrideErrorMessage(err));
        }
      });
  }

  isSavingFeature(schoolId: number, featureKey: string): boolean {
    return this.savingFeatureKeys.has(featureOperationKey(schoolId, featureKey));
  }

  featureActions(feature: SchoolFeature): FeatureOverrideActions {
    return featureOverrideActions(feature);
  }


  schoolFeaturesByCategory(features: SchoolFeature[]): { category: string; items: SchoolFeature[] }[] {
    const map = new Map<string, SchoolFeature[]>();
    for (const f of features) {
      if (!map.has(f.category)) map.set(f.category, []);
      map.get(f.category)!.push(f);
    }
    return Array.from(map.entries()).map(([category, items]) => ({ category, items }));
  }

  subStatusClass(status: string | null): string {
    switch (status) {
      case 'TRIAL':   return 'sub-status-trial';
      case 'ACTIVE':  return 'sub-status-active';
      case 'GRACE':   return 'sub-status-grace';
      case 'EXPIRED': return 'sub-status-expired';
      default:        return '';
    }
  }

  /** Bar fill width — capped at 100% for display. */
  subUsagePct(current: number, max: number | null): number {
    if (!max || max <= 0) return 0;
    return Math.min(100, Math.round((current / max) * 100));
  }

  /** Uncapped percentage — used for threshold comparisons against soft/hard limit pcts. */
  subUsagePctRaw(current: number, max: number | null): number {
    if (!max || max <= 0) return 0;
    return Math.round((current / max) * 100);
  }

  subUsageColor(rawPct: number, softPct: number | null, hardPct: number | null): string {
    const soft = softPct ?? 90;
    const hard = hardPct ?? 105;
    if (rawPct >= hard) return '#dc2626';
    if (rawPct >= soft) return '#f59e0b';
    return '#10b981';
  }

  private refreshPlan(_planId: number): void {
    this.schoolService.getPlans(true)
      .pipe(takeUntil(this.destroy$)).subscribe({
        next: (plans) => {
          this.plans = plans;
          this.cdr.markForCheck();
        },
      });
  }

  private emptyPlanForm() {
    return {
      name: '',
      tier: 'CUSTOM',
      isPublic: false,
      maxStudents: null as number | null,
      studentSoftLimitPct: 90,
      studentHardLimitPct: 105,
      maxStaff: null as number | null,
      staffSoftLimitPct: 90,
      staffHardLimitPct: 105,
      storageGbLimit: null as number | null,
      storageSoftLimitPct: 90,
      storageHardLimitPct: 105,
      monthlyPricePaise: null as number | null,
      annualPricePaise: null as number | null,
      priorityScore: 100,
    };
  }

  openOnboardForm(): void {
    this.onboardForm = this.emptyOnboardForm();
    this.showOnboardForm = true;
    this.editingSchoolId = null;
    // Ensure plans are loaded for the trial plan selector
    if (!this.plans.length) {
      this.schoolService.getPlans(true).pipe(takeUntil(this.destroy$)).subscribe({
        next: (plans) => { this.plans = plans; this.cdr.markForCheck(); },
        error: (err) => this.logger.error('Failed to load plans', err)
      });
    }
    if (!this.subscriptionConfig) {
      this.schoolService.getSubscriptionConfig().pipe(takeUntil(this.destroy$)).subscribe({
        next: (config) => {
          this.subscriptionConfig = config;
          this.configForm = { gracePeriodDays: config.gracePeriodDays, defaultTrialDays: config.defaultTrialDays, expiryNotifyDays: config.expiryNotifyDays };
          this.cdr.markForCheck();
        },
        error: (err) => this.logger.error('Failed to load subscription config', err)
      });
    }
    this.cdr.markForCheck();
  }

  get today(): string {
    return new Date().toISOString().substring(0, 10);
  }

  applyDefaultTrial(): void {
    const days = this.subscriptionConfig?.defaultTrialDays ?? 30;
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + days);
    this.subForm.trialEndsAt = trialEnd.toISOString().substring(0, 10);
    this.cdr.markForCheck();
  }

  private emptyOnboardForm(): OnboardForm {
    return {
      name: '',
      slug: '',
      address: '',
      city: '',
      state: '',
      pincode: '',
      phone: '',
      email: '',
      website: '',
      boardType: '',
      academicYearStartMonth: 4,
      adminUserId: '',
      adminEmail: '',
      adminName: '',
      adminPhone: '',
      adminDob: '',
      adminGender: '',
      trialPlanId: null,
      trialEndsAt: '',
    };
  }

  private emptyEditForm(): EditForm {
    return {
      name: '',
      slug: '',
      address: '',
      city: '',
      state: '',
      pincode: '',
      phone: '',
      email: '',
      website: '',
      contactPersonName: '',
      boardType: '',
      plan: 'BASIC',
      maxStudents: 500,
      expiryDate: '',
    };
  }
}
