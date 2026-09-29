import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface DashboardStats {
  totalStudents: number;
  totalTeachers: number;
  feesCollectedThisMonth: number;
  overdueStudents: number;
  todayAttendanceRate: number;
  /** Student + teacher pending leave requests. */
  pendingLeaves: number;
  pendingStudentLeaves?: number;
  pendingTeacherLeaves?: number;
}

export interface FeeTrend {
  month: string;
  amount: number;
}

export interface ClassStats {
  className: string;
  studentCount: number;
  attendanceRate: number;
}

export interface AttendanceTrend {
  period: string;
  attendanceRate: number;
}

@Injectable({ providedIn: 'root' })
export class DashboardAnalyticsService {
  private base = `${environment.apiUrl}/dashboard`;

  constructor(private http: HttpClient) {}

  getStats(): Observable<DashboardStats> {
    return this.http.get<DashboardStats>(`${this.base}/stats`);
  }

  getFeeTrend(): Observable<FeeTrend[]> {
    return this.http.get<FeeTrend[]>(`${this.base}/fee-trend`);
  }

  getClassStats(): Observable<ClassStats[]> {
    return this.http.get<ClassStats[]>(`${this.base}/class-stats`);
  }

  getAttendanceTrend(className: string, mode: 'weekly' | 'monthly'): Observable<AttendanceTrend[]> {
    const params = new HttpParams().set('className', className).set('mode', mode);
    return this.http.get<AttendanceTrend[]>(`${this.base}/attendance-trend`, { params });
  }
}
