import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { CreateOrderRequest } from '../interfaces/payment-data';
import { environment } from '../../environments/environment';

/** Shared by the web and Android clients — keep the two copies identical. */
export interface RazorpayOrderResponse {
  razorpayKey: string;
  /** PAISE — the Razorpay order amount, priced by the server when the order was created. This is
   * what Razorpay Checkout displays and charges. */
  amount: number;
  orderId: string;
  /** Razorpay Checkout display name chosen server-side from trusted data: the school's own name on
   * its own gateway, "Edunexify" on the platform account. Preferred over schoolName. */
  checkoutName?: string;
  schoolName?: string;
  schoolFeePaise?: number;
  onlineConvenienceFeePaise?: number;
  totalPayablePaise?: number;
  currency?: string;
}

export interface RazorpayPaymentResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

export interface RazorpayVerifyResponse {
  success: boolean;
  message?: string;
  /** The payment was received but Razorpay's confirmation of the capture is still in progress —
   * the server records it automatically once confirmed. Not a failure; never pay again. */
  pending?: boolean;
  paymentId?: string;
}

@Injectable({
  providedIn: 'root'
})
export class RazorpayService {

  private baseUrl = `${environment.apiUrl}/payments`;

  constructor(private http: HttpClient) { }

  /** Body must come from toCreateOrderRequest() — see interfaces/payment-data.ts. */
  createOrder(request: CreateOrderRequest): Observable<RazorpayOrderResponse> {
    return this.http.post<RazorpayOrderResponse>(`${this.baseUrl}/create`, request);
  }

  verifyPayment(paymentResponse: RazorpayPaymentResponse, orderDetails: RazorpayOrderResponse): Observable<RazorpayVerifyResponse> {
    return this.http.post<RazorpayVerifyResponse>(`${this.baseUrl}/verify`, { paymentResponse, orderDetails });
  }
}
