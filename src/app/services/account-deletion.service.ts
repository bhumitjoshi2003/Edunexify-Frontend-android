import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Capacitor } from '@capacitor/core';
import { environment } from '../../environments/environment';
import {
  AccountDeletionAccessCheck,
  AccountDeletionAccessRevocation,
  AccountDeletionRequest,
  AccountDeletionRequestAdminView,
  AccountDeletionRequestPage,
  AccountDeletionRequestStatus,
  AccountDeletionStatusUpdate,
} from '../interfaces/account-deletion-request';

/** Account deletion requests. The backend takes the requester and school from the session only. */
@Injectable({ providedIn: 'root' })
export class AccountDeletionService {
  private readonly baseUrl = `${environment.apiUrl}/account-deletion-requests`;

  constructor(private http: HttpClient) {}

  /** The signed-in user's latest request, or null (204) when they have never made one. */
  mine(): Observable<AccountDeletionRequest | null> {
    return this.http.get<AccountDeletionRequest | null>(`${this.baseUrl}/mine`);
  }

  /** Returns the open request instead of creating a second one when there already is one. */
  submit(reason: string): Observable<AccountDeletionRequest> {
    return this.http.post<AccountDeletionRequest>(this.baseUrl, {
      confirmed: true,
      reason: reason.trim() || null,
      platform: Capacitor.isNativePlatform() ? 'ANDROID' : 'WEB',
    });
  }

  /** SUPER_ADMIN review queue. */
  list(status: AccountDeletionRequestStatus | '', page: number, size = 20): Observable<AccountDeletionRequestPage> {
    let params = new HttpParams().set('page', page).set('size', size).set('sort', 'createdAt,desc');
    if (status) params = params.set('status', status);
    return this.http.get<AccountDeletionRequestPage>(this.baseUrl, { params });
  }

  updateStatus(id: number, update: AccountDeletionStatusUpdate): Observable<AccountDeletionRequestAdminView> {
    return this.http.put<AccountDeletionRequestAdminView>(`${this.baseUrl}/${id}/status`, update);
  }

  /** Read-only: whether the requester's login, sessions and push tokens are gone. */
  access(id: number): Observable<AccountDeletionAccessCheck> {
    return this.http.get<AccountDeletionAccessCheck>(`${this.baseUrl}/${id}/access`);
  }

  /** Revokes the requester's sessions and removes their push tokens. Processing stage only; idempotent. */
  revokeAccess(id: number): Observable<AccountDeletionAccessRevocation> {
    return this.http.post<AccountDeletionAccessRevocation>(`${this.baseUrl}/${id}/revoke-access`, {});
  }
}
