import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { Admin } from '../interfaces/admin';
import { normalizeAdminProfile } from '../utils/admin-validation.util';
import { UploadRequestResponse, UploadCompleteResponse } from '../interfaces/upload';

@Injectable({
  providedIn: 'root'
})
export class AdminService {

  private baseUrl = `${environment.apiUrl}/admins`;
  private noticeUrl = `${environment.apiUrl}/admin`;

  constructor(private http: HttpClient) { }

  getAdminById(adminId: string): Observable<Admin> {
    return this.http.get<Admin>(`${this.baseUrl}/${adminId}`);
  }

  getAllAdmins(): Observable<Admin[]> {
    return this.http.get<Admin[]>(this.baseUrl);
  }

  createAdmin(admin: Admin): Observable<Admin> {
    return this.http.post<Admin>(this.baseUrl, { ...normalizeAdminProfile(admin), adminId: admin.adminId.trim(), ...(admin.schoolId != null ? { schoolId: admin.schoolId } : {}) });
  }

  updateAdmin(adminId: string, admin: Admin): Observable<Admin> {
    return this.http.put<Admin>(`${this.baseUrl}/${encodeURIComponent(adminId)}`, normalizeAdminProfile(admin));
  }

  /** Emails the administrator a fresh one-hour setup link (never a password). */
  sendSetupLink(adminId: string): Observable<{ status: string; sentTo: string }> {
    return this.http.post<{ status: string; sentTo: string }>(`${this.baseUrl}/${encodeURIComponent(adminId)}/setup-link`, {});
  }

  deleteAdmin(adminId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${adminId}`);
  }

  sendNoticeToStudents(data: { title: string; subject: string; body: string }): Observable<string> {
    return this.http.post(this.noticeUrl + '/notice', data, { responseType: 'text' });
  }

  /**
   * Direct-to-object-storage upload: ask the backend for a short-lived presigned URL, PUT the
   * file bytes straight to object storage (never through this Angular app's own backend), then
   * tell the backend the upload finished so it can verify and attach the reference.
   */
  uploadAdminPhotoDirect(adminId: string, file: File): Observable<UploadCompleteResponse> {
    const uploadRequestUrl = `${environment.apiUrl}/files/upload-request`;
    const completeUrl = `${environment.apiUrl}/files/complete`;

    return this.http
      .post<UploadRequestResponse>(uploadRequestUrl, {
        purpose: 'ADMIN_PROFILE_PHOTO',
        entityId: adminId,
        fileName: file.name,
        contentType: file.type,
        size: file.size,
      })
      .pipe(
        switchMap((uploadRequest) => {
          const headers = new HttpHeaders(uploadRequest.requiredHeaders);
          return this.http.put(uploadRequest.uploadUrl, file, { headers }).pipe(
            switchMap(() =>
              this.http.post<UploadCompleteResponse>(completeUrl, {
                objectKey: uploadRequest.objectKey,
                purpose: 'ADMIN_PROFILE_PHOTO',
                entityId: adminId,
              }),
            ),
          );
        }),
      );
  }
}
