import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthStateService, UserInfo } from './auth-state.service';
import { clearIntendedRoute } from './redirect-url.util';

interface ChangePasswordRequest {
  userId: string;
  oldPassword: string;
  newPassword: string;
}

interface RegisterRequest {
  userId: string;
  // Omitted for STUDENT/TEACHER — the backend derives their initial password
  // from date of birth and rejects any client-supplied password for those roles.
  password?: string;
  role: string;
  email: string;
}

interface ChangeInitialPasswordRequest {
  newPassword: string;
  confirmPassword: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private apiUrl = `${environment.apiUrl}/auth`;

  constructor(private http: HttpClient, private authStateService: AuthStateService) { }

  register(userData: RegisterRequest): Observable<string> {
    return this.http.post(`${this.apiUrl}/register`, userData, { responseType: 'text' });
  }

  login(userId: string, password: string, schoolSlug?: string | null): Observable<UserInfo> {
    const body: Record<string, string> = { userId, password };
    if (schoolSlug) { body['schoolSlug'] = schoolSlug; }
    return this.http.post<UserInfo>(`${this.apiUrl}/login`, body, { withCredentials: true });
  }

  refreshToken(): Observable<UserInfo> {
    return this.http.post<UserInfo>(`${this.apiUrl}/refresh-token`, {}, { withCredentials: true });
  }

  logout(): Observable<string> {
    return this.http.post(`${this.apiUrl}/logout`, {}, { withCredentials: true, responseType: 'text' }).pipe(
      tap(() => {
        this.authStateService.clearUser();
        clearIntendedRoute();
      })
    );
  }

  /** "Log out everywhere" — revokes every session for this account, including the
   * one making this request. Mirrors logout() exactly: the backend has no
   * access-token blacklist (access tokens are stateless and simply expire
   * naturally), so clearing local auth state here is what actually makes the app
   * behave as logged-out immediately, regardless of the cookie's own expiry. */
  logoutAll(): Observable<unknown> {
    return this.http.post(`${this.apiUrl}/logout-all`, {}, { withCredentials: true }).pipe(
      tap(() => {
        this.authStateService.clearUser();
        clearIntendedRoute();
      })
    );
  }

  changePassword(request: ChangePasswordRequest): Observable<string> {
    return this.http.post(`${this.apiUrl}/change-password`, request, { responseType: 'text', withCredentials: true });
  }

  /** Completes a mandatory first-login password change for a restricted session. */
  changeInitialPassword(request: ChangeInitialPasswordRequest): Observable<string> {
    return this.http.post(`${this.apiUrl}/change-initial-password`, request, { responseType: 'text', withCredentials: true });
  }

  requestPasswordReset(userId: string, email: string): Observable<string> {
    return this.http.post(`${this.apiUrl}/request-password-reset`, { userId, email }, { responseType: 'text' });
  }

  resetPassword(token: string, newPassword: string): Observable<string> {
    const params = new HttpParams().set('token', token);
    return this.http.post(this.apiUrl + '/reset-password', { newPassword }, { params, responseType: 'text' });
  }

  getUserRole(): string {
    return this.authStateService.getUserRole();
  }

  getUserId(): string {
    return this.authStateService.getUserId();
  }
}
