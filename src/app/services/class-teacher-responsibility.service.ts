import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Responsibility, ResponsibilityRequest, SessionCopyRequest, SessionCopyResult, ActivationPreview, ActivationApply } from '../interfaces/teaching-configuration';
@Injectable({ providedIn: 'root' })
export class ClassTeacherResponsibilityService {
  private url = `${environment.apiUrl}/class-teacher-responsibilities`;
  constructor(private http: HttpClient) {}
  list(academicSessionId: number) { return this.http.get<Responsibility[]>(this.url, { params: { academicSessionId } }); }
  create(body: ResponsibilityRequest) { return this.http.post<Responsibility>(this.url, body); }
  update(id: number, body: ResponsibilityRequest) { return this.http.put<Responsibility>(`${this.url}/${id}`, body); }
  delete(id: number, academicSessionId: number) { return this.http.delete<void>(`${this.url}/${id}`, { params: { academicSessionId } }); }
  copy(body: SessionCopyRequest) { return this.http.post<SessionCopyResult>(`${this.url}/copy-session`, body); }
  preview() { return this.http.get<ActivationPreview>(`${this.url}/activation/preview`); }
  apply() { return this.http.post<ActivationApply>(`${this.url}/activation/apply`, {}); }
}
