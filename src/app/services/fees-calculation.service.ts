import { Injectable } from '@angular/core';
import { PaymentData } from '../interfaces/payment-data';
import { emptyPaymentData } from '../utils/fee-payment.util';

@Injectable({
  providedIn: 'root'
})
export class FeesCalculationService {

  /** First calendar month of the academic year (1=Jan, 4=Apr, 7=Jul, etc.). Set once per session load. */
  private startMonth = 4;

  setStartMonth(month: number): void {
    if (month >= 1 && month <= 12) {
      this.startMonth = month;
    }
  }

  getAcademicMonth(calendarMonth: number): number {
    return ((calendarMonth - this.startMonth + 12) % 12) + 1;
  }

  getSessionStartYear(session: string): number {
    return parseInt(session.substring(0, 4));
  }

  getMonthName(academicMonth: number): string {
    const calendarMonths = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const calendarIndex = (this.startMonth - 1 + academicMonth - 1) % 12;
    return calendarMonths[calendarIndex];
  }

  createEmptyPaymentData(): PaymentData {
    return emptyPaymentData();
  }
}
