import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { TimetableEntry, TimetableEntryRequest } from '../interfaces/timetable';
import { SessionCopyRequest, SessionCopyResult } from '../interfaces/teaching-configuration';

export interface TimetableBulkImportError {
  row: number;
  label: string;
  reason: string;
}

export interface TimetableBulkImportSuccess {
  row: number;
  label: string;
  entryId: number;
}

export interface TimetableBulkImportResult {
  academicSessionId: number;
  totalRows: number;
  successful: number;
  failed: number;
  errors: TimetableBulkImportError[];
  created: TimetableBulkImportSuccess[];
}


export interface TimetableTimingPeriod {
  periodNumber: number;
  startTime: string;
  endTime: string;
}

export interface TimetableTimingProfile {
  id: number;
  name: string;
  active: boolean;
  periods: TimetableTimingPeriod[];
}

export interface TimetableTimingDisplay {
  showTimes: boolean;
  activeProfileId: number | null;
  activeProfileName: string | null;
  periods: TimetableTimingPeriod[];
}

export interface TimetableTimingConfig {
  showTimes: boolean;
  activeProfileId: number | null;
  profiles: TimetableTimingProfile[];
}

@Injectable({ providedIn: 'root' })
export class TimetableService {
  private baseUrl = `${environment.apiUrl}/timetable`;

  constructor(private http: HttpClient) {}

  getClassTimetable(className: string, sectionId?: number | null, studentId?: string | null, academicSessionId?: number): Observable<TimetableEntry[]> {
    let params = new HttpParams();
    if (academicSessionId != null) params = params.set('academicSessionId', academicSessionId);
    if (sectionId != null) {
      params = params.set('sectionId', sectionId.toString());
    }
    if (studentId) {
      params = params.set('studentId', studentId);
    }
    return this.http.get<TimetableEntry[]>(
      `${this.baseUrl}/class/${encodeURIComponent(className)}`,
      { params }
    );
  }

  getTeacherTimetable(teacherId: string, academicSessionId?: number): Observable<TimetableEntry[]> {
    return this.http.get<TimetableEntry[]>(`${this.baseUrl}/teacher/${encodeURIComponent(teacherId)}`, { params: academicSessionId == null ? {} : { academicSessionId } });
  }

  /** Canonical names of the subjects configured for this class — the only valid period subjects. */
  getPermittedSubjects(classId: number): Observable<string[]> {
    return this.http.get<string[]>(`${this.baseUrl}/subjects`, { params: { classId } });
  }

  createEntry(entry: TimetableEntryRequest): Observable<TimetableEntry> {
    return this.http.post<TimetableEntry>(this.baseUrl, entry);
  }

  updateEntry(id: number, entry: TimetableEntryRequest): Observable<TimetableEntry> {
    return this.http.put<TimetableEntry>(`${this.baseUrl}/${id}`, entry);
  }

  deleteEntry(id: number, academicSessionId: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`, { params: { academicSessionId } });
  }

  copySession(body: SessionCopyRequest & { confirmCurrentTarget: boolean }): Observable<SessionCopyResult> {
    return this.http.post<SessionCopyResult>(`${this.baseUrl}/copy-session`, body);
  }

  getTimingDisplay(): Observable<TimetableTimingDisplay> {
    return this.http.get<TimetableTimingDisplay>(`${this.baseUrl}/timing/display`);
  }

  getTimingConfig(): Observable<TimetableTimingConfig> {
    return this.http.get<TimetableTimingConfig>(`${this.baseUrl}/timing/config`);
  }

  createTimingProfile(body: { name: string; copyFromProfileId?: number | null; fromCurrentTimetable?: boolean }): Observable<TimetableTimingProfile> {
    return this.http.post<TimetableTimingProfile>(`${this.baseUrl}/timing/profiles`, body);
  }

  updateTimingProfile(id: number, body: { name: string; periods: TimetableTimingPeriod[] }): Observable<TimetableTimingProfile> {
    return this.http.put<TimetableTimingProfile>(`${this.baseUrl}/timing/profiles/${id}`, body);
  }

  activateTimingProfile(id: number): Observable<TimetableTimingConfig> {
    return this.http.post<TimetableTimingConfig>(`${this.baseUrl}/timing/profiles/${id}/activate`, {});
  }

  setTimingVisibility(showTimes: boolean): Observable<TimetableTimingConfig> {
    return this.http.put<TimetableTimingConfig>(`${this.baseUrl}/timing/visibility`, { showTimes });
  }

  deleteTimingProfile(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/timing/profiles/${id}`);
  }

  downloadBulkTemplate(): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/bulk/template`, { responseType: 'blob' });
  }

  bulkImport(file: File, academicSessionId: number): Observable<TimetableBulkImportResult> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<TimetableBulkImportResult>(`${this.baseUrl}/bulk`, formData, { params: { academicSessionId } });
  }
}
