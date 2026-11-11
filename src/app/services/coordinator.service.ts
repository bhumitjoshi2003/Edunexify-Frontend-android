import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of, shareReplay, map, catchError } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthStateService } from '../auth/auth-state.service';
import {
  CoordinatorAppointment, CoordinatorAttendanceUnit, CoordinatorClassroomPost, CoordinatorMarksCompletion,
  CoordinatorOverview, CoordinatorReportCardProgress, CoordinatorScopeRequest, CoordinatorStudent,
  CoordinatorTeacher, CoordinatorUnit, MyCoordinatorAppointment, ReportCardCorrectionRequest,
  CoordinatorStaffToday, CoordinatorLeaveSummary
} from '../interfaces/coordinator';

/**
 * Coordinator appointments (Admin / Principal) and the Coordinator's own scoped screens. The server
 * re-checks the appointment and scope on every call; the client only uses scope to trim choices.
 */
@Injectable({ providedIn: 'root' })
export class CoordinatorService {
  private readonly api = `${environment.apiUrl}/coordinator`;
  private readonly appointmentsApi = `${environment.apiUrl}/coordinators`;
  private readonly principalReviewApi = `${environment.apiUrl}/principal/report-cards`;
  private mine$: Observable<MyCoordinatorAppointment | null> | null = null;
  private mineFor: string | null = null;

  constructor(private http: HttpClient, private authState: AuthStateService) {}

  // ── Appointments (Admin / Principal) ──────────────────────────────

  list(includeRemoved = false): Observable<CoordinatorAppointment[]> {
    const params = new HttpParams().set('includeRemoved', includeRemoved);
    return this.http.get<CoordinatorAppointment[]>(this.appointmentsApi, { params });
  }

  appoint(teacherId: string, scope: CoordinatorScopeRequest[]): Observable<CoordinatorAppointment> {
    return this.http.post<CoordinatorAppointment>(this.appointmentsApi, { teacherId, scope });
  }

  updateScope(id: number, scope: CoordinatorScopeRequest[]): Observable<CoordinatorAppointment> {
    return this.http.put<CoordinatorAppointment>(`${this.appointmentsApi}/${id}`, { scope });
  }

  remove(id: number, reason: string): Observable<CoordinatorAppointment> {
    return this.http.post<CoordinatorAppointment>(`${this.appointmentsApi}/${id}/remove`, { reason });
  }

  // ── The Coordinator's own appointment ─────────────────────────────

  /** Cached per signed-in user; null when the caller is not a Coordinator. */
  mine(): Observable<MyCoordinatorAppointment | null> {
    const user = this.authState.getUserId();
    if (!this.authState.isCoordinator()) return of(null);
    if (!this.mine$ || this.mineFor !== user) {
      this.mineFor = user;
      this.mine$ = this.http.get<MyCoordinatorAppointment>(`${this.api}/me`).pipe(
        catchError(() => of(null)),
        shareReplay({ bufferSize: 1, refCount: false })
      );
    }
    return this.mine$;
  }

  /**
   * Trims a class list for a Coordinator: class-wide pages (subjects, exams, groups, streams)
   * keep only classes covered in full. Anyone else gets the list unchanged.
   */
  restrictToFullClasses<T extends { id: number }>(classes: T[]): Observable<T[]> {
    if (!this.authState.isCoordinator()) return of(classes);
    return this.mine().pipe(map(m => {
      const ids = new Set(m?.fullClassIds ?? []);
      return classes.filter(c => ids.has(c.id));
    }));
  }

  /** Class names with any covered section or stream (leave, attendance reports and communication work per class). */
  restrictToScopedClassNames(names: string[]): Observable<string[]> {
    if (!this.authState.isCoordinator()) return of(names);
    return this.mine().pipe(map(m => {
      const scoped = new Set((m?.scope ?? []).map(e => e.className));
      return names.filter(n => scoped.has(n));
    }));
  }

  /** Same as {@link restrictToFullClasses} for pages that list classes by name. */
  restrictClassNames(names: string[]): Observable<string[]> {
    if (!this.authState.isCoordinator()) return of(names);
    return this.mine().pipe(map(m => {
      const full = new Set((m?.scope ?? []).filter(e => (m?.fullClassIds ?? []).includes(e.classId)).map(e => e.className));
      return names.filter(n => full.has(n));
    }));
  }

  /**
   * Whether a student's class records (attendance, leave, results) are inside the Coordinator's
   * scope. The directory and basic profile are school-wide; these records are not. A stream-limited
   * entry is left to the server, which knows the student's stream. Anyone else: true (their own
   * role rules apply on the server).
   */
  coversStudentRecords(student: { classId?: number | null; className?: string | null; sectionId?: number | null }): Observable<boolean> {
    if (!this.authState.isCoordinator()) return of(true);
    return this.mine().pipe(map(m => (m?.scope ?? []).some(e =>
      (student.classId != null ? e.classId === student.classId : e.className === student.className)
      && (e.sectionId == null || e.sectionId === (student.sectionId ?? null)))));
  }

  overview(): Observable<CoordinatorOverview> {
    return this.http.get<CoordinatorOverview>(`${this.api}/overview`);
  }

  units(): Observable<CoordinatorUnit[]> {
    return this.http.get<CoordinatorUnit[]>(`${this.api}/units`);
  }

  students(classId?: number | null, sectionId?: number | null): Observable<CoordinatorStudent[]> {
    let params = new HttpParams();
    if (classId != null) params = params.set('classId', classId);
    if (sectionId != null) params = params.set('sectionId', sectionId);
    return this.http.get<CoordinatorStudent[]>(`${this.api}/students`, { params });
  }

  teachers(): Observable<CoordinatorTeacher[]> {
    return this.http.get<CoordinatorTeacher[]>(`${this.api}/teachers`);
  }

  /** Active teachers who may be timetabled (name and ID only). */
  assignableTeachers(): Observable<{ teacherId: string; name: string; status: 'ACTIVE' }[]> {
    return this.http.get<{ teacherId: string; name: string; status: 'ACTIVE' }[]>(`${this.api}/assignable-teachers`);
  }

  attendance(date?: string | null): Observable<CoordinatorAttendanceUnit[]> {
    const params = date ? new HttpParams().set('date', date) : undefined;
    return this.http.get<CoordinatorAttendanceUnit[]>(`${this.api}/attendance`, { params });
  }

  /** Staff present today across the school (read-only), the same figures the Principal sees. */
  staffToday(): Observable<CoordinatorStaffToday> {
    return this.http.get<CoordinatorStaffToday>(`${this.api}/staff-attendance/today-summary`);
  }

  /** Pending student leave in scope, and how much of it has reached day 3 (the Coordinator's first reminder). */
  leaveSummary(): Observable<CoordinatorLeaveSummary> {
    return this.http.get<CoordinatorLeaveSummary>(`${environment.apiUrl}/leaves/attention-summary`);
  }

  marksCompletion(): Observable<CoordinatorMarksCompletion[]> {
    return this.http.get<CoordinatorMarksCompletion[]>(`${this.api}/marks-completion`);
  }

  /**
   * Report Card Review is one feature for the Principal (the whole school) and a Coordinator (their
   * scope): the same screens, a different server-side scope. It is oversight only — it has no approval.
   */
  private get reviewApi(): string {
    return this.authState.getUserRole() === 'PRINCIPAL' ? this.principalReviewApi : `${this.api}/report-cards`;
  }

  reportCards(): Observable<CoordinatorReportCardProgress[]> {
    return this.http.get<CoordinatorReportCardProgress[]>(this.reviewApi);
  }

  corrections(setupId: number, sectionId: number | null): Observable<ReportCardCorrectionRequest[]> {
    const params = sectionId != null ? new HttpParams().set('sectionId', sectionId) : undefined;
    return this.http.get<ReportCardCorrectionRequest[]>(`${this.reviewApi}/${setupId}/correction-requests`, { params });
  }

  requestCorrection(setupId: number, sectionId: number | null, reason: string, studentId?: string | null):
      Observable<ReportCardCorrectionRequest> {
    return this.http.post<ReportCardCorrectionRequest>(`${this.reviewApi}/${setupId}/correction-requests`,
      { sectionId, reason, studentId: studentId || null });
  }

  classroom(from?: string, to?: string): Observable<CoordinatorClassroomPost[]> {
    let params = new HttpParams();
    if (from) params = params.set('from', from);
    if (to) params = params.set('to', to);
    return this.http.get<CoordinatorClassroomPost[]>(`${this.api}/classroom`, { params });
  }
}

/**
 * For screens every role shares: the service when it can be created here, otherwise null. It is
 * only ever used for a Coordinator, so a screen built without it (or without HTTP) behaves as before.
 */
export function optionalCoordinatorService(): CoordinatorService | null {
  try {
    return inject(CoordinatorService, { optional: true });
  } catch {
    return null;
  }
}

/** Class names trimmed to a Coordinator's fully covered classes; unchanged for everyone else. */
export function coordinatorClassNames(service: CoordinatorService | null, names: string[]): Observable<string[]> {
  return service ? service.restrictClassNames(names) : of(names);
}

/** Class records trimmed to a Coordinator's fully covered classes; unchanged for everyone else. */
export function coordinatorFullClasses<T extends { id: number }>(service: CoordinatorService | null, classes: T[]): Observable<T[]> {
  return service ? service.restrictToFullClasses(classes) : of(classes);
}
