import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, TimeoutError } from 'rxjs';
import { environment } from '../../environments/environment';

export interface DemoRequestPayload {
  schoolName:   string;
  contactName:  string;
  email:        string;
  phone:        string;
  numberOfStudents?: string;
  city?:        string;
  message?:     string;
}

export interface DemoRequestSummary {
  id:           number;
  schoolName:   string;
  contactName:  string;
  email:        string;
  phone:        string;
  numberOfStudents?: string;
  city?:        string;
  message?:     string;
  status:       'PENDING' | 'CONTACTED' | 'COMPLETED' | 'REJECTED';
  requestedAt:  string;
}

export const DEMO_SUPPORT_EMAIL = 'support@edunexify.co.in';

/** A clear, actionable message for a failed submission — what happened and what to do next. */
export function demoSubmissionError(err: unknown): { title: string; message: string } {
  if (err instanceof TimeoutError) {
    return { title: 'Request Timed Out',
      message: `We could not confirm whether your request was received. Please contact ${DEMO_SUPPORT_EMAIL} before submitting again.` };
  }
  const status = err instanceof HttpErrorResponse ? err.status : -1;
  if (status === 0) {
    return { title: 'No Connection',
      message: 'We could not reach the server. Please check your internet connection and try again.' };
  }
  if (status === 400 || status === 422) {
    return { title: 'Please Check Your Details',
      message: serverMessage(err as HttpErrorResponse) ?? 'Some of the details look invalid. Please review the form and try again.' };
  }
  if (status === 429) {
    return { title: 'Too Many Requests', message: 'Please wait a minute and try again.' };
  }
  if (status >= 500) {
    return { title: 'Something Went Wrong',
      message: `Our server had a problem. Please try again in a few minutes, or email ${DEMO_SUPPORT_EMAIL}.` };
  }
  return { title: 'Submission Failed',
    message: `Could not send your request. Please try again or contact us at ${DEMO_SUPPORT_EMAIL}.` };
}

/** The backend's own message when it sent a short plain one (the body arrives as text). */
function serverMessage(err: HttpErrorResponse): string | null {
  let body: any = err.error;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return null; } }
  const message = body?.message;
  return typeof message === 'string' && message.trim() && message.length <= 200 ? message.trim() : null;
}

@Injectable({ providedIn: 'root' })
export class DemoService {

  private baseUrl = `${environment.apiUrl}/demo-requests`;

  constructor(private http: HttpClient) {}

  /** Public — no auth required */
  submitRequest(payload: DemoRequestPayload): Observable<string> {
    return this.http.post(this.baseUrl, payload, { responseType: 'text' });
  }

  /** Admin only — view all demo requests */
  getAll(): Observable<DemoRequestSummary[]> {
    return this.http.get<DemoRequestSummary[]>(this.baseUrl);
  }

  /** Admin only — update status */
  updateStatus(id: number, status: DemoRequestSummary['status']): Observable<string> {
    return this.http.patch(`${this.baseUrl}/${id}/status`, { status }, { responseType: 'text' });
  }
}
