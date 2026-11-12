import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Subject, takeUntil } from 'rxjs';
import { CoordinatorService } from '../../services/coordinator.service';
import { ReportCardV2Service, Summary, SummaryRow } from '../../services/report-card-v2.service';
import { ReportCardPdfDeliveryService } from '../../services/report-card-pdf-delivery.service';
import { ToastService } from '../../services/toast.service';
import { CoordinatorReportCardProgress, ReportCardCorrectionRequest, coordinatorUnitLabel } from '../../interfaces/coordinator';
import { apiMessage } from '../academic-session-selector/academic-session-selector.component';

/**
 * Report card review for the Principal (whole school) and an Academic Coordinator (their scope): completion per class section, each student's marks,
 * attendance-ready status and remarks, live previews, and correction requests to the responsible
 * class teacher. A request is not an approval: approval and publication stay with their owners.
 */
@Component({
  selector: 'app-coordinator-report-cards',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './coordinator-report-cards.component.html',
  styleUrl: './coordinator-report-cards.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CoordinatorReportCardsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  progress: CoordinatorReportCardProgress[] = [];
  loading = true;
  loadError: string | null = null;
  filter: 'all' | 'pending' | 'complete' = 'all';
  setupFilter = 0;          // setup id; 0 = every examination / term
  classFilter = '';         // class name; '' = every class
  sectionFilter = 0;        // section id; 0 = every section
  readonly skeletons = [1, 2, 3, 4, 5, 6];

  selected: CoordinatorReportCardProgress | null = null;
  summary: Summary | null = null;
  summaryLoading = false;
  summaryError: string | null = null;
  requests: ReportCardCorrectionRequest[] = [];

  /** Correction request being written: for the whole section (studentId null) or one student. */
  requestFor: { studentId: string | null; studentName: string | null } | null = null;
  reason = '';
  sending = false;
  previewing: string | null = null;

  readonly unitLabel = coordinatorUnitLabel;

  constructor(
    private coordinators: CoordinatorService,
    private cards: ReportCardV2Service,
    private pdf: ReportCardPdfDeliveryService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void { this.load(); }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(): void {
    this.loading = true;
    this.coordinators.reportCards().pipe(takeUntil(this.destroy$)).subscribe({
      next: rows => {
        this.progress = rows;
        this.loading = false;
        this.loadError = null;
        this.cdr.markForCheck();
      },
      error: err => {
        this.loading = false;
        this.loadError = err?.status === 403 ? 'Report card review is not available for your account.' : apiMessage(err);
        this.cdr.markForCheck();
      }
    });
  }

  isComplete(r: CoordinatorReportCardProgress): boolean {
    return r.students > 0 && r.complete === r.students && r.missingTeacherRemarks === 0;
  }

  get visible(): CoordinatorReportCardProgress[] {
    return this.progress.filter(r =>
      (this.filter === 'all' || (this.filter === 'complete') === this.isComplete(r))
      && (!this.setupFilter || r.setupId === this.setupFilter)
      && (!this.classFilter || r.className === this.classFilter)
      && (!this.sectionFilter || r.sectionId === this.sectionFilter));
  }

  /** Filter choices come from what the reviewer can actually see. */
  get setups(): { id: number; name: string }[] {
    const seen = new Map<number, string>();
    this.progress.forEach(r => seen.set(r.setupId, r.setupName));
    return [...seen].map(([id, name]) => ({ id, name }));
  }

  get classNames(): string[] {
    return [...new Set(this.progress.filter(r => !this.setupFilter || r.setupId === this.setupFilter).map(r => r.className))];
  }

  get sectionOptions(): { id: number; name: string }[] {
    const seen = new Map<number, string>();
    this.progress.filter(r => (!this.classFilter || r.className === this.classFilter) && r.sectionId != null)
      .forEach(r => seen.set(r.sectionId!, r.sectionName ?? ''));
    return [...seen].map(([id, name]) => ({ id, name }));
  }

  onClassChange(): void { this.sectionFilter = 0; }

  get filtersActive(): boolean { return !!(this.setupFilter || this.classFilter || this.sectionFilter || this.filter !== 'all'); }

  clearFilters(): void { this.setupFilter = 0; this.classFilter = ''; this.sectionFilter = 0; this.filter = 'all'; }

  /** Totals across the filtered sections, for the summary tiles. */
  get totals(): { sections: number; complete: number; pending: number; students: number; ready: number; corrections: number } {
    const rows = this.visible;
    return {
      sections: rows.length,
      complete: rows.filter(r => this.isComplete(r)).length,
      pending: rows.filter(r => !this.isComplete(r)).length,
      students: rows.reduce((n, r) => n + r.students, 0),
      ready: rows.reduce((n, r) => n + r.complete, 0),
      corrections: rows.reduce((n, r) => n + r.correctionRequests, 0),
    };
  }

  get detailTotals(): { missingMarks: number; noRemark: number; noResult: number } | null {
    const rows = this.summary?.students;
    if (!rows) return null;
    return {
      missingMarks: rows.filter(s => s.marksMissing > 0).length,
      noRemark: rows.filter(s => !s.hasTeacherRemark).length,
      noResult: rows.filter(s => s.status === 'NO_RESULT').length,
    };
  }

  initials(name: string): string {
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }

  /** Sections per status under the other filters, for the status switch. */
  statusCount(status: 'all' | 'pending' | 'complete'): number {
    return this.progress.filter(r =>
      (status === 'all' || (status === 'complete') === this.isComplete(r))
      && (!this.setupFilter || r.setupId === this.setupFilter)
      && (!this.classFilter || r.className === this.classFilter)
      && (!this.sectionFilter || r.sectionId === this.sectionFilter)).length;
  }

  /** Share of students whose report card is ready, across the filtered sections. */
  get readyPercent(): number {
    const t = this.totals;
    return t.students ? Math.round((t.ready / t.students) * 100) : 0;
  }

  /** Short class-and-section mark for a section card, e.g. "7A". */
  monogram(r: CoordinatorReportCardProgress): string {
    return `${r.className}${r.sectionName ?? ''}`.slice(0, 4);
  }

  get completeCount(): number { return this.progress.filter(r => this.isComplete(r)).length; }

  percent(r: CoordinatorReportCardProgress): number {
    return r.students ? Math.round((r.complete / r.students) * 100) : 0;
  }

  open(r: CoordinatorReportCardProgress): void {
    this.selected = r;
    this.summary = null;
    this.requests = [];
    this.requestFor = null;
    this.summaryLoading = true;
    this.summaryError = null;
    this.cards.getSummary(r.setupId, r.sectionId).pipe(takeUntil(this.destroy$)).subscribe({
      next: s => {
        this.summary = s;
        this.summaryLoading = false;
        this.cdr.markForCheck();
      },
      error: err => {
        this.summaryLoading = false;
        this.summaryError = apiMessage(err);
        this.cdr.markForCheck();
      }
    });
    this.loadRequests();
  }

  close(): void {
    this.selected = null;
    this.summary = null;
  }

  private loadRequests(): void {
    const r = this.selected;
    if (!r) return;
    this.coordinators.corrections(r.setupId, r.sectionId).pipe(takeUntil(this.destroy$)).subscribe({
      next: list => { this.requests = list; this.cdr.markForCheck(); },
      error: () => { this.requests = []; this.cdr.markForCheck(); }
    });
  }

  /** What is missing for one student, in words. */
  problems(s: SummaryRow): string[] {
    const out: string[] = [];
    if (s.marksMissing > 0) out.push(`${s.marksMissing} mark${s.marksMissing === 1 ? '' : 's'} missing`);
    if (s.status === 'NO_RESULT') out.push('no result yet');
    if (!s.hasTeacherRemark) out.push('no teacher remark');
    if (!s.coScholasticComplete) out.push('co-scholastic grades incomplete');
    return out;
  }

  preview(s: SummaryRow): void {
    const r = this.selected;
    if (!r || this.previewing) return;
    this.previewing = s.studentId;
    this.cards.previewPdf(r.setupId, s.studentId).pipe(takeUntil(this.destroy$)).subscribe({
      next: async blob => {
        this.previewing = null;
        this.cdr.markForCheck();
        await this.pdf.open(blob, `${s.studentName.replace(/[^A-Za-z0-9]+/g, '_')}_Preview.pdf`);
      },
      error: err => {
        this.previewing = null;
        this.toast.error('Preview unavailable', apiMessage(err));
        this.cdr.markForCheck();
      }
    });
  }

  ask(studentId: string | null, studentName: string | null): void {
    this.requestFor = { studentId, studentName };
    this.reason = '';
  }

  send(): void {
    const r = this.selected;
    const target = this.requestFor;
    const reason = this.reason.trim();
    if (!r || !target || !reason || this.sending) return;
    this.sending = true;
    this.coordinators.requestCorrection(r.setupId, r.sectionId, reason, target.studentId).pipe(takeUntil(this.destroy$)).subscribe({
      next: req => {
        this.sending = false;
        this.requestFor = null;
        this.toast.success('Correction requested', `${req.teacherName ?? req.teacherId} has been notified.`);
        r.correctionRequests += 1;
        this.loadRequests();
        this.cdr.markForCheck();
      },
      error: err => {
        this.sending = false;
        this.toast.error('Could not send the request', apiMessage(err));
        this.cdr.markForCheck();
      }
    });
  }

  approvalLabel(status: string): string {
    switch (status) {
      case 'NOT_REQUIRED': return 'No approval step';
      case 'PENDING_TEACHER': return 'Awaiting class teacher';
      case 'TEACHER_APPROVED': return 'Awaiting Principal';
      case 'PRINCIPAL_APPROVED': return 'Approved by Principal';
      case 'RETURNED': return 'Returned for correction';
      case 'STALE': return 'Changed since review';
      default: return status;
    }
  }
}
