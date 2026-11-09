import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { StudentFee } from '../interfaces/student-fee';
import { CheckoutQuote } from '../interfaces/checkout-quote';
import { MonthFeeBreakdown } from '../interfaces/month-fee-breakdown';
import { ManualPaymentRequest } from '../interfaces/manual-payment-request';
import { RecalculationEntry } from '../interfaces/recalculation';
import { PendingConfirmation } from '../interfaces/pending-confirmation';

@Injectable({
  providedIn: 'root'
})
export class FeesService {

  private baseUrl = `${environment.apiUrl}/student-fees`;

  constructor(private http: HttpClient) { }

  getStudentFees(studentId: string, year: string): Observable<StudentFee[]> {
    return this.http.get<StudentFee[]>(`${this.baseUrl}/${studentId}/${year}`);
  }

  getStudentFee(studentId: string, year: string, month: number): Observable<StudentFee> {
    return this.http.get<StudentFee>(`${this.baseUrl}/${studentId}/${year}/${month}`);
  }

  updateStudentFees(studentFees: StudentFee): Observable<StudentFee> {
    return this.http.put<StudentFee>(`${this.baseUrl}/`, studentFees);
  }

  createStudentFees(studentFees: StudentFee): Observable<StudentFee> {
    return this.http.post<StudentFee>(`${this.baseUrl}/`, studentFees);
  }

  getDistinctYearsByStudentId(studentId: string): Observable<string[]> {
    return this.http.get<string[]>(`${this.baseUrl}/sessions/${studentId}`);
  }

  /** Backend-authoritative checkout amount for a set of selected academic months — school
   * fee due + late fee + platform fee = totalAmount. The single source of truth for what
   * gets displayed and charged; the frontend must not recompute any of these itself. */
  getCheckoutQuote(studentId: string, session: string, months: number[]): Observable<CheckoutQuote> {
    const params = { session, months: months.join(',') };
    return this.http.get<CheckoutQuote>(`${this.baseUrl}/${studentId}/checkout-quote`, { params });
  }

  /** Backend-authoritative per-fee-head breakdown for a single month — the fee-head name,
   * gross amount, discount/waiver, and net amount for every StudentFeesLineItem row on that
   * month, plus the trusted school-fee total. Never computed in Angular; a month with no
   * line items yet (a historical row) comes back with lineItemBreakdownAvailable=false. */
  getMonthFeeBreakdown(studentId: string, year: string, month: number): Observable<MonthFeeBreakdown> {
    return this.http.get<MonthFeeBreakdown>(`${this.baseUrl}/${studentId}/${year}/${month}/breakdown`);
  }

  /** Backend-authoritative manual payment: the admin supplies only what they observed
   * (student, months, amount received, mode, reference) — Spring Boot recomputes the real
   * amount owed from each month's StudentFees snapshot, validates amountReceived against it,
   * and marks the covered months paid in one transaction. The frontend must never split a
   * total across months or flip StudentFees.paid directly (e.g. via updateStudentFees) —
   * this is now the only path that can mark a month manually paid. */
  recordManualPayment(request: ManualPaymentRequest): Observable<{ message: string; paymentId: string }> {
    return this.http.post<{ message: string; paymentId: string }>(`${this.baseUrl}/manual-payment`, request);
  }

  /** Admin-only (Phase 5A). Computes what each selected month's snapshot WOULD become under
   * the current fee configuration — writes nothing. */
  previewRecalculation(studentId: string, session: string, months: number[]): Observable<RecalculationEntry[]> {
    return this.http.post<RecalculationEntry[]>(`${this.baseUrl}/recalculate/preview`, { studentId, session, months });
  }

  /** Admin-only (Phase 5A). Actually recalculates the selected months — requires a non-blank
   * reason. The backend recomputes independently; it never trusts amounts from a prior
   * preview call sent back by the frontend. */
  applyRecalculation(studentId: string, session: string, months: number[], reason: string): Observable<RecalculationEntry[]> {
    return this.http.post<RecalculationEntry[]>(`${this.baseUrl}/recalculate/apply`, { studentId, session, months, reason });
  }

  /** Online payments for this student's session that were taken but not yet recorded — their
   * months must not be offered for payment again. Server state: survives refresh and other devices. */
  getPendingConfirmations(studentId: string, session: string): Observable<PendingConfirmation[]> {
    return this.http.get<PendingConfirmation[]>(`${environment.apiUrl}/payments/pending-confirmations`,
      { params: { studentId, session } });
  }
}
