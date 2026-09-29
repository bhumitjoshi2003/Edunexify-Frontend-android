import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { TeacherLeave, TeacherLeaveApplyRequest } from '../interfaces/teacher-leave';
import { PaginatedResponse } from './payment-history.service';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class TeacherLeaveService {
  private apiUrl = `${environment.apiUrl}/teacher-leaves`;

  constructor(private http: HttpClient) { }

  applyLeave(request: TeacherLeaveApplyRequest): Observable<TeacherLeave> {
    return this.http.post<TeacherLeave>(`${this.apiUrl}/apply`, request, { withCredentials: true });
  }

  getCalendarConfig(): Observable<{ workingDays: string; timezone: string }> {
    return this.http.get<{ workingDays: string; timezone: string }>(`${this.apiUrl}/calendar-config`, { withCredentials: true });
  }

  getMyLeaves(page: number, size: number): Observable<PaginatedResponse<TeacherLeave>> {
    const params = new HttpParams()
      .append('page', page.toString())
      .append('size', size.toString())
      .append('sort', 'startDate,desc');
    return this.http.get<PaginatedResponse<TeacherLeave>>(`${this.apiUrl}/my-leaves`, { params, withCredentials: true });
  }

  getLeaves(
    page: number,
    size: number,
    status?: string,
    teacherId?: string,
    date?: string
  ): Observable<PaginatedResponse<TeacherLeave>> {
    let params = new HttpParams()
      .append('page', page.toString())
      .append('size', size.toString())
      .append('sort', 'appliedDate,desc');
    if (status) {
      params = params.append('status', status);
    }
    if (teacherId) {
      params = params.append('teacherId', teacherId);
    }
    if (date) {
      params = params.append('date', date);
    }
    return this.http.get<PaginatedResponse<TeacherLeave>>(this.apiUrl, { params, withCredentials: true });
  }

  /** First decision on a PENDING request (APPROVED or REJECTED), with an optional reason. */
  updateStatus(leaveId: number, status: string, reason?: string | null): Observable<TeacherLeave> {
    return this.http.patch<TeacherLeave>(`${this.apiUrl}/${leaveId}/status`, { status, reason: reason || null }, { withCredentials: true });
  }

  /** Admin change of a decision (APPROVED ↔ REJECTED); a reason is required. */
  reverseDecision(leaveId: number, reason: string): Observable<TeacherLeave> {
    return this.http.post<TeacherLeave>(`${this.apiUrl}/${leaveId}/reverse`, { reason }, { withCredentials: true });
  }

  /** Cancels (kept as CANCELLED history). An approved leave needs a reason (admin only). */
  cancelLeave(leaveId: number, reason?: string | null): Observable<{ message: string }> {
    const params = reason ? new HttpParams().set('reason', reason) : undefined;
    return this.http.delete<{ message: string }>(`${this.apiUrl}/${leaveId}`, { params, withCredentials: true });
  }
}
