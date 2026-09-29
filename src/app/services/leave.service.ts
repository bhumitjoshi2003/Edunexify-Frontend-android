import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { LeaveRequest } from '../interfaces/leave-request';
import { environment } from '../../environments/environment';

export interface LeaveApplication {
  id: number;
  studentId: string;
  studentName: string;
  leaveDate: string;
  reason: string;
  className: string;
  status: string;
  appliedDate?: string;
  decidedBy?: string | null;
  decidedAt?: string | null;
  decisionReason?: string | null;
  cancelledBy?: string | null;
  cancelledAt?: string | null;
  cancellationReason?: string | null;
}

export interface OnLeaveToday {
  date: string;
  students: { leaveId: number; studentId: string; studentName: string; className: string; sectionName: string | null; reason: string }[];
  staff: { leaveId: number; teacherId: string; teacherName: string; startDate: string; endDate: string; reason: string;
           periodsToday: number; periodsNeedingSubstitute: number }[];
  periodsNeedingSubstitute: number;
}

export interface PaginatedResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
  first: boolean;
  last: boolean;
  empty: boolean;
}

@Injectable({
  providedIn: 'root',
})

export class LeaveService {
  private apiUrl = `${environment.apiUrl}/leaves`;

  constructor(private http: HttpClient) { }

  applyLeave(leaveRequest: LeaveRequest, studentId?: string): Observable<string> {
    const params = studentId ? new HttpParams().set('studentId', studentId) : undefined;
    return this.http.post(`${this.apiUrl}/apply-leave`, leaveRequest, { params, responseType: 'text', withCredentials: true });
  }

  getLeavesPaginated(
    page: number,
    size: number,
    className?: string,
    studentId?: string,
    date?: string,
    status?: string,
    sortBy?: string,
    sortDir?: string
  ): Observable<PaginatedResponse<LeaveApplication>> {
    let params = new HttpParams()
      .append('page', page.toString())
      .append('size', size.toString());

    if (className && className !== 'all') {
      params = params.append('className', className);
    }
    if (studentId) {
      params = params.append('studentId', studentId);
    }
    if (date) {
      params = params.append('date', date);
    }
    if (status) {
      params = params.append('status', status);
    }
    if (sortBy) {
      params = params.append('sort', `${sortBy},${sortDir || 'asc'}`);
    }

    return this.http.get<PaginatedResponse<LeaveApplication>>(`${this.apiUrl}/student`, { params, withCredentials: true });
  }

  getLeavesByStudentId(
    studentId: string,
    page: number,
    size: number
  ): Observable<PaginatedResponse<LeaveApplication>> {
    const params = new HttpParams()
      .append('page', page.toString())
      .append('size', size.toString())
      .append('sort', 'leaveDate,desc');
    return this.http.get<PaginatedResponse<LeaveApplication>>(
      `${this.apiUrl}/student/${studentId}`, { params, withCredentials: true });
  }

  /** Cancels (the request stays as CANCELLED history). */
  deleteLeave(studentId: string, leaveDate: string, reason?: string | null): Observable<string> {
    const params = reason ? new HttpParams().set('reason', reason) : undefined;
    return this.http.delete(`${this.apiUrl}/delete/${studentId}/${leaveDate}`, { params, responseType: 'text', withCredentials: true });
  }

  /** Admin cancel (kept as history). An approved leave needs a reason. */
  deleteLeaveById(leaveId: number, reason?: string | null): Observable<string> {
    const params = reason ? new HttpParams().set('reason', reason) : undefined;
    return this.http.delete(`${this.apiUrl}/${leaveId}`, { params, responseType: 'text', withCredentials: true });
  }

  /** First decision on a PENDING request (APPROVED or REJECTED), with an optional reason. */
  updateLeaveStatus(leaveId: number, status: string, reason?: string | null): Observable<LeaveApplication> {
    return this.http.patch<LeaveApplication>(`${this.apiUrl}/${leaveId}/status`, { status, reason: reason || null }, { withCredentials: true });
  }

  /** Explicit change of a decision (APPROVED ↔ REJECTED); a reason is required. */
  reverseLeaveDecision(leaveId: number, reason: string): Observable<LeaveApplication> {
    return this.http.post<LeaveApplication>(`${this.apiUrl}/${leaveId}/reverse`, { reason }, { withCredentials: true });
  }

  getOnLeaveToday(): Observable<OnLeaveToday> {
    return this.http.get<OnLeaveToday>(`${this.apiUrl}/on-leave-today`, { withCredentials: true });
  }

  getLeavesByDateAndClass(date: string, selectedClass: string): Observable<string[]> {
    return this.http.get<string[]>(`${this.apiUrl}/date/${date}/class/${selectedClass}`, { withCredentials: true });
  }
}
