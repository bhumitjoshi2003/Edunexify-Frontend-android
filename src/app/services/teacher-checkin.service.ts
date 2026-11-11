import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthStateService } from '../auth/auth-state.service';
import {
  TeacherCheckinRequest,
  AdminMarkRequest,
  TeacherAttendanceRecord,
  TeacherAttendanceSummary,
  TeacherAttendanceSessionSummary,
  TeacherAttendanceTodaySummary,
  MarkableTeacher,
  SchoolTiming,
  AttendanceCorrectionRequest,
  TeacherAttendanceCorrection
} from '../interfaces/teacher-checkin';

@Injectable({ providedIn: 'root' })
export class TeacherCheckinService {

  private baseUrl = `${environment.apiUrl}/teacher-checkin`;
  /** The Principal reads and corrects staff attendance through its own audited endpoints. */
  private principalUrl = `${environment.apiUrl}/principal/staff-attendance`;
  /** A Coordinator uses the same paths, limited by the server to teachers in their scope. */
  private coordinatorUrl = `${environment.apiUrl}/coordinator/staff-attendance`;

  constructor(private http: HttpClient, private authState: AuthStateService) {}

  private get staffUrl(): string {
    if (this.authState.isCoordinator()) return this.coordinatorUrl;
    return this.authState.getUserRole() === 'PRINCIPAL' ? this.principalUrl : this.baseUrl;
  }

  /** Where corrections, their history and the caller's own record live (Principal or Coordinator). */
  private get correctionUrl(): string {
    return this.authState.isCoordinator() ? this.coordinatorUrl : this.principalUrl;
  }

  /** Principal correction (reason required); the server refuses the Principal's own record. */
  principalCorrect(req: AttendanceCorrectionRequest): Observable<TeacherAttendanceRecord> {
    return this.http.post<TeacherAttendanceRecord>(`${this.correctionUrl}/corrections`, req);
  }

  /** Correction history in the caller's school, newest first. */
  getCorrectionHistory(teacherId?: string, date?: string): Observable<TeacherAttendanceCorrection[]> {
    let params = new HttpParams();
    if (teacherId) params = params.set('teacherId', teacherId);
    if (date) params = params.set('date', date);
    return this.http.get<TeacherAttendanceCorrection[]>(`${this.correctionUrl}/corrections`, { params });
  }

  /** The Principal's own teacher record(s), shown read-only. */
  getOwnTeacherIds(): Observable<{ teacherIds: string[]; protectedTeacherIds?: string[] }> {
    return this.http.get<{ teacherIds: string[]; protectedTeacherIds?: string[] }>(`${this.correctionUrl}/self`);
  }

  checkIn(req: TeacherCheckinRequest): Observable<TeacherAttendanceRecord> {
    return this.http.post<TeacherAttendanceRecord>(`${this.baseUrl}/check-in`, req);
  }

  checkOut(req: TeacherCheckinRequest): Observable<TeacherAttendanceRecord> {
    return this.http.post<TeacherAttendanceRecord>(`${this.baseUrl}/check-out`, req);
  }

  adminMark(req: AdminMarkRequest): Observable<TeacherAttendanceRecord> {
    return this.http.post<TeacherAttendanceRecord>(`${this.baseUrl}/admin-mark`, req);
  }

  getByDate(date: string): Observable<TeacherAttendanceRecord[]> {
    return this.http.get<TeacherAttendanceRecord[]>(`${this.staffUrl}/date/${date}`);
  }

  /** Teachers expected to attend on the date who have no record yet — the manual-marking list. */
  getMarkableTeachers(date: string): Observable<MarkableTeacher[]> {
    return this.http.get<MarkableTeacher[]>(`${this.staffUrl}/date/${date}/markable-teachers`);
  }

  getCalendarConfig(): Observable<{ workingDays: string; timezone: string }> {
    return this.http.get<{ workingDays: string; timezone: string }>(`${environment.apiUrl}/attendance/calendar-config`);
  }

  getMyAttendance(month: number, year: number): Observable<TeacherAttendanceSummary> {
    const params = new HttpParams().set('month', month).set('year', year);
    return this.http.get<TeacherAttendanceSummary>(`${this.baseUrl}/my-attendance`, { params });
  }

  getSummary(month: number, year: number, teacherId?: string): Observable<TeacherAttendanceSummary> {
    const params = new HttpParams().set('month', month).set('year', year);
    const scopedParams = teacherId ? params.set('teacherId', teacherId) : params;
    return this.http.get<TeacherAttendanceSummary>(`${this.staffUrl}/summary`, { params: scopedParams });
  }

  getTeacherSessionSummary(teacherId: string, session: string): Observable<TeacherAttendanceSessionSummary> {
    const params = new HttpParams().set('teacherId', teacherId).set('session', session);
    return this.http.get<TeacherAttendanceSessionSummary>(`${this.staffUrl}/summary/session`, { params });
  }

  getSchoolTiming(): Observable<SchoolTiming> {
    return this.http.get<SchoolTiming>(`${this.staffUrl}/school-timing`);
  }

  getTodaySummary(): Observable<TeacherAttendanceTodaySummary> {
    return this.http.get<TeacherAttendanceTodaySummary>(`${this.baseUrl}/today-summary`);
  }
}
