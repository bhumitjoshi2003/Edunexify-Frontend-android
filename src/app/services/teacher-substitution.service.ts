import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  FreeSubstituteTeacher,
  MyCoverage,
  SubstitutionBulkItem,
  SubstitutionBulkResult,
  SubstitutionDayOverview,
  SubstitutionFillPreview,
  TeacherSubstitution,
  UncoveredPeriod,
} from '../interfaces/teacher-substitution';

@Injectable({ providedIn: 'root' })
export class TeacherSubstitutionService {
  private readonly baseUrl = `${environment.apiUrl}/substitutions`;

  constructor(private http: HttpClient) {}

  getUncovered(date: string): Observable<UncoveredPeriod[]> {
    return this.http.get<UncoveredPeriod[]>(`${this.baseUrl}/uncovered`, { params: { date } });
  }

  /** Admin day view: affected periods with state, ranked suggestions and today's cover workload. */
  getOverview(date: string): Observable<SubstitutionDayOverview> {
    return this.http.get<SubstitutionDayOverview>(`${this.baseUrl}/overview`, { params: { date } });
  }

  getFreeTeachers(timetableEntryId: number, date: string): Observable<FreeSubstituteTeacher[]> {
    const params = new HttpParams().set('timetableEntryId', timetableEntryId).set('date', date);
    return this.http.get<FreeSubstituteTeacher[]>(`${this.baseUrl}/free-teachers`, { params });
  }

  assign(timetableEntryId: number, date: string, substituteTeacherId: string, note?: string | null): Observable<TeacherSubstitution> {
    return this.http.post<TeacherSubstitution>(this.baseUrl, { timetableEntryId, date, substituteTeacherId, note: note || null });
  }

  /** A note of undefined keeps the existing note; '' clears it. */
  change(id: number, substituteTeacherId: string, note?: string | null): Observable<TeacherSubstitution> {
    return this.http.put<TeacherSubstitution>(`${this.baseUrl}/${id}`,
      note === undefined ? { substituteTeacherId } : { substituteTeacherId, note });
  }

  cancel(id: number): Observable<TeacherSubstitution> {
    return this.http.delete<TeacherSubstitution>(`${this.baseUrl}/${id}`);
  }

  /** "Fill all with suggested" preview — nothing is saved. */
  suggestFill(date: string): Observable<SubstitutionFillPreview> {
    return this.http.get<SubstitutionFillPreview>(`${this.baseUrl}/suggest-fill`, { params: { date } });
  }

  /** Saves confirmed items one by one; every item's outcome is returned. */
  assignMany(date: string, items: SubstitutionBulkItem[]): Observable<SubstitutionBulkResult> {
    return this.http.post<SubstitutionBulkResult>(`${this.baseUrl}/bulk`, { date, items });
  }

  getMine(date: string): Observable<TeacherSubstitution[]> {
    return this.http.get<TeacherSubstitution[]>(`${this.baseUrl}/mine`, { params: { date } });
  }

  /** The logged-in teacher's own periods on a day they're away, and who covers each. */
  getMyCoverage(date: string): Observable<MyCoverage> {
    return this.http.get<MyCoverage>(`${this.baseUrl}/my-coverage`, { params: { date } });
  }
}
