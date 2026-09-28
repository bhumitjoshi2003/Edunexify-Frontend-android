import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

/** Report Card V2: setup, school design, remarks, Generate & Preview (live) and published
 *  (frozen) report cards. The backend calculates, renders and stores everything; the app only shows it. */

export type ResultMode = 'TOTAL' | 'WEIGHTED';
export type ExamStatus = 'DRAFT' | 'PUBLISHED';

export interface TermInput { key: string; name: string; weight: number | null; }
export interface ExamInput { examConfigId: number; termKey: string | null; weight: number | null; }
export interface SetupRequest {
  academicSessionId: number; classId: number; name: string; resultMode: ResultMode;
  displayOrder: number; terms: TermInput[]; exams: ExamInput[];
}

export interface SetupTerm { id: number; name: string; weight: number | null; displayOrder: number; }
export interface SetupExam {
  id: number; examConfigId: number; examName: string; resultStatus: ExamStatus | null;
  termId: number | null; termName: string | null; weight: number | null; displayOrder: number;
}
export interface ReportCardSetup {
  id: number; academicSessionId: number; sessionLabel: string; classId: number; className: string;
  name: string; resultMode: ResultMode; displayOrder: number; terms: SetupTerm[]; exams: SetupExam[]; revision: number;
}
export interface AvailableExam { id: number; examName: string; resultStatus: ExamStatus; subjects: number; }

export interface ReportCardDesign {
  motto: string | null; footerText: string | null; watermarkMode: 'NONE' | 'TEXT' | 'LOGO'; watermarkText: string | null;
  showPhoto: boolean; showQr: boolean; showAttendance: boolean; showCoScholastic: boolean;
  showTeacherRemark: boolean; showPrincipalRemark: boolean; showRank: boolean; showPromotion: boolean;
  teacherSignatureLabel: string; principalSignatureLabel: string; revision: number | null;
}
export interface Activity { id: number; name: string; displayOrder: number; active: boolean; }

export interface RemarkRow {
  studentId: string; studentName: string; sectionId: number | null; sectionName: string | null;
  teacherRemark: string | null; principalRemark: string | null; grades: Record<string, string>;
  /** The student's published report card is active: remarks and grades can't change until it is withdrawn. */
  locked: boolean;
}
export interface RemarksPage {
  setupId: number; setupName: string; className: string; sectionId: number | null; canEditPrincipal: boolean;
  activities: Activity[]; gradeScale: string[]; students: RemarkRow[];
}
/** null = unchanged, '' = clear. */
export interface RemarkSaveRow {
  studentId: string; teacherRemark?: string | null; principalRemark?: string | null; grades?: Record<string, string>;
}

export interface Readiness {
  draftExams: string[]; students: number; incomplete: number; noResult: number;
  missingTeacherRemarks: number; missingPrincipalRemarks: number; missingCoScholastic: number; missingPhotos: number;
}
export type ResultStatus = 'PASS' | 'FAIL' | 'INCOMPLETE' | 'NO_RESULT';
export interface SummaryRow {
  studentId: string; studentName: string; sectionId: number | null; sectionName: string | null;
  percentage: number | null; grade: string | null; rank: number | null; status: ResultStatus; marksMissing: number;
  hasTeacherRemark: boolean; hasPrincipalRemark: boolean; coScholasticComplete: boolean; hasPhoto: boolean;
}
export interface Summary {
  setupId: number; setupName: string; resultMode: ResultMode; className: string; sessionLabel: string;
  sectionId: number | null; teacherView: boolean; readiness: Readiness; students: SummaryRow[];
}

export type PublicationStatus = 'ACTIVE' | 'SUPERSEDED' | 'WITHDRAWN';
export interface Publication {
  id: number; setupId: number; setupName: string; sectionId: number | null; sectionName: string | null;
  version: number; status: PublicationStatus; documentCount: number; publishedBy: string | null; publishedAt: string;
  withdrawnBy: string | null; withdrawnAt: string | null; withdrawalReason: string | null;
}
export interface StudentProblem { studentId: string; studentName: string | null; reason: string; }
export interface PublishResult {
  published: boolean; publication: Publication | null; documents: number;
  excludedIncomplete: StudentProblem[]; failed: StudentProblem[]; message: string;
}
/** A published (frozen) report card. */
export interface ReportCardDocument {
  id: number; publicationId: number; studentId: string; studentName: string; title: string; sessionLabel: string;
  className: string; sectionName: string | null; version: number; status: PublicationStatus; reference: string; issuedAt: string;
}
export interface BulkCheck { total: number; available: number; missing: StudentProblem[]; }
export interface SendResult { documents: number; queued: number; message: string; }

@Injectable({ providedIn: 'root' })
export class ReportCardV2Service {
  private base = `${environment.apiUrl}/report-cards/v2`;

  constructor(private http: HttpClient) {}

  // Setup
  listSetups(academicSessionId: number, classId: number): Observable<ReportCardSetup[]> {
    return this.http.get<ReportCardSetup[]>(`${this.base}/setups`, { params: { academicSessionId, classId } });
  }
  getSetup(id: number): Observable<ReportCardSetup> {
    return this.http.get<ReportCardSetup>(`${this.base}/setups/${id}`);
  }
  availableExams(academicSessionId: number, classId: number): Observable<AvailableExam[]> {
    return this.http.get<AvailableExam[]>(`${this.base}/setups/available-exams`, { params: { academicSessionId, classId } });
  }
  createSetup(req: SetupRequest): Observable<ReportCardSetup> {
    return this.http.post<ReportCardSetup>(`${this.base}/setups`, req);
  }
  updateSetup(id: number, req: SetupRequest): Observable<ReportCardSetup> {
    return this.http.put<ReportCardSetup>(`${this.base}/setups/${id}`, req);
  }
  deleteSetup(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/setups/${id}`);
  }

  // Design
  getDesign(): Observable<ReportCardDesign> {
    return this.http.get<ReportCardDesign>(`${this.base}/design`);
  }
  saveDesign(design: ReportCardDesign): Observable<ReportCardDesign> {
    return this.http.put<ReportCardDesign>(`${this.base}/design`, design);
  }
  listActivities(): Observable<Activity[]> {
    return this.http.get<Activity[]>(`${this.base}/design/activities`);
  }
  createActivity(name: string): Observable<Activity> {
    return this.http.post<Activity>(`${this.base}/design/activities`, { name, active: true });
  }
  updateActivity(id: number, change: { name?: string; active?: boolean }): Observable<Activity> {
    return this.http.put<Activity>(`${this.base}/design/activities/${id}`, change);
  }
  reorderActivities(ids: number[]): Observable<Activity[]> {
    return this.http.put<Activity[]>(`${this.base}/design/activities/order`, ids);
  }

  // Remarks
  getRemarks(setupId: number, sectionId: number | null): Observable<RemarksPage> {
    let params = new HttpParams();
    if (sectionId != null) params = params.set('sectionId', sectionId);
    return this.http.get<RemarksPage>(`${this.base}/setups/${setupId}/remarks`, { params });
  }
  saveRemarks(setupId: number, students: RemarkSaveRow[]): Observable<void> {
    return this.http.put<void>(`${this.base}/setups/${setupId}/remarks`, { students });
  }

  // Generate & Preview
  getSummary(setupId: number, sectionId: number | null): Observable<Summary> {
    let params = new HttpParams();
    if (sectionId != null) params = params.set('sectionId', sectionId);
    return this.http.get<Summary>(`${this.base}/setups/${setupId}/summary`, { params });
  }
  previewPdf(setupId: number, studentId: string): Observable<Blob> {
    return this.http.get(`${this.base}/setups/${setupId}/students/${encodeURIComponent(studentId)}/pdf`, { responseType: 'blob' });
  }

  // Published report cards (ADMIN)
  listPublications(setupId: number): Observable<Publication[]> {
    return this.http.get<Publication[]>(`${this.base}/setups/${setupId}/publications`);
  }
  publish(setupId: number, sectionId: number | null, includeIncomplete: boolean): Observable<PublishResult> {
    return this.http.post<PublishResult>(`${this.base}/setups/${setupId}/publications`, { sectionId, includeIncomplete });
  }
  withdraw(publicationId: number, reason: string | null): Observable<Publication> {
    return this.http.post<Publication>(`${this.base}/publications/${publicationId}/withdraw`, { reason });
  }
  publicationDocuments(publicationId: number): Observable<ReportCardDocument[]> {
    return this.http.get<ReportCardDocument[]>(`${this.base}/publications/${publicationId}/documents`);
  }
  bulkCheck(publicationId: number): Observable<BulkCheck> {
    return this.http.get<BulkCheck>(`${this.base}/publications/${publicationId}/bulk-check`);
  }
  downloadZip(publicationId: number): Observable<Blob> {
    return this.http.get(`${this.base}/publications/${publicationId}/documents.zip`, { responseType: 'blob' });
  }
  send(publicationId: number): Observable<SendResult> {
    return this.http.post<SendResult>(`${this.base}/publications/${publicationId}/send`, {});
  }

  // Published report cards (STUDENT / PARENT; ADMIN may open one document)
  myDocuments(studentId: string | null): Observable<ReportCardDocument[]> {
    let params = new HttpParams();
    if (studentId) params = params.set('studentId', studentId);
    return this.http.get<ReportCardDocument[]>(`${this.base}/documents`, { params });
  }
  getDocument(id: number): Observable<ReportCardDocument> {
    return this.http.get<ReportCardDocument>(`${this.base}/documents/${id}`);
  }
  documentPdf(id: number): Observable<Blob> {
    return this.http.get(`${this.base}/documents/${id}/pdf`, { responseType: 'blob' });
  }
}
