import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

/** E5B: target-enrollment-driven fee generation. Mirrors backend FeeGenerationTargetDtos exactly. */

export type FeeGenerationEnrollmentStatus = 'PLANNED' | 'ACTIVE';

export type FeeGenerationOutcome =
  | 'GENERATED' | 'PARTIALLY_GENERATED' | 'ALREADY_GENERATED'
  | 'NO_RULE_CONFIGURED' | 'ENROLLMENT_CHANGED' | 'NOT_ELIGIBLE' | 'FAILED';

/** willGenerate: missing and chargeable now (the same eligibility Fee Assignment uses); a
 *  month that is neither generated nor willGenerate is skipped and message says why. */
export interface FeeGenerationMonthPreview {
  month: number;
  alreadyGenerated: boolean;
  willGenerate: boolean;
  baseAmountDue: number;
  discountAmount: number;
  busFeeDue: number;
  total: number;
  message: string | null;
}

/** One eligible candidate's authoritative preview row. targetEnrollmentId/targetClassId must
 *  be sent back verbatim in the matching generation decision — never re-derived from
 *  displayed names or the student's live Student projection. */
export interface FeeGenerationStudentPreviewRow {
  studentId: string;
  studentName: string | null;
  targetEnrollmentId: number;
  targetEnrollmentStatus: FeeGenerationEnrollmentStatus;
  targetClassId: number;
  targetClassName: string;
  targetSectionId: number | null;
  targetSectionName: string | null;
  repeatingSameClass: boolean | null;
  totalDue: number;
  months: FeeGenerationMonthPreview[];
  alreadyGeneratedMonths: number[];
  /** The only months a generate request for this row would create. */
  generatableMonths: number[];
  warnings: string[];
  blockingErrors: string[];
  eligible: boolean;
}

export interface FeeGenerationDecision {
  studentId: string;
  expectedTargetEnrollmentId: number;
  expectedTargetClassId: number;
}

export interface FeeGenerationRequest {
  targetSessionId: number;
  decisions: FeeGenerationDecision[];
}

export interface FeeGenerationStudentResult {
  studentId: string;
  outcome: FeeGenerationOutcome;
  generatedMonths: number;
  skippedMonths: number;
  message: string;
}

export type TargetFeeDriftStatus =
  | 'CLEAN' | 'PARTIAL_GENERATION' | 'CLASS_MISMATCH'
  | 'CANCELLED_TARGET_WITH_FEES' | 'NO_TARGET_ENROLLMENT';

export interface TargetFeeDriftRow {
  studentId: string;
  studentName: string | null;
  targetSessionId: number;
  targetSessionLabel: string;
  authoritativeEnrollmentId: number | null;
  authoritativeEnrollmentStatus: string | null;
  enrollmentClassId: number | null;
  enrollmentClassName: string | null;
  generatedClassId: number | null;
  generatedClassName: string | null;
  generatedClassIds: number[];
  generatedClassNames: string[];
  generatedMonths: number[];
  expectedMonths: number[];
  missingMonths: number[];
  driftStatus: TargetFeeDriftStatus;
  warnings: string[];
}

@Injectable({
  providedIn: 'root'
})
export class FeeGenerationService {
  private baseUrl = `${environment.apiUrl}/fee-generation`;

  constructor(private http: HttpClient) { }

  /** Read-only. classId/studentId are optional server-side filters (canonical IDs only). */
  getTargetPreview(
    targetSessionId: number, classId?: number | null, studentId?: string | null
  ): Observable<FeeGenerationStudentPreviewRow[]> {
    let params = new HttpParams().set('targetSessionId', targetSessionId);
    if (classId != null) params = params.set('classId', classId);
    if (studentId) params = params.set('studentId', studentId);
    return this.http.get<FeeGenerationStudentPreviewRow[]>(`${this.baseUrl}/target-preview`, { params });
  }

  /** Every decision's expectedTargetEnrollmentId/expectedTargetClassId must come from the
   *  loaded preview — the backend re-locks and re-reads the authoritative enrollment and
   *  returns ENROLLMENT_CHANGED for any student whose enrollment no longer matches. */
  generateTargetFees(request: FeeGenerationRequest): Observable<FeeGenerationStudentResult[]> {
    return this.http.post<FeeGenerationStudentResult[]>(`${this.baseUrl}/target-generate`, request);
  }

  /** E5C read-only comparison; never invokes generation or recalculation. */
  getTargetDrift(
    targetSessionId: number, classId?: number | null, studentId?: string | null
  ): Observable<TargetFeeDriftRow[]> {
    let params = new HttpParams().set('targetSessionId', targetSessionId);
    if (classId != null) params = params.set('classId', classId);
    if (studentId) params = params.set('studentId', studentId);
    return this.http.get<TargetFeeDriftRow[]>(`${this.baseUrl}/target-drift`, { params });
  }
}
