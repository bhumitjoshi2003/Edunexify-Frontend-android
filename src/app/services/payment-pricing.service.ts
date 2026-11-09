import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { PaymentPricingConfig, PaymentPricingConfigRequest } from '../interfaces/payment-pricing-config';

/** Platform-level (SUPER_ADMIN only) payment pricing management — see
 * PlatformPaymentPricingController on the backend. */
@Injectable({
  providedIn: 'root'
})
export class PaymentPricingService {

  private baseUrl = `${environment.apiUrl}/super-admin/payment-pricing`;

  constructor(private http: HttpClient) { }

  list(gatewayProvider: string = 'RAZORPAY'): Observable<PaymentPricingConfig[]> {
    return this.http.get<PaymentPricingConfig[]>(this.baseUrl, { params: { gatewayProvider } });
  }

  create(request: PaymentPricingConfigRequest): Observable<PaymentPricingConfig> {
    return this.http.post<PaymentPricingConfig>(this.baseUrl, request);
  }

  cancel(id: number): Observable<PaymentPricingConfig> {
    return this.http.post<PaymentPricingConfig>(`${this.baseUrl}/${id}/cancel`, {});
  }
}
