import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { UploadCompleteResponse, UploadRequestResponse } from '../interfaces/upload';

export type PrincipalGender = 'Male' | 'Female' | 'Other';
export type EmploymentType = 'PERMANENT' | 'CONTRACT' | 'PROBATION' | 'DEPUTATION';

/** Optional profile fields. Omitted on create/replace when nothing was entered. */
export interface PrincipalDetails {
  gender: PrincipalGender | null;
  dob: string | null;
  phoneNumber: string | null;
  alternatePhoneNumber: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pinCode: string | null;
  qualification: string | null;
  specialization: string | null;
  experienceYears: number | null;
  previousInstitution: string | null;
  joiningDate: string | null;
  employmentType: EmploymentType | null;
}

/** userId is the internal identity (sent back as expectedUserId); loginId is the readable pri_ ID. */
export interface PrincipalProfile {
  userId: string;
  loginId: string;
  name: string;
  email: string;
  active: boolean;
  photoUrl: string | null;
  details: PrincipalDetails | null;
}

export interface PrincipalAppointment {
  id: number;
  userId: string;
  loginId: string | null;
  name: string;
  email: string;
  appointedAt: string;
  endedAt: string | null;
  appointedBy: string | null;
  endedBy: string | null;
  reason: string | null;
}

export const EMPLOYMENT_TYPES: { value: EmploymentType; label: string }[] = [
  { value: 'PERMANENT', label: 'Permanent' },
  { value: 'CONTRACT', label: 'Contract' },
  { value: 'PROBATION', label: 'Probation' },
  { value: 'DEPUTATION', label: 'Deputation' },
];

@Injectable({ providedIn: 'root' })
export class PrincipalService {
  private readonly endpoint = `${environment.apiUrl}/principals`;

  constructor(private http: HttpClient) {}

  current(): Observable<PrincipalProfile[]> {
    return this.http.get<PrincipalProfile[]>(this.endpoint);
  }

  history(): Observable<PrincipalAppointment[]> {
    return this.http.get<PrincipalAppointment[]>(`${this.endpoint}/current/history`);
  }

  create(body: object): Observable<PrincipalProfile> {
    return this.http.post<PrincipalProfile>(this.endpoint, body);
  }

  edit(body: object): Observable<PrincipalProfile> {
    return this.http.put<PrincipalProfile>(`${this.endpoint}/current`, body);
  }

  replace(body: object): Observable<PrincipalProfile> {
    return this.http.post<PrincipalProfile>(`${this.endpoint}/current/replacement`, body);
  }

  activation(body: object): Observable<PrincipalProfile> {
    return this.http.post<PrincipalProfile>(`${this.endpoint}/current/activation`, body);
  }

  resendSetupLink(expectedUserId: string): Observable<void> {
    return this.http.post<void>(`${this.endpoint}/current/setup-link`, { expectedUserId });
  }

  /** Same direct-to-object-storage flow as teacher photos; entityId is the internal userId. */
  uploadPhotoDirect(userId: string, file: File): Observable<UploadCompleteResponse> {
    const purpose = 'PRINCIPAL_PROFILE_PHOTO';
    return this.http
      .post<UploadRequestResponse>(`${environment.apiUrl}/files/upload-request`, {
        purpose, entityId: userId, fileName: file.name, contentType: file.type, size: file.size,
      })
      .pipe(
        switchMap((request) =>
          this.http.put(request.uploadUrl, file, { headers: new HttpHeaders(request.requiredHeaders) }).pipe(
            switchMap(() =>
              this.http.post<UploadCompleteResponse>(`${environment.apiUrl}/files/complete`, {
                objectKey: request.objectKey, purpose, entityId: userId,
              }),
            ),
          ),
        ),
      );
  }
}
