import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { CreateParentRequest, GuardianLink, LinkStudentRequest, ParentDirectoryStats, ParentProfile, ParentStatusFilter, ParentLinkedFilter, ParentSummary, UpdateParentRequest } from '../interfaces/parent-portal';
import { PaginatedResponse } from './leave.service';

export interface ParentDirectoryQuery {
  page: number;
  size: number;
  search?: string;
  status?: ParentStatusFilter;
  linked?: ParentLinkedFilter;
}

@Injectable({ providedIn: 'root' })
export class ParentPortalService {
  private readonly baseUrl = `${environment.apiUrl}/parents`;
  constructor(private http: HttpClient) {}

  listParents(query: ParentDirectoryQuery): Observable<PaginatedResponse<ParentSummary>> {
    let params = new HttpParams().set('page', query.page).set('size', query.size);
    if (query.search) params = params.set('search', query.search);
    if (query.status && query.status !== 'ALL') params = params.set('status', query.status);
    if (query.linked && query.linked !== 'ALL') params = params.set('linked', query.linked);
    return this.http.get<PaginatedResponse<ParentSummary>>(this.baseUrl, { params });
  }
  getDirectoryStats(): Observable<ParentDirectoryStats> {
    return this.http.get<ParentDirectoryStats>(`${this.baseUrl}/stats`);
  }
  createParent(request: CreateParentRequest): Observable<ParentProfile> {
    return this.http.post<ParentProfile>(this.baseUrl, request);
  }
  getParent(parentId: string): Observable<ParentProfile> {
    return this.http.get<ParentProfile>(`${this.baseUrl}/${encodeURIComponent(parentId)}`);
  }
  updateParent(parentId: string, request: UpdateParentRequest): Observable<ParentProfile> {
    return this.http.put<ParentProfile>(`${this.baseUrl}/${encodeURIComponent(parentId)}`, request);
  }
  resendSetupLink(parentId: string): Observable<{ parentId: string; status: string }> {
    return this.http.post<{ parentId: string; status: string }>(
      `${this.baseUrl}/${encodeURIComponent(parentId)}/resend-setup-link`, {});
  }
  getGuardians(studentId: string): Observable<GuardianLink[]> {
    return this.http.get<GuardianLink[]>(`${this.baseUrl}/students/${encodeURIComponent(studentId)}/guardians`);
  }
  getMyProfile(): Observable<ParentProfile> { return this.http.get<ParentProfile>(`${this.baseUrl}/me/profile`); }
  linkStudent(parentId: string, request: LinkStudentRequest): Observable<ParentProfile> {
    return this.http.post<ParentProfile>(`${this.baseUrl}/${encodeURIComponent(parentId)}/children`, request);
  }
  unlinkStudent(parentId: string, relationshipId: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${encodeURIComponent(parentId)}/children/${relationshipId}`);
  }
  setActive(parentId: string, active: boolean): Observable<{ parentId: string; active: boolean }> {
    return this.http.patch<{ parentId: string; active: boolean }>(
      `${this.baseUrl}/${encodeURIComponent(parentId)}/status`, { active });
  }
  resetPassword(parentId: string, temporaryPassword: string): Observable<{ parentId: string; status: string }> {
    return this.http.post<{ parentId: string; status: string }>(
      `${this.baseUrl}/${encodeURIComponent(parentId)}/reset-password`, { temporaryPassword });
  }
}
