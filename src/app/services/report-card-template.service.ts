import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

// ── Section ──────────────────────────────────────────────────────────────────

export type SectionType =
  | 'SCHOOL_HEADER'
  | 'STUDENT_INFO'
  | 'MARKS_TABLE'
  | 'ASSESSMENT_SUMMARY'
  | 'ATTENDANCE'
  | 'CO_SCHOLASTIC'
  | 'TEACHER_REMARKS'
  | 'PRINCIPAL_REMARKS'
  | 'PROMOTION_STATUS'
  | 'SIGNATURES';

export interface TemplateSection {
  id?: number;
  sectionType: SectionType;
  enabled: boolean;
  displayOrder: number;
  configJson?: string;
}

// ── Template ──────────────────────────────────────────────────────────────────

export interface ReportCardTemplate {
  id: number;
  schoolId: number;
  name: string;
  description?: string;
  assessmentGroupId: number;
  assessmentGroupName: string;
  gradingOverride?: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  sections: TemplateSection[];
  brandingJson?: string;  // JSON-serialised BrandingConfig
}

// ── Branding ──────────────────────────────────────────────────────────────────

export interface BrandingConfig {
  schoolMotto?: string;        // shown in header
  examTerm?: string;           // e.g., "Half-Yearly" → shown as "Half-Yearly Examination"
  showCgpa?: boolean;          // default true
  showGradePoints?: boolean;
  footerText?: string;
  showWatermark?: boolean;
  watermarkType?: 'TEXT' | 'LOGO';
  watermarkText?: string;
}

// ── Publishing ────────────────────────────────────────────────────────────────

export interface ReportCardPublication {
  id?: number;
  templateId: number;
  templateName?: string;
  session: string;
  className: string;
  published: boolean;
  publishedAt?: string;
  publishedBy?: string;
  emailSentAt?: string;
  emailCount?: number;
}

export interface PublishRequest {
  templateId: number;
  session: string;
  className: string;
}

// ── Class Performance Overview (Phase 7) ──────────────────────────────────────

export interface StudentSummaryDTO {
  studentId: string;
  studentName: string;
  percentage: number;
  grade: string;
  rank: number;
  passed: boolean;
}

export interface ClassOverviewDTO {
  className: string;
  session: string;
  templateName: string;
  totalStudents: number;
  passCount: number;
  failCount: number;
  classAverage: number;
  gradeDistribution: Record<string, number>;
  students: StudentSummaryDTO[];
}

export interface ReportCardTemplateRequest {
  name: string;
  description?: string;
  assessmentGroupId: number;
  gradingOverride?: string;
  isDefault?: boolean;
  brandingJson?: string;  // JSON-serialised BrandingConfig
}

export interface SectionUpdateRequest {
  sections: {
    sectionType: SectionType;
    enabled: boolean;
    displayOrder: number;
    configJson?: string;
  }[];
}

// ── Report Card Data ──────────────────────────────────────────────────────────

export interface SubjectExamMark {
  obtained: number | null;  // null = absent
  max: number;
  percentage: number;
}

export interface ExamColumn {
  examId: number;
  examName: string;
  maxTotal: number;
  weightage: number;
}

export interface SubjectRow {
  subjectName: string;
  examMarks: (SubjectExamMark | null)[];  // null if subject not in that exam column
  weightedPercentage: number;
  /** Subject grade from the backend GradingPolicy — never computed here. */
  grade?: string | null;
}

export interface ExamTotal {
  obtained: number;
  max: number;
}

export interface MarksTable {
  examColumns: ExamColumn[];
  subjectRows: SubjectRow[];
  examTotals: ExamTotal[];
}

export interface ExamBreakdown {
  examId: number;
  examName: string;
  obtained: number;
  max: number;
  percentage: number;
  weightage: number;
  contribution: number;
}

export interface GroupBreakdown {
  groupId: number;
  groupName: string;
  percentage: number;
  weightage: number;
  contribution: number;
}

export interface SubjectWeightedResult {
  subjectName: string;
  weightedPercentage: number;
}

export interface WeightedGroupResult {
  groupId: number;
  groupName: string;
  groupType: 'EXAM_BASED' | 'GROUP_BASED';
  weightedPercentage: number;
  subjectResults: SubjectWeightedResult[];
  examBreakdowns?: ExamBreakdown[];
  groupBreakdowns?: GroupBreakdown[];
  marksTable?: MarksTable;
  rank: number;
}

export interface AttendanceBlock {
  workingDays: number;
  presentDays: number;
  percentage: number;
}

export interface CoScholasticGrade {
  activity: string;
  grade: string | null;
}

// Remarks + co-scholastic batch types

export interface StudentRemarkItem {
  studentId: string;
  teacherRemark?: string;
  principalRemark?: string;
}

export interface RemarksRequest {
  templateId: number;
  session: string;
  studentRemarks: StudentRemarkItem[];
}

export interface ActivityGrade {
  activity: string;
  grade: string;
}

export interface StudentCoScholasticItem {
  studentId: string;
  entries: ActivityGrade[];
}

export interface CoScholasticRequest {
  templateId: number;
  session: string;
  studentEntries: StudentCoScholasticItem[];
}

export interface StudentRemarksData {
  studentId: string;
  studentName: string;
  teacherRemark: string | null;
  principalRemark: string | null;
  coScholasticEntries: ActivityGrade[];
}

export interface ClassRemarksData {
  students: StudentRemarksData[];
}

export interface ReportCardData {
  studentId: string;
  studentName: string;
  // CBSE compliance (Phase 5)
  overallGrade?: string;
  cgpa?: number | null;
  className: string;
  sectionName?: string;
  rollNumber?: string;
  session: string;
  fatherName?: string;
  motherName?: string;
  dateOfBirth?: string;
  photoUrl?: string;
  schoolName: string;
  schoolLogoUrl?: string;
  schoolAddress?: string;
  schoolPhone?: string;
  schoolEmail?: string;
  affiliationNumber?: string;
  schoolCode?: string;
  schoolCity?: string;
  boardType?: string;
  reportCardHeaderImageUrl?: string;
  template: ReportCardTemplate;
  gradingSystem: string;
  weightedResult: WeightedGroupResult;
  attendance?: AttendanceBlock;
  teacherRemarks?: string;
  principalRemarks?: string;
  coScholasticGrades?: CoScholasticGrade[];
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class ReportCardTemplateService {

  private readonly base = `${environment.apiUrl}/report-card-templates`;
  private readonly rcBase = `${environment.apiUrl}/report-cards`;

  constructor(private http: HttpClient) {}

  // Template CRUD

  getTemplates(): Observable<ReportCardTemplate[]> {
    return this.http.get<ReportCardTemplate[]>(this.base, { withCredentials: true });
  }

  getTemplate(id: number): Observable<ReportCardTemplate> {
    return this.http.get<ReportCardTemplate>(`${this.base}/${id}`, { withCredentials: true });
  }

  createTemplate(req: ReportCardTemplateRequest): Observable<ReportCardTemplate> {
    return this.http.post<ReportCardTemplate>(this.base, req, { withCredentials: true });
  }

  updateTemplate(id: number, req: ReportCardTemplateRequest): Observable<ReportCardTemplate> {
    return this.http.put<ReportCardTemplate>(`${this.base}/${id}`, req, { withCredentials: true });
  }

  deleteTemplate(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`, { withCredentials: true });
  }

  updateSections(id: number, req: SectionUpdateRequest): Observable<ReportCardTemplate> {
    return this.http.put<ReportCardTemplate>(`${this.base}/${id}/sections`, req, { withCredentials: true });
  }

  // Report Card Data

  getReportCard(studentId: string, templateId: number, session: string): Observable<ReportCardData> {
    return this.http.get<ReportCardData>(this.rcBase, {
      params: { studentId, templateId: templateId.toString(), session },
      withCredentials: true
    });
  }

  // Remarks + Co-Scholastic

  getClassRemarks(templateId: number, session: string, className: string): Observable<ClassRemarksData> {
    return this.http.get<ClassRemarksData>(`${this.rcBase}/remarks`, {
      params: { templateId: templateId.toString(), session, className },
      withCredentials: true
    });
  }

  saveRemarks(req: RemarksRequest): Observable<void> {
    return this.http.put<void>(`${this.rcBase}/remarks`, req, { withCredentials: true });
  }

  saveCoScholastic(req: CoScholasticRequest): Observable<void> {
    return this.http.put<void>(`${this.rcBase}/co-scholastic`, req, { withCredentials: true });
  }

  // ── Publishing ──────────────────────────────────────────────────────────────

  getPublishStatus(templateId: number, session: string, className: string): Observable<ReportCardPublication> {
    return this.http.get<ReportCardPublication>(`${this.rcBase}/publish`, {
      params: { templateId: templateId.toString(), session, className },
      withCredentials: true
    });
  }

  publish(req: PublishRequest): Observable<ReportCardPublication> {
    return this.http.post<ReportCardPublication>(`${this.rcBase}/publish`, req,
      { withCredentials: true });
  }

  unpublish(templateId: number, session: string, className: string): Observable<void> {
    return this.http.delete<void>(`${this.rcBase}/publish`, {
      params: { templateId: templateId.toString(), session, className },
      withCredentials: true
    });
  }

  emailBlast(req: PublishRequest): Observable<{ initiated: number; message: string }> {
    return this.http.post<{ initiated: number; message: string }>(
      `${this.rcBase}/email-blast`, req, { withCredentials: true });
  }

  // Class Performance Overview (Phase 7)

  getClassOverview(templateId: number, session: string, className: string): Observable<ClassOverviewDTO> {
    return this.http.get<ClassOverviewDTO>(`${this.rcBase}/class-overview`, {
      params: { templateId: templateId.toString(), session, className },
      withCredentials: true
    });
  }

  // PDF Download

  downloadPdf(studentId: string, templateId: number, session: string): Observable<Blob> {
    return this.http.get(`${this.rcBase}/pdf`, {
      params: { studentId, templateId: templateId.toString(), session },
      responseType: 'blob',
      withCredentials: true
    });
  }

  downloadBulkPdf(templateId: number, session: string, className: string): Observable<Blob> {
    return this.http.get(`${this.rcBase}/pdf/bulk`, {
      params: { templateId: templateId.toString(), session, className },
      responseType: 'blob',
      withCredentials: true
    });
  }
}
