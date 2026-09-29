import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AcademicSession } from '../interfaces/academic-session';
import { ActivationPreview, SessionActivationOutcome } from '../interfaces/session-activation';

export interface SessionReadiness {
  sessionId: number;
  sessionLabel: string;
  current: boolean;
  previousSessionId: number | null;
  previousSessionLabel: string | null;
  pendingStudents: number;
  pendingSample: { studentId: string; studentName: string | null; className: string | null; sectionName: string | null }[];
  targetEnrolled: number;
  plannedEnrollments: number;
  plannedDueNow: number;
  classTeacherConfigured: number | null;
  classTeacherIssues: boolean | null;
  activeClasses: number;
  timetableEntries: number;
  classesWithTimetable: number;
  studentsWithFees: number;
  studentsWithoutFees: number;
  warnings: string[];
}

@Injectable({
  providedIn: 'root'
})
export class AcademicSessionService {
  private apiUrl = `${environment.apiUrl}/academic-sessions`;

  constructor(private http: HttpClient) {}

  getAllSessions(): Observable<AcademicSession[]> {
    return this.http.get<AcademicSession[]>(this.apiUrl);
  }

  getCurrentSession(): Observable<AcademicSession> {
    return this.http.get<AcademicSession>(`${this.apiUrl}/current`);
  }

  createSession(session: Partial<AcademicSession>): Observable<AcademicSession> {
    return this.http.post<AcademicSession>(this.apiUrl, session);
  }

  /** Phase G: switching current now also activates that session's class-teacher configuration
   *  in the same atomic backend call — see SessionActivationOutcome for the combined result. */
  setCurrentSession(sessionId: number): Observable<SessionActivationOutcome> {
    return this.http.put<SessionActivationOutcome>(`${this.apiUrl}/${sessionId}/set-current`, {});
  }

  /** Read-only preview of what activating this session's class-teacher configuration would do
   *  if it were made current right now — for the "Make Current" confirmation, before committing. */
  getActivationPreview(sessionId: number): Observable<ActivationPreview> {
    return this.http.get<ActivationPreview>(`${this.apiUrl}/${sessionId}/activation-preview`);
  }

  /** Read-only readiness warnings for "Make Current" (never blocks the switch). */
  getReadiness(sessionId: number): Observable<SessionReadiness> {
    return this.http.get<SessionReadiness>(`${this.apiUrl}/${sessionId}/readiness`);
  }

  deleteSession(sessionId: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${sessionId}`);
  }
}
