import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { UploadCompleteResponse, UploadRequestResponse } from '../interfaces/upload';
import { CreateHomeworkRequest, HomeworkClasswork, UpdateHomeworkRequest } from '../interfaces/homework';

@Injectable({ providedIn: 'root' })
export class HomeworkService {
  private readonly baseUrl = `${environment.apiUrl}/homework-classwork`;
  private readonly fileUploadApiUrl = `${environment.apiUrl}/files`;

  constructor(private http: HttpClient) {}

  /**
   * Same direct-to-object-storage contract as the other uploads: the post doesn't exist yet, so
   * entityId is the shared "new" sentinel and the returned objectKey is sent with the post.
   */
  uploadAttachmentDirect(file: File): Observable<UploadCompleteResponse> {
    const purpose = 'HOMEWORK_ATTACHMENT';
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
  create(request: CreateHomeworkRequest): Observable<HomeworkClasswork> {
    return this.http.post<HomeworkClasswork>(this.baseUrl, request);
  }

  update(id: number, request: UpdateHomeworkRequest): Observable<HomeworkClasswork> {
    return this.http.put<HomeworkClasswork>(`${this.baseUrl}/${id}`, request);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  myPostsOn(date: string): Observable<HomeworkClasswork[]> {
    return this.http.get<HomeworkClasswork[]>(`${this.baseUrl}/my`, { params: new HttpParams().set('date', date) });
  }

  myRecent(): Observable<HomeworkClasswork[]> {
    return this.http.get<HomeworkClasswork[]>(`${this.baseUrl}/my/recent`);
  }

  // Student — or a parent, who names the linked child (the backend checks the link; a student's
  // own requests never send one)
  studentOn(date?: string, studentId?: string | null): Observable<HomeworkClasswork[]> {
    let params = new HttpParams();
    if (date) params = params.set('date', date);
    if (studentId) params = params.set('studentId', studentId);
    return this.http.get<HomeworkClasswork[]>(`${this.baseUrl}/student`, { params });
  }

  studentUpcoming(studentId?: string | null): Observable<HomeworkClasswork[]> {
    const params = studentId ? new HttpParams().set('studentId', studentId) : undefined;
    return this.http.get<HomeworkClasswork[]>(`${this.baseUrl}/student/upcoming`, { params });
  }

  studentRecent(studentId?: string | null): Observable<HomeworkClasswork[]> {
    const params = studentId ? new HttpParams().set('studentId', studentId) : undefined;
    return this.http.get<HomeworkClasswork[]>(`${this.baseUrl}/student/recent`, { params });
  }
}
