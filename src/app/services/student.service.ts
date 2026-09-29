import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { Student, StudentExitRequest, PendingDuesInfo } from '../interfaces/student';
import { UploadRequestResponse, UploadCompleteResponse } from '../interfaces/upload';

interface StudentDTO {
  studentId: string;
  name: string;
  sectionId?: number | null;
}

/** Year-end decision actions — mirrors backend StudentYearEndDecision.Action exactly. PROMOTE,
 *  DETAIN and PASS_OUT are year-end membership decisions; TRANSFER (the year-end leaving option) goes through the
 *  existing student exit workflow; PENDING records nothing and is only counted. */
export type PromotionAction = 'PROMOTE' | 'DETAIN' | 'PASS_OUT' | 'TRANSFER' | 'PENDING';

/** Whether a proposed target enrollment would be effective immediately or only once its
 *  academic session actually starts. Mirrors backend StudentEnrollmentStatus (the only two
 *  values a year-end preview/decision can ever propose). */
export type PromotionTargetStatus = 'ACTIVE' | 'PLANNED';

/** Machine-readable outcome code for one submitted decision. The first three are successful
 *  mutations; the rest mean nothing was changed for that student. */
export type PromotionOutcomeCode =
  | 'PROMOTED' | 'DETAINED' | 'PASSED_OUT' | 'TRANSFERRED'
  | 'PENDING' | 'ALREADY_APPLIED' | 'CONFLICT' | 'INVALID_SOURCE' | 'VALIDATION_ERROR';

/** Read-only result context shown next to each student (never used to decide anything).
 *  source: REPORT_CARD (published report card), RESULTS (published exam results, report card
 *  not published) or NONE. */
export interface PromotionResultContext {
  source: 'REPORT_CARD' | 'RESULTS' | 'NONE';
  setupName: string | null;
  percentage: number | null;
  grade: string | null;
  result: 'PASS' | 'FAIL' | 'INCOMPLETE' | 'NO_RESULT' | null;
  reportCardStatus: 'PUBLISHED' | 'NOT_PUBLISHED' | 'RESULTS_NOT_PUBLISHED' | 'NO_SETUP';
  reportCardReference: string | null;
}

/** The audit record of one executed batch (student_rollover_run). */
export interface PromotionRunSummary {
  id: number;
  status: 'RUNNING' | 'COMPLETED' | 'COMPLETED_WITH_ERRORS' | 'FAILED';
  sourceSessionId: number;
  targetSessionId: number;
  classId: number | null;
  startedBy: string;
  startedAt: string;
  finishedAt: string | null;
  totalStudents: number;
  promoted: number;
  detained: number;
  passOut: number;
  transferred: number;
  pending: number;
  alreadyApplied: number;
  failed: number;
}

export interface PromotionIssue {
  code: string;
  message: string;
}

/** One student's authoritative, backend-computed preview row for a source/target session
 *  pair. Every ID here is real and must be sent back verbatim in the matching decision —
 *  never re-derived from displayed names or from the student's live projection. */
export interface PromotionCandidate {
  studentId: string;
  studentName: string | null;
  sourceEnrollmentId: number;
  sourceSessionId: number;
  sourceClassId: number | null;
  sourceClassName: string | null;
  sourceSectionId: number | null;
  sourceSectionName: string | null;
  availableDecisions: PromotionAction[];
  recommendedDecision: PromotionAction;
  promoteTargetClassId: number | null;
  promoteTargetClassName: string | null;
  detainTargetClassId: number | null;
  detainTargetClassName: string | null;
  promoteTargetSectionRequired: boolean;
  proposedPromoteTargetSectionId: number | null;
  proposedDetainTargetSectionId: number | null;
  proposedTargetStatus: PromotionTargetStatus;
  errors: PromotionIssue[];
  warnings: PromotionIssue[];
  /** 'NOT_APPLIED' (ready for a decision), 'CONFLICT', or 'ALREADY_APPLIED:<ACTION>'. */
  appliedDecisionState: string;
  /** Read-only result context; null when unavailable. */
  result: PromotionResultContext | null;
}

export interface PromotionUncoveredStudent {
  studentId: string;
  studentName: string | null;
  code: string;
  message: string;
}

export interface PromotionPreviewDTO {
  sourceSessionId: number;
  targetSessionId: number;
  valid: boolean;
  errors: PromotionIssue[];
  candidates: PromotionCandidate[];
  uncoveredStudents: PromotionUncoveredStudent[];
}

export interface PromotionDecisionPayload {
  studentId: string;
  action: PromotionAction;
  expectedSourceEnrollmentId: number;
  expectedSourceClassId: number;
  targetClassId?: number | null;
  targetSectionId?: number | null;
  /** TRANSFER only; if sent it must be the source session end (the only effective date allowed). */
  leavingDate?: string | null;
  reason?: string | null;
}

export interface PromotionExecuteRequest {
  sourceSessionId: number;
  targetSessionId: number;
  /** The source-class filter the batch was prepared with (recorded on the run). */
  classId?: number | null;
  decisions: PromotionDecisionPayload[];
}

export interface PromotionStudentOutcome {
  studentId: string;
  code: PromotionOutcomeCode;
  message: string;
  sourceEnrollmentId: number | null;
  targetEnrollmentId: number | null;
  targetEnrollmentStatus: PromotionTargetStatus | null;
  lifecycleFinalizationPending: boolean;
}

export interface PromotionResultDTO {
  submitted: number;
  summary: Record<string, number>;
  outcomes: PromotionStudentOutcome[];
  run: PromotionRunSummary | null;
}

export interface BulkImportError {
  row: number;
  studentId: string;
  reason: string;
}

/** One successfully created account — reports the Edunexify-generated ID, since the
 *  import request no longer supplies (or honors) one. */
export interface BulkImportSuccess {
  row: number;
  name: string;
  generatedId: string;
}

export interface BulkImportResult {
  totalRows: number;
  successful: number;
  failed: number;
  errors: BulkImportError[];
  created: BulkImportSuccess[];
  /** Non-null only when the uploaded CSV still had a legacy ID column — accepted for
   *  backward compatibility but its values were never used. */
  notice: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class StudentService {
  private baseUrl = `${environment.apiUrl}/students`;

  constructor(private http: HttpClient) { }

  getStudent(studentId: string): Observable<Student> {
    return this.http.get<Student>(`${this.baseUrl}/${studentId}`);
  }

  getActiveStudentsByClass(selectedClass: string, sectionId?: number): Observable<StudentDTO[]> {
    let params = new HttpParams();
    if (sectionId) params = params.set('sectionId', sectionId);
    return this.http.get<StudentDTO[]>(`${this.baseUrl}/active/class/${selectedClass}`, { params });
  }

  updateStudent(studentId: string, payload: { studentDetails: Partial<Student>; effectiveFromMonth: number | null }): Observable<Student> {
    return this.http.put<Student>(`${this.baseUrl}/${studentId}`, payload);
  }

  addStudent(studentData: Omit<Student, 'studentId'>): Observable<Student> {
    return this.http.post<Student>(this.baseUrl, studentData);
  }

  getNewStudentsByClass(selectedClass: string, sectionId?: number): Observable<StudentDTO[]> {
    let params = new HttpParams();
    if (sectionId) params = params.set('sectionId', sectionId);
    return this.http.get<StudentDTO[]>(`${this.baseUrl}/new/class/${selectedClass}`, { params });
  }

  getInactiveStudentsByClass(selectedClass: string, sectionId?: number): Observable<StudentDTO[]> {
    let params = new HttpParams();
    if (sectionId) params = params.set('sectionId', sectionId);
    return this.http.get<StudentDTO[]>(`${this.baseUrl}/inactive/class/${selectedClass}`, { params });
  }

  downloadBulkTemplate(): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/bulk/template`, { responseType: 'blob' });
  }

  bulkImport(file: File): Observable<BulkImportResult> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<BulkImportResult>(`${this.baseUrl}/bulk`, formData);
  }

  /**
   * Direct-to-object-storage upload: ask the backend for a short-lived presigned URL, PUT the
   * file bytes straight to object storage (never through this backend), then tell the backend
   * the upload finished so it can verify and attach the reference.
   */
  uploadStudentPhotoDirect(studentId: string, file: File): Observable<UploadCompleteResponse> {
    const uploadRequestUrl = `${environment.apiUrl}/files/upload-request`;
    const completeUrl = `${environment.apiUrl}/files/complete`;

    return this.http
      .post<UploadRequestResponse>(uploadRequestUrl, {
        purpose: 'STUDENT_PROFILE_PHOTO',
        entityId: studentId,
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
                purpose: 'STUDENT_PROFILE_PHOTO',
                entityId: studentId,
              }),
            ),
          );
        }),
      );
  }

  /** E2 backend-authoritative preview for one explicit source/target academic session pair.
   *  classId/studentId are optional server-side filters (canonical IDs only). */
  getPromotionPreview(
    sourceSessionId: number, targetSessionId: number,
    classId?: number | null, studentId?: string | null
  ): Observable<PromotionPreviewDTO> {
    let params = new HttpParams()
      .set('sourceSessionId', sourceSessionId)
      .set('targetSessionId', targetSessionId);
    if (classId != null) params = params.set('classId', classId);
    if (studentId) params = params.set('studentId', studentId);
    return this.http.get<PromotionPreviewDTO>(`${this.baseUrl}/promotion/preview`, { params });
  }

  /** E2 batch execute — every field in each decision must come from the loaded preview
   *  (expectedSourceEnrollmentId/expectedSourceClassId prove the decision still matches
   *  authoritative history), never reconstructed from current Student state. */
  executePromotion(request: PromotionExecuteRequest): Observable<PromotionResultDTO> {
    return this.http.post<PromotionResultDTO>(`${this.baseUrl}/promotion/execute`, request);
  }

  /** Recent year-end runs into a target session (newest first). */
  getPromotionRuns(targetSessionId: number): Observable<PromotionRunSummary[]> {
    return this.http.get<PromotionRunSummary[]>(`${this.baseUrl}/promotion/runs`, { params: { targetSessionId } });
  }

  searchStudents(query: string): Observable<Student[]> {
    const params = new HttpParams().set('q', query);
    return this.http.get<Student[]>(`${this.baseUrl}/search`, { params });
  }

  getAlumniByClass(selectedClass: string, sectionId?: number): Observable<StudentDTO[]> {
    let params = new HttpParams();
    if (sectionId) params = params.set('sectionId', sectionId);
    return this.http.get<StudentDTO[]>(`${this.baseUrl}/alumni/class/${selectedClass}`, { params });
  }

  getLeftStudentsByClass(selectedClass: string, sectionId?: number): Observable<StudentDTO[]> {
    let params = new HttpParams();
    if (sectionId) params = params.set('sectionId', sectionId);
    return this.http.get<StudentDTO[]>(`${this.baseUrl}/left/class/${selectedClass}`, { params });
  }

  checkPendingDues(studentId: string): Observable<PendingDuesInfo> {
    return this.http.get<PendingDuesInfo>(`${this.baseUrl}/${studentId}/pending-dues`);
  }

  exitStudent(studentId: string, request: StudentExitRequest): Observable<Student> {
    return this.http.post<Student>(`${this.baseUrl}/${studentId}/exit`, request);
  }

  readmitStudent(studentId: string): Observable<Student> {
    return this.http.post<Student>(`${this.baseUrl}/${studentId}/readmit`, {});
  }

}
