import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  TeacherCheckinRequest,
  AdminMarkRequest,
  TeacherAttendanceRecord,
  TeacherAttendanceSummary,
  TeacherAttendanceSessionSummary,
  TeacherAttendanceTodaySummary,
  MarkableTeacher,
  SchoolTiming
} from '../interfaces/teacher-checkin';

@Injectable({ providedIn: 'root' })
export class TeacherCheckinService {

  private baseUrl = `${environment.apiUrl}/teacher-checkin`;

  constructor(private http: HttpClient) {}

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
    return this.http.get<TeacherAttendanceRecord[]>(`${this.baseUrl}/date/${date}`);
  }

  /** Teachers expected to attend on the date who have no record yet — the manual-marking list. */
  getMarkableTeachers(date: string): Observable<MarkableTeacher[]> {
    return this.http.get<MarkableTeacher[]>(`${this.baseUrl}/date/${date}/markable-teachers`);
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
    return this.http.get<TeacherAttendanceSummary>(`${this.baseUrl}/summary`, { params: scopedParams });
  }

  getTeacherSessionSummary(teacherId: string, session: string): Observable<TeacherAttendanceSessionSummary> {
    const params = new HttpParams().set('teacherId', teacherId).set('session', session);
    return this.http.get<TeacherAttendanceSessionSummary>(`${this.baseUrl}/summary/session`, { params });
  }

  getSchoolTiming(): Observable<SchoolTiming> {
    return this.http.get<SchoolTiming>(`${this.baseUrl}/school-timing`);
  }

  getTodaySummary(): Observable<TeacherAttendanceTodaySummary> {
    return this.http.get<TeacherAttendanceTodaySummary>(`${this.baseUrl}/today-summary`);
  }
}
