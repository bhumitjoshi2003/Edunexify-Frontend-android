import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, shareReplay, throwError } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { UploadRequestResponse, UploadCompleteResponse } from '../interfaces/upload';

export interface SchoolClass {
  id: number;
  name: string;
  displayOrder: number;
  active: boolean;
  streamEligible: boolean;
}

export interface SchoolSettings {
  id: number;
  name: string;
  slug: string;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  logoUrl: string | null;
  themeColor: string | null;
  contactPersonName: string | null;
  boardType: string | null;
  plan: string | null;
  maxStudents: number | null;
  expiryDate: string | null;
  active: boolean;
  razorpayConfigured: boolean;
  adminUserId?: string;
  // Academic calendar settings
  academicYearStartMonth: number;   // 1=Jan, 4=Apr (default), 7=Jul, etc.
  workingDays: string;              // comma-separated, e.g. "MONDAY,TUESDAY,...,SATURDAY"
  periodsPerDay: number;            // number of periods per school day
  gradingSystem: string;            // CBSE | PERCENTAGE | LETTER
  affiliationNumber?: string | null; // e.g. CBSE school no., ICSE index no.
  schoolCode?: string | null;        // e.g. CBSE school code for report card header
  reportCardHeaderImageUrl?: string | null; // custom header banner image for report cards
  // Staff attendance / GPS check-in settings
  schoolLatitude?: number;
  schoolLongitude?: number;
  geofenceRadius?: number;          // meters, default 200
  schoolStartTime?: string;         // "HH:mm"
  lateThresholdMinutes?: number;    // minutes after start time, default 5
  checkinWindowStart?: string;      // "HH:mm"
  checkinWindowEnd?: string;        // "HH:mm"
  staffAttendanceTrackingStartDate?: string; // "yyyy-MM-dd" rollout boundary
  timezone?: string;                // IANA zone id, e.g. "Asia/Kolkata" — always local to the school
  teacherAttendanceReminderEnabled?: boolean; // default false
  teacherAttendanceReminderTime?: string | null; // "HH:mm"; required when enabled, null while disabled
}

export interface FeatureCatalogItem {
  featureKey: string;
  displayName: string;
  description: string;
  category: string;
  isAlwaysOn: boolean;
}

export interface PlanFeatureChange {
  id: number;
  featureKey: string;
  actionType: string;
  policy: string;
  effectiveAt: string;
  applied: boolean;
  createdBy: string;
  createdAt: string;
}

export interface PlanDetail {
  id: number;
  name: string;
  tier: string;
  version: string;
  isPublic: boolean;
  isActive: boolean;
  priorityScore: number;
  maxStudents: number | null;
  studentSoftLimitPct: number;
  studentHardLimitPct: number;
  maxStaff: number | null;
  staffSoftLimitPct: number;
  staffHardLimitPct: number;
  storageGbLimit: number | null;
  storageSoftLimitPct: number;
  storageHardLimitPct: number;
  monthlyPricePaise: number | null;
  annualPricePaise: number | null;
  currency: string;
  features: FeatureCatalogItem[];
  pendingChanges: PlanFeatureChange[];
}

export interface SchoolEntitlementSummary {
  planName: string | null;
  planTier: string | null;
  subscriptionStatus: string | null;
  trialEndsAt: string | null;
  expiresAt: string | null;
  graceEndsAt: string | null;
  maxStudents: number | null;
  studentSoftLimitPct: number | null;
  studentHardLimitPct: number | null;
  maxStaff: number | null;
  staffSoftLimitPct: number | null;
  staffHardLimitPct: number | null;
  storageGbLimit: number | null;
  featureCount: number;
  features: string[];
  activeStudents: number;
  totalStaff: number;
  teachers: number;
  admins: number;
}

export type SetupItemStatus = 'COMPLETED' | 'INCOMPLETE' | 'NOT_APPLICABLE';
export type SetupImportance = 'REQUIRED' | 'RECOMMENDED' | 'OPTIONAL';

export interface SchoolSetupItem {
  key: string;
  title: string;
  description: string;
  status: SetupItemStatus;
  importance: SetupImportance;
}

export interface SchoolSetupHealth {
  completionPercentage: number;
  completedRequired: number;
  totalRequired: number;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'READY';
  items: SchoolSetupItem[];
}

export interface SubscriptionHistoryItem {
  id: number;
  schoolId: number;
  eventType: string;
  planId: number | null;
  planName: string | null;
  status: string | null;
  notes: string | null;
  performedBy: string | null;
  occurredAt: string;
}

export interface SubscriptionHealthItem {
  schoolId: number;
  schoolName: string;
  isActive: boolean;
  subscriptionStatus: string | null;
  planName: string | null;
  planTier: string | null;
  trialEndsAt: string | null;
  expiresAt: string | null;
  graceEndsAt: string | null;
  maxStudents: number | null;
  lastRebuiltAt: string | null;
}

export interface GlobalSubscriptionConfig {
  gracePeriodDays: number;
  defaultTrialDays: number;
  expiryNotifyDays: number;
  updatedByAdminId: string;
  updatedAt: string;
}

export interface SchoolSubscription {
  id?: number;
  schoolId: number;
  planId: number | null;
  planName?: string;
  status: string;
  startDate?: string;
  endDate?: string;
  trialEndsAt?: string;
  expiresAt?: string;
  graceEndsAt?: string;
  billingCycle?: string;
  notes?: string;
}

export interface SchoolFeature {
  featureKey: string;
  displayName: string;
  description: string;
  category: string;
  enabled: boolean;
  effectivelyOn: boolean;
  planGranted: boolean;
  overrideState: string;
  isAlwaysOn: boolean;
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
}

export interface UpgradeVerification {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
  planId: number | string;
  billingCycle?: string;
}

export interface OnboardSchoolRequest {
  name: string;
  slug: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  phone?: string;
  email?: string;
  adminUserId: string;
  adminName: string;
  adminPhone: string;
  adminDob: string;
  adminGender: string;
  adminEmail: string;
  adminPassword: string;
}

export interface SuperAdminStats {
  totalSchools: number;
  activeSchools: number;
  totalStudents: number;
  totalTeachers: number;
  revenueThisMonth: number;
}

@Injectable({ providedIn: 'root' })
export class SchoolService {
  private baseUrl = `${environment.apiUrl}/school`;
  private superAdminUrl = `${environment.apiUrl}/super-admin`;

  // Cache the class list — resets on error so next subscriber gets a fresh request
  private classes$: Observable<string[]> | null = null;

  constructor(private http: HttpClient) {}

  getClasses(): Observable<string[]> {
    if (!this.classes$) {
      this.classes$ = this.http.get<string[]>(`${this.baseUrl}/classes`).pipe(
        catchError(err => {
          this.classes$ = null;
          return throwError(() => err);
        }),
        shareReplay(1)
      );
    }
    return this.classes$;
  }

  invalidateClasses(): void {
    this.classes$ = null;
  }

  getManagedClasses(): Observable<SchoolClass[]> {
    return this.http.get<SchoolClass[]>(`${this.baseUrl}/classes/manage`);
  }

  addClass(name: string): Observable<SchoolClass> {
    return this.http.post<SchoolClass>(`${this.baseUrl}/classes`, { name });
  }

  deleteClass(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/classes/${id}`);
  }

  reorderClasses(orderedIds: number[]): Observable<void> {
    return this.http.patch<void>(`${this.baseUrl}/classes/reorder`, orderedIds);
  }

  toggleStreamEligible(id: number, eligible: boolean): Observable<SchoolClass> {
    return this.http.patch<SchoolClass>(`${this.baseUrl}/classes/${id}/stream-eligible`, { eligible });
  }

  getSettings(): Observable<SchoolSettings> {
    return this.http.get<SchoolSettings>(`${this.baseUrl}/settings`);
  }

  getSetupHealth(): Observable<SchoolSetupHealth> {
    return this.http.get<SchoolSetupHealth>(`${this.baseUrl}/setup-health`);
  }

  updateSettings(data: Partial<SchoolSettings>): Observable<SchoolSettings> {
    return this.http.put<SchoolSettings>(`${this.baseUrl}/settings`, data);
  }

  removeReportCardHeader(): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/report-card-header`);
  }

  /**
   * Direct-to-object-storage upload for the school logo (school-level — no per-entity id below
   * the school itself, hence the fixed "self" entityId, matching the backend's
   * UploadPurpose.SCHOOL_LOGO/REPORT_CARD_HEADER_IMAGE school-level convention).
   */
  uploadLogoDirect(file: File): Observable<UploadCompleteResponse> {
    return this.uploadSchoolLevelDirect('SCHOOL_LOGO', file);
  }

  /** Direct-to-object-storage upload for the report-card header image — see uploadLogoDirect. */
  uploadReportCardHeaderDirect(file: File): Observable<UploadCompleteResponse> {
    return this.uploadSchoolLevelDirect('REPORT_CARD_HEADER_IMAGE', file);
  }

  private uploadSchoolLevelDirect(purpose: 'SCHOOL_LOGO' | 'REPORT_CARD_HEADER_IMAGE', file: File): Observable<UploadCompleteResponse> {
    const uploadRequestUrl = `${environment.apiUrl}/files/upload-request`;
    const completeUrl = `${environment.apiUrl}/files/complete`;
    const entityId = 'self';

    return this.http
      .post<UploadRequestResponse>(uploadRequestUrl, {
        purpose,
        entityId,
        fileName: file.name,
        contentType: file.type,
        size: file.size,
      })
      .pipe(
        switchMap((uploadRequest) => {
          const headers = new HttpHeaders(uploadRequest.requiredHeaders);
          return this.http.put(uploadRequest.uploadUrl, file, { headers }).pipe(
            switchMap(() =>
              this.http.post<UploadCompleteResponse>(completeUrl, {
                objectKey: uploadRequest.objectKey,
                purpose,
                entityId,
              }),
            ),
          );
        }),
      );
  }

  updateRazorpayKeys(keyId: string, keySecret: string): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/razorpay`, { keyId, keySecret });
  }

  // ── SUPER_ADMIN ──────────────────────────────────────────────────────────────

  getDashboard(): Observable<SuperAdminStats> {
    return this.http.get<SuperAdminStats>(`${this.superAdminUrl}/dashboard`);
  }

  listAllSchools(): Observable<SchoolSettings[]> {
    return this.http.get<SchoolSettings[]>(`${this.superAdminUrl}/schools`);
  }

  onboardSchool(data: OnboardSchoolRequest): Observable<SchoolSettings> {
    return this.http.post<SchoolSettings>(`${this.superAdminUrl}/schools`, data);
  }

  updateSchoolAll(schoolId: number, data: Partial<SchoolSettings> & { newAdminPassword?: string }): Observable<SchoolSettings> {
    return this.http.put<SchoolSettings>(`${this.superAdminUrl}/schools/${schoolId}`, data);
  }

  updateSubscription(schoolId: number, data: { plan?: string; maxStudents?: number; expiryDate?: string; active?: boolean }): Observable<SchoolSettings> {
    let params = new HttpParams();
    if (data.plan !== undefined) params = params.set('plan', data.plan);
    if (data.maxStudents !== undefined) params = params.set('maxStudents', String(data.maxStudents));
    if (data.expiryDate !== undefined) params = params.set('expiryDate', data.expiryDate);
    if (data.active !== undefined) params = params.set('active', String(data.active));
    return this.http.patch<SchoolSettings>(`${this.superAdminUrl}/schools/${schoolId}/subscription`, null, { params });
  }

  resetAdminPassword(schoolId: number, newPassword: string): Observable<void> {
    return this.http.patch<void>(`${this.superAdminUrl}/schools/${schoolId}/admin-password`, { newPassword });
  }

  deleteSchool(schoolId: number): Observable<void> {
    return this.http.delete<void>(`${this.superAdminUrl}/schools/${schoolId}`);
  }

  // ── Subscription management (SUPER_ADMIN) ─────────────────────────────────

  getSchoolSubscription(schoolId: number): Observable<SchoolSubscription> {
    return this.http.get<SchoolSubscription>(`${this.superAdminUrl}/schools/${schoolId}/subscription`);
  }

  assignSubscription(schoolId: number, data: Partial<SchoolSubscription>): Observable<SchoolSubscription> {
    return this.http.post<SchoolSubscription>(`${this.superAdminUrl}/schools/${schoolId}/subscription`, data);
  }

  updateSchoolSubscription(schoolId: number, data: Partial<SchoolSubscription>): Observable<SchoolSubscription> {
    return this.http.put<SchoolSubscription>(`${this.superAdminUrl}/schools/${schoolId}/subscription`, data);
  }

  refreshEntitlement(schoolId: number): Observable<void> {
    return this.http.post<void>(`${this.superAdminUrl}/schools/${schoolId}/subscription/refresh`, {});
  }

  getSuperAdminSchoolFeatures(schoolId: number): Observable<SchoolFeature[]> {
    return this.http.get<SchoolFeature[]>(`${this.superAdminUrl}/schools/${schoolId}/features`);
  }

  setSuperAdminFeatureOverride(schoolId: number, featureKey: string, overrideState: string): Observable<void> {
    return this.http.put<void>(`${this.superAdminUrl}/schools/${schoolId}/features/${featureKey}/override`,
      { overrideState });
  }

  getEntitlement(): Observable<SchoolEntitlementSummary> {
    return this.http.get<SchoolEntitlementSummary>(`${this.baseUrl}/entitlement`);
  }

  getPublicPlans(): Observable<PlanDetail[]> {
    return this.http.get<PlanDetail[]>(`${environment.apiUrl}/public/plans`);
  }

  createUpgradeOrder(planId: number, billingCycle: string): Observable<RazorpayOrder> {
    return this.http.post<RazorpayOrder>(`${this.baseUrl}/subscription/upgrade/order`, { planId, billingCycle });
  }

  verifyUpgradePayment(data: UpgradeVerification): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/subscription/upgrade/verify`, data);
  }

  // ── School-level feature overrides (ADMIN) ────────────────────────────────

  getSchoolFeatures(): Observable<SchoolFeature[]> {
    return this.http.get<SchoolFeature[]>(`${this.baseUrl}/features`);
  }

  setFeatureOverride(featureKey: string, overrideState: 'DEFAULT' | 'DISABLED'): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/features/${featureKey}/override`, { overrideState });
  }

  getSubscriptionHistory(): Observable<SubscriptionHistoryItem[]> {
    return this.http.get<SubscriptionHistoryItem[]>(`${this.baseUrl}/subscription/history`);
  }

  getSubscriptionHealth(): Observable<SubscriptionHealthItem[]> {
    return this.http.get<SubscriptionHealthItem[]>(`${this.superAdminUrl}/subscription-health`);
  }

  // ── Plan Management (SUPER_ADMIN) ─────────────────────────────────────────

  getPlans(includeInactive = false): Observable<PlanDetail[]> {
    return this.http.get<PlanDetail[]>(`${this.superAdminUrl}/plans`, {
      params: { includeInactive: String(includeInactive) }
    });
  }

  createPlan(data: Partial<PlanDetail> & { name: string; tier: string }): Observable<PlanDetail> {
    return this.http.post<PlanDetail>(`${this.superAdminUrl}/plans`, data);
  }

  updatePlan(planId: number, data: Partial<PlanDetail>): Observable<PlanDetail> {
    return this.http.put<PlanDetail>(`${this.superAdminUrl}/plans/${planId}`, data);
  }

  deactivatePlan(planId: number): Observable<void> {
    return this.http.delete<void>(`${this.superAdminUrl}/plans/${planId}`);
  }

  reactivatePlan(planId: number): Observable<PlanDetail> {
    return this.http.post<PlanDetail>(`${this.superAdminUrl}/plans/${planId}/reactivate`, {});
  }

  addFeatureToPlan(planId: number, featureKey: string): Observable<void> {
    return this.http.post<void>(`${this.superAdminUrl}/plans/${planId}/features`, { featureKey });
  }

  removeFeatureFromPlan(planId: number, featureKey: string, policy: string): Observable<void> {
    return this.http.delete<void>(`${this.superAdminUrl}/plans/${planId}/features/${featureKey}`, {
      body: { policy }
    });
  }

  getFeatureCatalog(): Observable<FeatureCatalogItem[]> {
    return this.http.get<FeatureCatalogItem[]>(`${this.superAdminUrl}/features`);
  }

  getSubscriptionConfig(): Observable<GlobalSubscriptionConfig> {
    return this.http.get<GlobalSubscriptionConfig>(`${this.superAdminUrl}/subscription-config`);
  }

  updateSubscriptionConfig(data: Partial<GlobalSubscriptionConfig>): Observable<GlobalSubscriptionConfig> {
    return this.http.put<GlobalSubscriptionConfig>(`${this.superAdminUrl}/subscription-config`, data);
  }

}
