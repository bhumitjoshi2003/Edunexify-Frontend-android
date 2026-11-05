import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, forkJoin } from 'rxjs';
import { SchoolService, SchoolSettings, PlanDetail, FeatureCatalogItem, GlobalSubscriptionConfig, SchoolFeature, SchoolSubscription } from '../../services/school.service';
import { ToastService } from '../../services/toast.service';
import { FestivalCampaign, FestivalCampaignService } from '../../services/festival-campaign.service';
import { LoggerService } from '../../services/logger.service';

interface DashboardStats {
  totalSchools: number;
  activeSchools: number;
  totalStudents: number;
  totalTeachers: number;
  revenueThisMonth: number;
}

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
  adminPassword: string;
  adminName: string;
  adminPhone: string;
  adminDob: string;
  adminGender: string;
  trialPlanId: number | null;
  trialEndsAt: string;
}

interface EditSchoolForm {
  // School info
  name: string;
  slug: string;
  boardType: string;
  email: string;
  phone: string;
  website: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  contactPersonName: string;
  // Subscription
  plan: string;
  maxStudents: number | null;
  expiryDate: string;
  active: boolean;
  // Password change
  newAdminPassword: string;
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

  activeTab: 'overview' | 'schools' | 'plans' = 'overview';
  stats: DashboardStats | null = null;
  schools: SchoolSettings[] = [];
  loading = false;

  // Onboard form
  showOnboardForm = false;
  onboarding = false;
  onboardForm: OnboardForm = this.emptyOnboardForm();

  // Edit form
  editingSchoolId: number | null = null;
  editForm: EditSchoolForm = this.emptyEditForm();
  saving = false;
  showPasswordField = false;

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
    private cdr: ChangeDetectorRef,
    private toast: ToastService,
    private logger: LoggerService
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
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: ({ stats, schools }) => {
        this.stats = stats;
        this.schools = schools;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: (e) => {
        this.logger.error('Error loading super-admin data', e);
        this.toast.error('Error', 'Failed to load dashboard data.');
        this.loading = false;
        this.cdr.markForCheck();
      }
    });
  }

  // ── Onboarding ──────────────────────────────────────────────────────────────

  openOnboardForm(): void {
    this.onboardForm = this.emptyOnboardForm();
    this.showOnboardForm = true;
    this.editingSchoolId = null;
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

  cancelOnboard(): void {
    this.showOnboardForm = false;
  }

  submitOnboard(): void {
    const error = this.validateOnboardForm();
    if (error) {
      this.toast.warning('Validation Error', error);
      return;
    }
    this.onboarding = true;
    this.cdr.markForCheck();
    const payload = {
      ...this.onboardForm,
      trialEndsAt: this.onboardForm.trialEndsAt || null,
      trialPlanId: this.onboardForm.trialPlanId || null,
    };

    this.schoolService.onboardSchool(payload).pipe(takeUntil(this.destroy$)).subscribe({
      next: (school) => {
        this.schools = [school, ...this.schools];
        this.showOnboardForm = false;
        this.onboarding = false;
        this.toast.success('Success', `School "${school.name}" onboarded successfully.`);
        this.cdr.markForCheck();
      },
      error: (e) => {
        this.logger.error('Error onboarding school', e);
        const msg = e?.error?.message ?? e?.error ?? 'Failed to onboard school.';
        this.toast.error('Error', typeof msg === 'string' ? msg : 'Failed to onboard school.');
        this.onboarding = false;
        this.cdr.markForCheck();
      }
    });
  }

  private validateEditForm(): string | null {
    const f = this.editForm;
    const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRx = /^[0-9]{10}$/;
    const slugRx  = /^[a-z0-9][a-z0-9-]*$/;

    if (!f.name.trim())                               return 'School name is required.';
    if (f.slug.trim() && !slugRx.test(f.slug.trim())) return 'Slug must be lowercase letters, digits, and hyphens only.';
    if (f.email && !emailRx.test(f.email.trim()))     return 'School email is not valid.';
    if (f.phone && !phoneRx.test(f.phone.trim()))     return 'School phone must be exactly 10 digits.';
    if (f.newAdminPassword && f.newAdminPassword.length < 6)
                                                      return 'New admin password must be at least 6 characters.';
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
    if (!f.adminPassword)                             return 'Admin password is required.';
    if (f.adminPassword.length < 8)                   return 'Admin password must be at least 8 characters.';
    if (!/[A-Z]/.test(f.adminPassword))               return 'Admin password must contain at least one uppercase letter.';
    if (!/[0-9]/.test(f.adminPassword))               return 'Admin password must contain at least one number.';
    return null;
  }

  // ── Edit School ─────────────────────────────────────────────────────────────

  openEdit(school: SchoolSettings): void {
    this.editingSchoolId = school.id;
    this.showOnboardForm = false;
    this.showPasswordField = false;
    this.editForm = {
      name: school.name ?? '',
      slug: school.slug ?? '',
      boardType: school.boardType ?? '',
      email: school.email ?? '',
      phone: school.phone ?? '',
      website: school.website ?? '',
      address: school.address ?? '',
      city: school.city ?? '',
      state: school.state ?? '',
      pincode: school.pincode ?? '',
      contactPersonName: school.contactPersonName ?? '',
      plan: school.plan ?? 'TRIAL',
      maxStudents: school.maxStudents ?? null,
      expiryDate: school.expiryDate ?? '',
      active: school.active,
      newAdminPassword: '',
    };
    this.cdr.markForCheck();
  }

  cancelEdit(): void {
    this.editingSchoolId = null;
    this.showPasswordField = false;
  }

  saveEdit(): void {
    if (!this.editingSchoolId) return;

    const error = this.validateEditForm();
    if (error) {
      this.toast.warning('Validation Error', error);
      return;
    }

    const f = this.editForm;

    this.saving = true;
    this.cdr.markForCheck();

    const payload: Partial<SchoolSettings> & Record<string, unknown> = {
      name: f.name.trim(),
      slug: f.slug.trim(),
      boardType: f.boardType || null,
      email: f.email || null,
      phone: f.phone || null,
      website: f.website || null,
      address: f.address || null,
      city: f.city || null,
      state: f.state || null,
      pincode: f.pincode || null,
      contactPersonName: f.contactPersonName || null,
      plan: f.plan || null,
      maxStudents: f.maxStudents ?? null,
      expiryDate: f.expiryDate || null,
      active: f.active,
    };

    this.schoolService.updateSchoolAll(this.editingSchoolId, payload)
      .pipe(takeUntil(this.destroy$)).subscribe({
        next: (updated) => {
          this.schools = this.schools.map(s => s.id === updated.id ? updated : s);

          // If password also needs reset
          if (f.newAdminPassword.trim()) {
            this.schoolService.resetAdminPassword(this.editingSchoolId!, f.newAdminPassword.trim())
              .pipe(takeUntil(this.destroy$)).subscribe({
                next: () => {
                  this.toast.success('Saved', 'School updated and admin password changed.');
                  this.saving = false;
                  this.editingSchoolId = null;
                  this.showPasswordField = false;
                  this.cdr.markForCheck();
                },
                error: (e) => {
                  this.logger.error('Error resetting password', e);
                  this.toast.error('Warning', 'School info saved, but password reset failed.');
                  this.saving = false;
                  this.editingSchoolId = null;
                  this.showPasswordField = false;
                  this.cdr.markForCheck();
                }
              });
          } else {
            this.toast.success('Saved', 'School updated successfully.');
            this.saving = false;
            this.editingSchoolId = null;
            this.showPasswordField = false;
            this.cdr.markForCheck();
          }
        },
        error: (e) => {
          this.logger.error('Error updating school', e);
          const msg = e?.error?.message ?? 'Failed to update school.';
          this.toast.error('Error', typeof msg === 'string' ? msg : 'Failed to update school.');
          this.saving = false;
          this.cdr.markForCheck();
        }
      });
  }

  confirmToggleActive(school: SchoolSettings): void {
    const isActive = school.active;
    this.toast.confirm({
      title: isActive ? 'Deactivate School?' : 'Activate School?',
      html: isActive
        ? `This will deactivate <strong>${school.name}</strong> and prevent login for all its users.`
        : `This will reactivate <strong>${school.name}</strong> and restore access for all its users.`,
      icon: 'warning',
      danger: isActive,
      confirmText: isActive ? 'Yes, deactivate' : 'Yes, activate',
      cancelText: 'Cancel',
    }).then((confirmed) => {
      if (!confirmed) return;
      this.schoolService.deleteSchool(school.id).pipe(takeUntil(this.destroy$)).subscribe({
        next: () => {
          const newActive = !isActive;
          this.schools = this.schools.map(s =>
            s.id === school.id ? { ...s, active: newActive } : s
          );
          // Also update the edit form so the checkbox reflects the new state
          if (this.editingSchoolId === school.id) {
            this.editForm = { ...this.editForm, active: newActive };
          }
          this.toast.success('Done', `"${school.name}" has been ${newActive ? 'activated' : 'deactivated'}.`);
          this.cdr.markForCheck();
        },
        error: (e) => {
          this.logger.error('Error toggling school active state', e);
          this.toast.error('Error', `Failed to ${isActive ? 'deactivate' : 'activate'} school.`);
          this.cdr.markForCheck();
        }
      });
    });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  generateSlug(): void {
    this.onboardForm.slug = this.onboardForm.name.trim().toLowerCase()
      .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  }

  get activeCount(): number {
    return this.schools.filter(s => s.active).length;
  }

  // ── Plans Tab ─────────────────────────────────────────────────────────────

  plans: PlanDetail[] = [];
  allFeatures: FeatureCatalogItem[] = [];
  subscriptionConfig: GlobalSubscriptionConfig | null = null;
  plansLoading = false;

  editingPlanId: number | null = null;
  showPlanForm = false;
  savingPlan = false;
  planForm = this.emptyPlanForm();

  removingFeatureKey: string | null = null;
  removingPlanId: number | null = null;
  removalPolicy = 'NEXT_MONTHLY';
  readonly removalPolicies = [
    { value: 'IMMEDIATE',      label: 'Immediately' },
    { value: 'NEXT_MONTHLY',   label: 'Next month' },
    { value: 'NEXT_QUARTERLY', label: 'Next quarter' },
    { value: 'NEXT_ANNUAL',    label: 'Next academic year (Apr 1)' },
  ];

  editingConfig = false;
  configForm = { gracePeriodDays: 15, defaultTrialDays: 30, expiryNotifyDays: 1 };

  loadPlansTab(): void {
    if (this.plans.length && this.allFeatures.length) return;
    this.plansLoading = true;
    this.cdr.markForCheck();

    forkJoin({
      plans:    this.schoolService.getPlans(true),
      features: this.schoolService.getFeatureCatalog(),
      config:   this.schoolService.getSubscriptionConfig(),
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
      name: plan.name, tier: plan.tier, isPublic: plan.isPublic,
      maxStudents: plan.maxStudents ?? null, studentSoftLimitPct: plan.studentSoftLimitPct,
      studentHardLimitPct: plan.studentHardLimitPct, maxStaff: plan.maxStaff ?? null,
      staffSoftLimitPct: plan.staffSoftLimitPct, staffHardLimitPct: plan.staffHardLimitPct,
      storageGbLimit: plan.storageGbLimit ?? null, storageSoftLimitPct: plan.storageSoftLimitPct,
      storageHardLimitPct: plan.storageHardLimitPct, monthlyPricePaise: plan.monthlyPricePaise ?? null,
      annualPricePaise: plan.annualPricePaise ?? null, priorityScore: plan.priorityScore,
    };
    this.showPlanForm = true;
    this.cdr.markForCheck();
  }

  cancelPlanForm(): void {
    this.showPlanForm = false; this.editingPlanId = null;
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
        this.showPlanForm = false; this.editingPlanId = null; this.savingPlan = false;
        this.cdr.markForCheck();
        this.toast.success('Saved', `Plan "${saved.name}" has been saved.`);
      },
      error: (err) => {
        this.logger.error('Save plan failed', err);
        this.savingPlan = false; this.cdr.markForCheck();
        this.toast.error('Error', 'Failed to save plan.');
      },
    });
  }

  togglePlanFeature(plan: PlanDetail, featureKey: string): void {
    if (this.isAlwaysOnFeature(featureKey)) return;
    const hasIt = plan.features.some(f => f.featureKey === featureKey);
    if (!hasIt) {
      this.schoolService.addFeatureToPlan(plan.id, featureKey)
        .pipe(takeUntil(this.destroy$)).subscribe({
          next: () => { this.refreshPlan(plan.id); this.toast.success('Feature Added'); },
          error: (err) => {
            const msg = err?.error?.message ?? err?.error ?? 'Failed to add feature.';
            this.toast.error('Error', typeof msg === 'string' ? msg : 'Failed to add feature.');
          },
        });
    } else {
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
        next: () => { this.refreshPlan(plan.id); this.toast.success('Feature Scheduled'); },
        error: (err) => {
          const msg = err?.error?.message ?? err?.error ?? 'Failed to schedule feature removal.';
          this.toast.error('Error', typeof msg === 'string' ? msg : 'Failed to schedule removal.');
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
      message: `"${plan.name}" will no longer be assignable to new schools.`,
      icon: 'warning', confirmText: 'Deactivate', cancelText: 'Cancel', danger: true,
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
      icon: 'info', confirmText: 'Reactivate', cancelText: 'Cancel', danger: false,
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
          this.subscriptionConfig = updated; this.editingConfig = false;
          this.cdr.markForCheck(); this.toast.success('Config Saved');
        },
        error: () => this.toast.error('Error', 'Failed to save configuration.'),
      });
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

  // ── Per-school feature overrides (SUPER_ADMIN) ────────────────────────────

  schoolFeatures = new Map<number, SchoolFeature[]>();
  loadingFeaturesFor: number | null = null;
  savingFeatureFor: string | null = null;

  get today(): string {
    return new Date().toISOString().substring(0, 10);
  }

  toggleSubscriptionPanel(school: SchoolSettings): void {
    if (this.subscriptionPanelId === school.id) {
      this.subscriptionPanelId = null;
      this.cdr.markForCheck();
      return;
    }
    this.subscriptionPanelId = school.id;
    this.subForm = { planId: null, trialEndsAt: '', expiresAt: '', graceEndsAt: '', notes: '' };
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
      }
    });
  }

  setSchoolFeatureOverride(schoolId: number, featureKey: string, overrideState: string): void {
    this.savingFeatureFor = featureKey;
    this.cdr.markForCheck();
    this.schoolService.setSuperAdminFeatureOverride(schoolId, featureKey, overrideState)
      .pipe(takeUntil(this.destroy$)).subscribe({
        next: () => {
          this.savingFeatureFor = null;
          this.loadSchoolFeatures(schoolId);
          this.toast.success('Saved', `Feature override updated.`);
        },
        error: (err) => {
          this.savingFeatureFor = null;
          this.cdr.markForCheck();
          const msg = err?.error?.message ?? 'Failed to update feature override.';
          this.toast.error('Error', typeof msg === 'string' ? msg : 'Failed to update feature override.');
        }
      });
  }

  schoolFeaturesByCategory(features: SchoolFeature[]): { category: string; items: SchoolFeature[] }[] {
    const map = new Map<string, SchoolFeature[]>();
    for (const f of features) {
      const cat = f.category ?? 'General';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(f);
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

  subUsagePct(current: number, max: number | null): number {
    if (!max || max <= 0) return 0;
    return Math.min(100, Math.round((current / max) * 100));
  }

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

  isPlanFeatureActive(plan: PlanDetail, key: string): boolean {
    return plan.features.some(f => f.featureKey === key);
  }
  isPlanFeaturePendingRemoval(plan: PlanDetail, key: string): boolean {
    return plan.pendingChanges.some(c => c.featureKey === key && c.actionType === 'REMOVE');
  }
  formatPaise(paise: number | null): string {
    return paise == null ? '—' : `₹${(paise / 100).toLocaleString('en-IN')}`;
  }
  featuresByCategory(): { category: string; features: FeatureCatalogItem[] }[] {
    const map = new Map<string, FeatureCatalogItem[]>();
    for (const f of this.allFeatures) {
      if (!map.has(f.category)) map.set(f.category, []);
      map.get(f.category)!.push(f);
    }
    return Array.from(map.entries()).map(([category, features]) => ({ category, features }));
  }

  private refreshPlan(_planId: number): void {
    this.schoolService.getPlans(true).pipe(takeUntil(this.destroy$)).subscribe({
      next: (plans) => { this.plans = plans; this.cdr.markForCheck(); },
    });
  }

  private emptyPlanForm() {
    return {
      name: '', tier: 'CUSTOM', isPublic: false,
      maxStudents: null as number | null, studentSoftLimitPct: 90, studentHardLimitPct: 105,
      maxStaff: null as number | null, staffSoftLimitPct: 90, staffHardLimitPct: 105,
      storageGbLimit: null as number | null, storageSoftLimitPct: 90, storageHardLimitPct: 105,
      monthlyPricePaise: null as number | null, annualPricePaise: null as number | null,
      priorityScore: 100,
    };
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
  }

  trackById(_: number, item: SchoolSettings): number { return item.id; }

  applyDefaultTrial(): void {
    const days = this.subscriptionConfig?.defaultTrialDays ?? 30;
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + days);
    this.subForm.trialEndsAt = trialEnd.toISOString().substring(0, 10);
    this.cdr.markForCheck();
  }

  private emptyOnboardForm(): OnboardForm {
    return {
      name: '', slug: '', address: '', city: '', state: '', pincode: '',
      phone: '', email: '', website: '', boardType: '',
      academicYearStartMonth: 4,
      adminUserId: '', adminEmail: '', adminPassword: '',
      adminName: '', adminPhone: '', adminDob: '', adminGender: '',
      trialPlanId: null, trialEndsAt: '',
    };
  }

  private emptyEditForm(): EditSchoolForm {
    return {
      name: '', slug: '', boardType: '', email: '', phone: '', website: '',
      address: '', city: '', state: '', pincode: '', contactPersonName: '',
      plan: 'TRIAL', maxStudents: null, expiryDate: '', active: true,
      newAdminPassword: '',
    };
  }
}
