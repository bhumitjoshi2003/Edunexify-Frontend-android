import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface MarkEntryStudent {
  studentId: string;
  studentName: string;
  marksObtained: number | null;
}

export interface StudentExamSubject {
  examSubjectEntryId: number;
  subjectName: string;
  maxMarks: number;
  examDate: string;
  marksObtained: number | null;
}

export interface SubjectResult {
  subjectName: string;
  maxMarks: number;
  examDate: string;
  marksObtained: number | null;
  classAverage: number | null;
  /** Rank by marks among the same exam, class and section; null when no mark. */
  rank: number | null;
  /** Subject grade from the school's grading system (backend); null when not entered. */
  grade?: string | null;
  /** Subject pass/fail from the backend GradingPolicy; null when not entered. */
  passed?: boolean | null;
}

/** Canonical result metadata from the backend (ResultCalculator) — never recomputed here. */
export interface ResultMeta {
  resultStatus: 'DRAFT' | 'PUBLISHED';
  /** False while any applicable subject has no mark; percentage/grade/passed/rank are then null. */
  complete: boolean;
  marksMissing: number;
  grade: string | null;
  passed: boolean | null;
}

export interface ExamResult extends ResultMeta {
  examId: number;
  examName: string;
  className: string;
  session: string;
  studentName: string;
  subjects: SubjectResult[];
  totalMarksObtained: number;
  totalMaxMarks: number;
  percentage: number | null;
  /** Competition rank by percentage within the same exam, class and section. */
  overallRank: number | null;
}

export interface MarkEntryRequest {
  studentId: string;
  examSubjectEntryId: number;
  marksObtained: number;
}

export interface MarkError {
  index?: number;
  studentId: string;
  examSubjectEntryId?: number;
  reason: string;
}

export interface MarkBulkResult {
  saved: number;
  updated: number;
  errors: MarkError[];
}

/** 400 body when a bulk save is rejected: nothing was saved. */
export interface MarkSaveRejection {
  message: string;
  errors: MarkError[];
}

export interface ClassStudentSubject {
  subjectName: string;
  maxMarks: number;
  examDate: string;
  marksObtained: number | null;
}

export interface ClassStudentResult extends ResultMeta {
  studentId: string;
  studentName: string;
  sectionName: string | null;
  subjects: ClassStudentSubject[];
  totalMarksObtained: number;
  totalMaxMarks: number;
  percentage: number | null;
  /** Rank within the student's section; null while the result is incomplete. */
  rank: number | null;
}

@Injectable({ providedIn: 'root' })
export class MarksService {
  private base = `${environment.apiUrl}/marks`;

  constructor(private http: HttpClient) { }

  // Mark entry — Mode A: by subject
  getStudentsForSubject(examSubjectEntryId: number, sectionId?: number | null): Observable<MarkEntryStudent[]> {
    const params = sectionId != null ? { params: { sectionId: String(sectionId) } } : {};
    return this.http.get<MarkEntryStudent[]>(`${this.base}/exam/${examSubjectEntryId}/students`, params);
  }

  // Mark entry — Mode B: by student
  getSubjectsForStudent(studentId: string, examConfigId: number): Observable<StudentExamSubject[]> {
    return this.http.get<StudentExamSubject[]>(`${this.base}/student/${studentId}/exam/${examConfigId}`);
  }

  // Bulk save / update
  saveBulkMarks(entries: MarkEntryRequest[]): Observable<MarkBulkResult> {
    return this.http.post<MarkBulkResult>(`${this.base}/bulk`, entries);
  }

  // Student results view
  getStudentResults(studentId: string, session: string): Observable<ExamResult[]> {
    const params = new HttpParams().set('session', session);
    return this.http.get<ExamResult[]>(`${this.base}/student/${studentId}/results`, { params });
  }

  // Class-wide results view (teacher / admin)
  getClassResults(className: string, examConfigId: number, sectionId?: number | null): Observable<ClassStudentResult[]> {
    const params = sectionId != null ? { params: { sectionId: String(sectionId) } } : {};
    return this.http.get<ClassStudentResult[]>(`${this.base}/class/${className}/exam/${examConfigId}`, params);
  }
}
