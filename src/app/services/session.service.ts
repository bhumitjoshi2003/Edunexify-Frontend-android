import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { UserSession } from '../interfaces/user-session';

/** Active-sessions management for the CALLING user's own account only — every
 * endpoint here is ownership-scoped server-side (see AuthController#listSessions
 * / revokeSession / revokeOtherSessions). "Log out everywhere" (logout-all) lives
 * on AuthService instead, since it's the same shape as the existing normal
 * logout flow (revoke + clear local auth state + navigate away), not a
 * session-list operation. */
@Injectable({
  providedIn: 'root'
})
export class SessionService {

  private apiUrl = `${environment.apiUrl}/auth/sessions`;

  constructor(private http: HttpClient) { }

  list(): Observable<UserSession[]> {
    return this.http.get<UserSession[]>(this.apiUrl, { withCredentials: true });
  }

  revoke(id: number): Observable<string> {
    return this.http.post(`${this.apiUrl}/${id}/revoke`, {}, { withCredentials: true, responseType: 'text' });
  }

  revokeOthers(): Observable<unknown> {
    return this.http.post(`${this.apiUrl}/revoke-others`, {}, { withCredentials: true });
  }
}
