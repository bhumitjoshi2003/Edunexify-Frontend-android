import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { UploadCompleteResponse, UploadRequestResponse } from '../interfaces/upload';
import {
  ClassUpdate,
  ClassUpdateContext,
  CreateClassUpdateRequest,
  UpdateClassUpdateRequest,
} from '../interfaces/class-update';

@Injectable({ providedIn: 'root' })
export class ClassUpdateService {
  private readonly baseUrl = `${environment.apiUrl}/class-updates`;
  private readonly fileUploadApiUrl = `${environment.apiUrl}/files`;

  constructor(private http: HttpClient) {}

  /**
   * Same direct-to-object-storage contract as the other uploads: the update doesn't exist yet, so
   * entityId is the shared "new" sentinel and the returned objectKey is sent with the update.
   */
  uploadAttachmentDirect(file: File): Observable<UploadCompleteResponse> {
    const purpose = 'CLASS_UPDATE_ATTACHMENT';
    const entityId = 'new';
    return this.http
      .post<UploadRequestResponse>(`${this.fileUploadApiUrl}/upload-request`, {
        purpose, entityId, fileName: file.name, contentType: file.type, size: file.size,
      })
      .pipe(
        switchMap(uploadRequest => {
          const headers = new HttpHeaders(uploadRequest.requiredHeaders);
          return this.http.put(uploadRequest.uploadUrl, file, { headers }).pipe(
            switchMap(() => this.http.post<UploadCompleteResponse>(`${this.fileUploadApiUrl}/complete`, {
              objectKey: uploadRequest.objectKey, purpose, entityId,
            })),
          );
        }),
      );
  }

  // Teacher
  myContexts(): Observable<ClassUpdateContext[]> {
    return this.http.get<ClassUpdateContext[]>(`${this.baseUrl}/my/contexts`);
  }

  myRecent(): Observable<ClassUpdate[]> {
    return this.http.get<ClassUpdate[]>(`${this.baseUrl}/my`);
  }

  create(request: CreateClassUpdateRequest): Observable<ClassUpdate> {
    return this.http.post<ClassUpdate>(this.baseUrl, request);
  }

  update(id: number, request: UpdateClassUpdateRequest): Observable<ClassUpdate> {
    return this.http.put<ClassUpdate>(`${this.baseUrl}/${id}`, request);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  // Student — active (non-expired) updates for their class, newest first.
  /** A parent names the linked child (the backend checks the link); a student never sends one. */
  studentActive(limit?: number, studentId?: string | null): Observable<ClassUpdate[]> {
    let params = new HttpParams();
    if (limit) params = params.set('limit', limit);
    if (studentId) params = params.set('studentId', studentId);
    return this.http.get<ClassUpdate[]>(`${this.baseUrl}/student`, { params });
  }
}
