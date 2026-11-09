import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  PaymentGatewayStatus,
  SchoolPaymentGateway,
  SchoolPaymentGatewayOverview,
  SchoolPaymentGatewaySubmitRequest,
  SchoolPaymentGatewaySubmitResponse,
  SchoolPaymentSetupDetails,
} from '../interfaces/payment-gateway';

/** School-owned Razorpay gateways: ADMIN submits (SchoolPaymentGatewayController), SUPER_ADMIN
 * approves/rejects/retires and controls the platform fallback (SuperAdminPaymentGatewayController). */
@Injectable({
  providedIn: 'root'
})
export class PaymentGatewayService {

  private schoolUrl = `${environment.apiUrl}/school/payment-gateway`;
  private superAdminUrl = `${environment.apiUrl}/super-admin`;

  constructor(private http: HttpClient) { }

  // ── ADMIN ────────────────────────────────────────────────────────────────────

  getOverview(): Observable<SchoolPaymentGatewayOverview> {
    return this.http.get<SchoolPaymentGatewayOverview>(this.schoolUrl);
  }

  /** Verifies the keys with Razorpay and creates the waiting connection; returns its setup details once. */
  submit(request: SchoolPaymentGatewaySubmitRequest): Observable<SchoolPaymentGatewaySubmitResponse> {
    return this.http.post<SchoolPaymentGatewaySubmitResponse>(this.schoolUrl, request);
  }

  /** Shows the Connection URL and Security code again — requires the current password every time. */
  getSetupDetails(id: number, currentPassword: string): Observable<SchoolPaymentSetupDetails> {
    return this.http.post<SchoolPaymentSetupDetails>(`${this.schoolUrl}/${id}/setup-details`, { currentPassword });
  }

  /** Records that the admin finished the Razorpay-side setup. */
  confirmSetup(id: number): Observable<SchoolPaymentGateway> {
    return this.http.post<SchoolPaymentGateway>(`${this.schoolUrl}/${id}/setup-confirmed`, {});
  }

  // ── SUPER_ADMIN ──────────────────────────────────────────────────────────────

  list(status: PaymentGatewayStatus = 'PENDING'): Observable<SchoolPaymentGateway[]> {
    return this.http.get<SchoolPaymentGateway[]>(`${this.superAdminUrl}/payment-gateways`, { params: { status } });
  }

  activate(id: number): Observable<SchoolPaymentGateway> {
    return this.http.post<SchoolPaymentGateway>(`${this.superAdminUrl}/payment-gateways/${id}/activate`, {});
  }

  reject(id: number, reason: string): Observable<SchoolPaymentGateway> {
    return this.http.post<SchoolPaymentGateway>(`${this.superAdminUrl}/payment-gateways/${id}/reject`, { reason });
  }

  retire(id: number, reason: string): Observable<SchoolPaymentGateway> {
    return this.http.post<SchoolPaymentGateway>(`${this.superAdminUrl}/payment-gateways/${id}/retire`, { reason });
  }

  /** The server's effective fallback rules (latestCutoff = "yyyy-MM-dd"); the backend stays authoritative. */
  getPlatformFallbackPolicy(): Observable<{ latestCutoff: string }> {
    return this.http.get<{ latestCutoff: string }>(`${this.superAdminUrl}/platform-payment-fallback/policy`);
  }

  /** until = "yyyy-MM-dd" (capped server-side by the global cut-off) or null to stop the fallback. */
  setPlatformFallback(schoolId: number, until: string | null, reason: string)
      : Observable<{ schoolId: number; platformPaymentFallbackUntil: string | null }> {
    return this.http.put<{ schoolId: number; platformPaymentFallbackUntil: string | null }>(
      `${this.superAdminUrl}/schools/${schoolId}/platform-payment-fallback`, { until, reason });
  }
}
