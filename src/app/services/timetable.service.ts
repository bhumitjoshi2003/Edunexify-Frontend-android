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

  downloadBulkTemplate(): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/bulk/template`, { responseType: 'blob' });
  }

  bulkImport(file: File, academicSessionId: number): Observable<TimetableBulkImportResult> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<TimetableBulkImportResult>(`${this.baseUrl}/bulk`, formData, { params: { academicSessionId } });
  }
}
