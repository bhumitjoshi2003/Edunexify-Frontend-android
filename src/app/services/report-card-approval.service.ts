import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../environments/environment';

export interface ApprovalItem {
  setupId: number;
  setupName: string;
  className: string;
  sectionId: number | null;
  sectionName: string | null;
  status: string;
  stale: boolean;
}
export interface ApprovalState {
  stateVersion: number;
  status: string;
  stale: boolean;
  reviewRevisionId: string | null;
  teacherUserId: string | null;
  principalUserId: string | null;
  returnReason: string | null;
}
export interface ReviewStudent {
  studentId: string;
  studentName: string;
  status: string;
  missingMarks: number;
  included: boolean;
}
export interface ReviewSummary {
  revisionId: string;
  fingerprint: string;
  academicSession: string;
  setupName: string;
  className: string;
  sectionName: string | null;
  attendanceCutoff: string;
  includeIncomplete: boolean;
  totalStudents: number;
  completeCards: number;
  incompleteCards: number;
  missingMarks: number;
  excludedStudents: number;
  includedStudents: number;
  teacherUserId: string;
  students: ReviewStudent[];
  state: ApprovalState;
}
export interface ApprovalHistory {
  id: number;
  actorId: string;
  actorRole: string | null;
  action: string;
  reason: string | null;
  createdAt: string;
  revisionId: string | null;
}
export type ApprovalAction = 'teacher-approve' | 'principal-approve' | 'return';
@Injectable({ providedIn: 'root' })
export class ReportCardApprovalService {
  private readonly base = `${environment.apiUrl}/report-card-approvals`;
  constructor(private http: HttpClient) {}
  private params(item: ApprovalItem): HttpParams {
    return item.sectionId == null
      ? new HttpParams()
      : new HttpParams().set('sectionId', item.sectionId);
  }
  queue() {
    return this.http.get<ApprovalItem[]>(`${this.base}/queue`);
  }
  review(item: ApprovalItem, includeIncomplete: boolean) {
    return this.http.post<ReviewSummary>(
      `${this.base}/setups/${item.setupId}/review`,
      { includeIncomplete },
      { params: this.params(item) }
    );
  }
  history(item: ApprovalItem, offset = 0) {
    return this.http.get<ApprovalHistory[]>(
      `${this.base}/setups/${item.setupId}/history`,
      { params: this.params(item).set('limit', 50).set('offset', offset) }
    );
  }
  preview(item: ApprovalItem, revision: string, student: string) {
    return this.http.get(
      `${this.base}/setups/${item.setupId}/reviews/${encodeURIComponent(
        revision
      )}/preview/${encodeURIComponent(student)}`,
      { params: this.params(item), responseType: 'blob' }
    );
  }
  act(
    item: ApprovalItem,
    action: ApprovalAction,
    revisionId: string,
    requestId: string,
    reason?: string
  ) {
    return this.http.post<ApprovalState>(
      `${this.base}/setups/${item.setupId}/${action}`,
      { revisionId, requestId, ...(action === 'return' ? { reason } : {}) },
      { params: this.params(item) }
    );
  }
}
