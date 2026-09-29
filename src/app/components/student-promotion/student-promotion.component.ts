import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin, Subject, takeUntil } from 'rxjs';
import {
  StudentService, PromotionAction, PromotionCandidate, PromotionDecisionPayload,
  PromotionExecuteRequest, PromotionPreviewDTO, PromotionResultDTO, PromotionStudentOutcome
} from '../../services/student.service';
import { AcademicSessionService, SessionReadiness } from '../../services/academic-session.service';
import { AcademicSession } from '../../interfaces/academic-session';
import { SchoolService, SchoolClass } from '../../services/school.service';
import { SectionService } from '../../services/section.service';
import { Section } from '../../interfaces/section';
import { LoggerService } from '../../services/logger.service';
import { ToastService } from '../../services/toast.service';

/** 'NONE' is the explicit "no decision" state — distinct from every real PromotionAction so
 *  an unselected student is never confused with, or silently treated as, DETAIN. */
type RowDecision = PromotionAction | 'NONE';

interface CandidateGroup {
  classId: number | null;
  className: string;
  candidates: PromotionCandidate[];
}

/** Per-class decision summary (display only). */
export interface GroupSummary {
  total: number;
  promote: number;
  detain: number;
  passOut: number;
  transfer: number;
  pending: number;
  undecided: number;
  alreadyRecorded: number;
  blocked: number;
  /** Students with a decision (chosen now or already recorded), explicit "Keep pending" excluded. */
  decided: number;
}

/** Transfer is the year-end leaving decision (withdrawals use the Student Details exit). */
const EXIT_ACTIONS: PromotionAction[] = ['TRANSFER'];
/** Decisions offered on every open row, alongside the backend's year-end options. */
const EXTRA_ACTIONS: PromotionAction[] = ['TRANSFER', 'PENDING'];

@Component({
  selector: 'app-student-promotion',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './student-promotion.component.html',
  styleUrl: './student-promotion.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudentPromotionComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  // ── Sessions ──────────────────────────────────────────────────────────
  sessionsLoading = true;
  sessions: AcademicSession[] = [];
  sourceSessionId: number | null = null;
  targetSessionId: number | null = null;

  // ── Filters ───────────────────────────────────────────────────────────
  classes: SchoolClass[] = [];
  classFilter: number | null = null;
  studentIdFilter = '';

  // ── Preview ───────────────────────────────────────────────────────────
  previewLoading = false;
  preview: PromotionPreviewDTO | null = null;
  /** The exact session/filter combination the currently-loaded preview was fetched with —
   *  compared against the live selectors so any change is caught before execute. */
  private previewedSourceSessionId: number | null = null;
  private previewedTargetSessionId: number | null = null;
  private previewedClassFilter: number | null = null;
  private previewedStudentIdFilter = '';

  // ── Decisions (per studentId) ────────────────────────────────────────
  decisions = new Map<string, RowDecision>();
  /** Chosen target section per studentId — only populated when the row actually needs one
   *  (PROMOTE into a sectioned class, or a DETAIN replacement for an invalid source section). */
  targetSections = new Map<string, number>();
  /** TRANSFER reason per studentId (the effective date is always the source session end). */
  exitReasons = new Map<string, string>();
  /** Bulk "promote into section" choice per source class group. */
  bulkSections = new Map<string, number | null>();

  // ── Section option cache, keyed by classId ───────────────────────────
  sectionOptions = new Map<number, Section[]>();
  private sectionsLoading = new Set<number>();

  // ── Execute / results ─────────────────────────────────────────────────
  executing = false;
  result: PromotionResultDTO | null = null;
  /** Students left with no decision when the last batch was submitted (not sent, not "pending"). */
  resultUndecided = 0;

  // ── Session readiness (target session) ────────────────────────────────
  readiness: SessionReadiness | null = null;
  readinessLoading = false;

  constructor(
    private studentService: StudentService,
    private academicSessionService: AcademicSessionService,
    private schoolService: SchoolService,
    private sectionService: SectionService,
    private logger: LoggerService,
    private cdr: ChangeDetectorRef,
    private toast: ToastService,
  ) {}

  ngOnInit(): void {
    this.loadSessionsAndClasses();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Session + class loading ───────────────────────────────────────────

  loadSessionsAndClasses(): void {
    this.sessionsLoading = true;
    this.cdr.markForCheck();
    forkJoin({
      sessions: this.academicSessionService.getAllSessions(),
      classes: this.schoolService.getManagedClasses(),
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: ({ sessions, classes }) => {
        this.sessions = sessions;
        this.classes = [...classes].sort((a, b) => a.displayOrder - b.displayOrder);
        this.applySessionDefaults();
        this.sessionsLoading = false;
        this.cdr.markForCheck();
      },
      error: (e) => {
        this.logger.error('Error loading academic sessions:', e);
        this.sessionsLoading = false;
        this.toast.error('Error', 'Failed to load academic sessions.');
        this.cdr.markForCheck();
      }
    });
  }

  /** Sensible, safe defaults only — never creates a session. Source defaults to the
   *  configured current session; target defaults to whichever existing session starts the
   *  day the source ends, if one exists. Either can be left unset for the admin to pick. */
  private applySessionDefaults(): void {
    const current = this.sessions.find(s => s.current) ?? null;
    if (!current) return;
    this.sourceSessionId = current.id;
    const nextDay = this.addDays(current.endDate, 1);
    const next = this.sessions.find(s => s.startDate === nextDay);
    this.targetSessionId = next ? next.id : null;
  }

  private addDays(isoDate: string, days: number): string {
    const d = new Date(isoDate + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  sessionLabel(id: number | null): string {
    if (id == null) return '';
    return this.sessions.find(s => s.id === id)?.label ?? '';
  }

  /** Labels for the session pair the CURRENTLY LOADED preview belongs to (never the live,
   *  possibly-since-changed selector values) — used in messaging shown alongside preview rows
   *  and results, which must describe what was actually previewed/executed. */
  get previewedSourceLabel(): string { return this.sessionLabel(this.previewedSourceSessionId); }
  get previewedTargetLabel(): string { return this.sessionLabel(this.previewedTargetSessionId); }
  /** Exposes the previewed target session id to the template (e.g. the "Generate fees for…"
   *  link) without making the underlying staleness-tracking field itself public. */
  get previewedTargetSessionIdForLink(): number | null { return this.previewedTargetSessionId; }

  // ── Selector change handlers — any change invalidates the loaded preview ────

  onSourceSessionChange(): void {
    this.invalidatePreview();
  }
  onTargetSessionChange(): void {
    this.invalidatePreview();
  }
  onClassFilterChange(): void {
    this.invalidatePreview();
  }
  onStudentIdFilterChange(): void {
    this.invalidatePreview();
  }

  private invalidatePreview(): void {
    if (!this.preview && !this.result) return;
    this.preview = null;
    this.result = null;
    this.decisions.clear();
    this.targetSections.clear();
    this.exitReasons.clear();
    this.bulkSections.clear();
    this.readiness = null;
    this.cdr.markForCheck();
  }

  get sessionsSelected(): boolean {
    return this.sourceSessionId != null && this.targetSessionId != null;
  }

  /** True once the live selectors/filters have drifted from what the loaded preview reflects —
   *  the execute action must never fire against a preview that no longer matches the screen. */
  get previewIsStale(): boolean {
    if (!this.preview) return true;
    return this.previewedSourceSessionId !== this.sourceSessionId
      || this.previewedTargetSessionId !== this.targetSessionId
      || this.previewedClassFilter !== this.classFilter
      || this.previewedStudentIdFilter !== this.studentIdFilter.trim();
  }

  // ── Preview loading ────────────────────────────────────────────────────

  loadPreview(): void {
    if (!this.sessionsSelected || this.sourceSessionId === this.targetSessionId) return;
    this.previewLoading = true;
    // Deliberately does NOT clear `result` here: doExecute() reloads the preview immediately
    // after a successful execute to reflect authoritative backend state, and the just-shown
    // per-student outcomes must survive that reload rather than vanishing the instant it
    // completes. Only an explicit session/filter change (invalidatePreview) or the admin
    // dismissing it (dismissResult) should clear a shown result.
    this.cdr.markForCheck();

    const source = this.sourceSessionId!;
    const target = this.targetSessionId!;
    const classFilter = this.classFilter;
    const studentIdFilter = this.studentIdFilter.trim();

    this.studentService.getPromotionPreview(source, target, classFilter, studentIdFilter || null)
      .pipe(takeUntil(this.destroy$)).subscribe({
        next: (preview) => {
          this.preview = preview;
          this.previewedSourceSessionId = source;
          this.previewedTargetSessionId = target;
          this.previewedClassFilter = classFilter;
          this.previewedStudentIdFilter = studentIdFilter;
          this.seedDefaultDecisions(preview);
          this.prefetchSectionsForPreview(preview);
          this.previewLoading = false;
          this.cdr.markForCheck();
        },
        error: (e) => {
          this.logger.error('Error loading promotion preview:', e);
          this.previewLoading = false;
          this.toast.error('Error', 'Failed to load the promotion preview.');
          this.cdr.markForCheck();
        }
      });
  }

  /** Pre-selects the backend's recommended decision as a convenience default for every
   *  candidate that's actually ready for one — never for a row with a blocking error or one
   *  that's already applied. The admin can still explicitly clear any preselection to "No
   *  decision" before executing. */
  private seedDefaultDecisions(preview: PromotionPreviewDTO): void {
    this.decisions.clear();
    this.targetSections.clear();
    this.exitReasons.clear();
    for (const c of preview.candidates) {
      // A Fail / Incomplete result is never pre-decided: the admin must choose explicitly.
      if (c.errors.length > 0 || c.appliedDecisionState !== 'NOT_APPLIED' || this.resultNeedsAttention(c)) {
        this.decisions.set(c.studentId, 'NONE');
        continue;
      }
      this.decisions.set(c.studentId, c.recommendedDecision);
      if (c.recommendedDecision === 'DETAIN' && c.proposedDetainTargetSectionId != null) {
        this.targetSections.set(c.studentId, c.proposedDetainTargetSectionId);
      }
      if (c.recommendedDecision === 'PROMOTE' && c.proposedPromoteTargetSectionId != null) {
        this.targetSections.set(c.studentId, c.proposedPromoteTargetSectionId);
      }
    }
  }

  private prefetchSectionsForPreview(preview: PromotionPreviewDTO): void {
    const classIds = new Set<number>();
    for (const c of preview.candidates) {
      if (c.promoteTargetClassId != null) classIds.add(c.promoteTargetClassId);
      if (c.detainTargetClassId != null) classIds.add(c.detainTargetClassId);
    }
    for (const classId of classIds) this.ensureSectionsLoaded(classId);
  }

  private ensureSectionsLoaded(classId: number): void {
    if (this.sectionOptions.has(classId) || this.sectionsLoading.has(classId)) return;
    this.sectionsLoading.add(classId);
    this.sectionService.getSectionsForClass(classId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (sections) => {
        this.sectionOptions.set(classId, sections);
        this.sectionsLoading.delete(classId);
        this.cdr.markForCheck();
      },
      error: (e) => {
        this.logger.error(`Error loading sections for class ${classId}:`, e);
        this.sectionsLoading.delete(classId);
        this.cdr.markForCheck();
      }
    });
  }

  sectionsFor(classId: number | null): Section[] {
    if (classId == null) return [];
    return this.sectionOptions.get(classId) ?? [];
  }

  // ── Grouping (display only — every candidate keeps its own authoritative IDs) ──

  get groups(): CandidateGroup[] {
    if (!this.preview) return [];
    const byClass = new Map<string, CandidateGroup>();
    for (const c of this.preview.candidates) {
      const key = `${c.sourceClassId ?? 'null'}|${c.sourceClassName ?? ''}`;
      let group = byClass.get(key);
      if (!group) {
        group = { classId: c.sourceClassId, className: c.sourceClassName ?? 'Unknown class', candidates: [] };
        byClass.set(key, group);
      }
      group.candidates.push(c);
    }
    return [...byClass.values()];
  }

  // ── Decision handling ─────────────────────────────────────────────────

  getDecision(studentId: string): RowDecision {
    return this.decisions.get(studentId) ?? 'NONE';
  }

  /** Every decision offered on an open row: the backend's year-end options plus Transfer,
   *  and Keep Pending ("Keep Pending" = reviewed, decide later; unlike "Choose decision…"). */
  actionsFor(candidate: PromotionCandidate): PromotionAction[] {
    return [...candidate.availableDecisions, ...EXTRA_ACTIONS.filter(a => !candidate.availableDecisions.includes(a))];
  }

  actionLabel(action: PromotionAction): string {
    return ({ PROMOTE: 'Promote', DETAIN: 'Repeat / Detain', PASS_OUT: 'Graduate / Pass Out', TRANSFER: 'Transfer',
      PENDING: 'Keep Pending' } as Record<PromotionAction, string>)[action];
  }

  isExit(decision: RowDecision): boolean {
    return EXIT_ACTIONS.includes(decision as PromotionAction);
  }

  /** Badge text for a decision that is already recorded ('ALREADY_APPLIED:<ACTION>'). */
  appliedLabel(state: string): string {
    if (state === 'CONFLICT') return 'Conflict';
    if (!state.startsWith('ALREADY_APPLIED')) return state;
    return ({ PROMOTE: 'Already promoted', DETAIN: 'Already repeating', PASS_OUT: 'Already passed out',
      TRANSFER: 'Transfer recorded', WITHDRAW: 'Withdrawn (Student Details)' } as Record<string, string>)[state.split(':')[1]] ?? 'Already recorded';
  }

  // ── Result context (read-only) ────────────────────────────────────────

  resultLabel(c: PromotionCandidate): string {
    const r = c.result?.result;
    return r === 'PASS' ? 'Pass' : r === 'FAIL' ? 'Fail' : r === 'INCOMPLETE' ? 'Incomplete' : r === 'NO_RESULT' ? 'No result' : '—';
  }

  resultSourceLabel(c: PromotionCandidate): string {
    switch (c.result?.reportCardStatus) {
      case 'PUBLISHED': return 'Report card published';
      case 'NOT_PUBLISHED': return 'Results published · report card not published';
      case 'RESULTS_NOT_PUBLISHED': return 'Results not published';
      case 'NO_SETUP': return 'No report card set up';
      default: return 'Result unavailable';
    }
  }

  resultNeedsAttention(c: PromotionCandidate): boolean {
    return c.result?.result === 'FAIL' || c.result?.result === 'INCOMPLETE';
  }

  // ── Transfer details ──────────────────────────────────────────────────

  /** A year-end Transfer always takes effect on the source session's last day. */
  get exitEffectiveDate(): string | null {
    return this.sessions.find(s => s.id === this.previewedSourceSessionId)?.endDate ?? null;
  }

  /** True once the source session has ended — the exit is then applied at once (as of its last day). */
  get sourceSessionEnded(): boolean {
    const end = this.exitEffectiveDate;
    if (!end) return false;
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return end <= iso;
  }

  getExitReason(studentId: string): string {
    return this.exitReasons.get(studentId) ?? '';
  }

  setExitReason(studentId: string, value: string): void {
    this.exitReasons.set(studentId, value);
  }

  // ── Bulk defaults (never submit anything) ─────────────────────────────

  private groupKey(g: CandidateGroup): string { return `${g.classId}`; }

  private openRows(g: CandidateGroup): PromotionCandidate[] {
    return g.candidates.filter(c => c.errors.length === 0 && c.appliedDecisionState === 'NOT_APPLIED');
  }

  /** Every undecided student who can be promoted gets PROMOTE (manual choices are kept). */
  promoteAllEligible(g: CandidateGroup): void {
    let changed = 0;
    for (const c of this.openRows(g)) {
      if (this.getDecision(c.studentId) === 'NONE' && c.availableDecisions.includes('PROMOTE')) {
        this.setDecision(c, 'PROMOTE');
        changed++;
      }
    }
    this.toast.info('Defaults applied', changed ? `${changed} student(s) set to Promote. Review before executing.`
      : 'No undecided students can be promoted.');
  }

  bulkSectionFor(g: CandidateGroup): number | null { return this.bulkSections.get(this.groupKey(g)) ?? null; }

  setBulkSection(g: CandidateGroup, sectionId: number | null): void {
    this.bulkSections.set(this.groupKey(g), sectionId);
    this.cdr.markForCheck();
  }

  /** The class promoted students of this group move into (one successor per class). */
  groupPromoteClassId(g: CandidateGroup): number | null {
    return g.candidates.find(c => c.promoteTargetClassId != null)?.promoteTargetClassId ?? null;
  }

  /** Puts every student marked Promote in this group into the chosen target section. */
  promoteAllIntoSection(g: CandidateGroup): void {
    const sectionId = this.bulkSectionFor(g);
    if (sectionId == null) return;
    let changed = 0;
    for (const c of this.openRows(g)) {
      if (this.getDecision(c.studentId) === 'PROMOTE' && c.promoteTargetSectionRequired) {
        this.targetSections.set(c.studentId, sectionId);
        changed++;
      }
    }
    this.cdr.markForCheck();
    this.toast.info('Section applied', `${changed} promoted student(s) placed in section ${this.sectionName(this.groupPromoteClassId(g), sectionId)}.`);
  }

  /** For students marked Promote, picks the target section with the same letter as now (A → A). */
  keepSameSectionLetter(g: CandidateGroup): void {
    let matched = 0, unmatched = 0;
    for (const c of this.openRows(g)) {
      if (this.getDecision(c.studentId) !== 'PROMOTE' || !c.promoteTargetSectionRequired) continue;
      const same = this.sectionsFor(c.promoteTargetClassId)
        .find(sec => (sec.name ?? '').trim().toLowerCase() === (c.sourceSectionName ?? '').trim().toLowerCase());
      if (same?.id != null) { this.targetSections.set(c.studentId, same.id); matched++; } else { unmatched++; }
    }
    this.cdr.markForCheck();
    this.toast.info('Sections matched', `${matched} student(s) kept their section letter` +
      (unmatched ? `; ${unmatched} need a section chosen (no matching letter).` : '.'));
  }

  /** Marks every still-undecided student in the group as Keep Pending. */
  keepRestPending(g: CandidateGroup): void {
    for (const c of this.openRows(g)) {
      if (this.getDecision(c.studentId) === 'NONE') this.setDecision(c, 'PENDING');
    }
  }

  private sectionName(classId: number | null, sectionId: number): string {
    return this.sectionsFor(classId).find(s => s.id === sectionId)?.name ?? '';
  }

  // ── Summaries ─────────────────────────────────────────────────────────

  summaryFor(candidates: PromotionCandidate[]): GroupSummary {
    const s: GroupSummary = { total: candidates.length, promote: 0, detain: 0, passOut: 0, transfer: 0,
      pending: 0, undecided: 0, alreadyRecorded: 0, blocked: 0, decided: 0 };
    for (const c of candidates) {
      if (c.appliedDecisionState !== 'NOT_APPLIED') { s.alreadyRecorded++; continue; }
      if (c.errors.length > 0) { s.blocked++; continue; }
      switch (this.getDecision(c.studentId)) {
        case 'PROMOTE': s.promote++; break;
        case 'DETAIN': s.detain++; break;
        case 'PASS_OUT': s.passOut++; break;
        case 'TRANSFER': s.transfer++; break;
        case 'PENDING': s.pending++; break;
        default: s.undecided++;
      }
    }
    s.decided = s.promote + s.detain + s.passOut + s.transfer + s.alreadyRecorded;
    return s;
  }

  get overallSummary(): GroupSummary {
    return this.summaryFor(this.preview?.candidates ?? []);
  }

  // ── Warnings shown before confirming ──────────────────────────────────

  /** Plain-text warnings for the confirmation step. They never override backend rules. */
  get preSubmitWarnings(): string[] {
    if (!this.preview) return [];
    const warnings: string[] = [];
    const candidates = this.preview.candidates;
    const name = (c: PromotionCandidate) => c.studentName || c.studentId;
    const list = (cs: PromotionCandidate[]) => cs.slice(0, 5).map(name).join(', ') + (cs.length > 5 ? ` and ${cs.length - 5} more` : '');

    const summary = this.overallSummary;
    if (summary.pending > 0) warnings.push(`${summary.pending} student(s) are kept pending — nothing changes for them yet.`);
    if (summary.undecided > 0) warnings.push(`${summary.undecided} student(s) have no decision and will be left unchanged.`);
    const failPromote = candidates.filter(c => this.getDecision(c.studentId) === 'PROMOTE' && c.result?.result === 'FAIL');
    if (failPromote.length) warnings.push(`${failPromote.length} student(s) with a Fail result are marked Promote: ${list(failPromote)}.`);
    const incompletePromote = candidates.filter(c => this.getDecision(c.studentId) === 'PROMOTE' && c.result?.result === 'INCOMPLETE');
    if (incompletePromote.length) warnings.push(`${incompletePromote.length} student(s) with an Incomplete result are marked Promote: ${list(incompletePromote)}.`);
    const missingSection = candidates.filter(c => this.getDecision(c.studentId) !== 'NONE' && this.rowNeedsSection(c));
    if (missingSection.length) warnings.push(`${missingSection.length} student(s) still need a target section and will not be submitted: ${list(missingSection)}.`);
    const badPassOut = candidates.filter(c => this.getDecision(c.studentId) === 'PASS_OUT' && !c.availableDecisions.includes('PASS_OUT'));
    if (badPassOut.length) warnings.push(`Pass Out is only allowed from the final class — ${list(badPassOut)} will not be submitted.`);
    const blocked = candidates.filter(c => this.getDecision(c.studentId) !== 'NONE' && c.errors.length > 0);
    if (blocked.length) warnings.push(`${blocked.length} student(s) have validation errors and will not be submitted: ${list(blocked)}.`);
    const exits = candidates.filter(c => this.rowIsReady(c) && this.isExit(this.getDecision(c.studentId)));
    if (exits.length) {
      warnings.push(this.sourceSessionEnded
        ? `${exits.length} Transfer decision(s) apply now, as of ${this.exitEffectiveDate}, and end parent access.`
        : `${exits.length} Transfer decision(s) take effect on ${this.exitEffectiveDate} — the students stay active (with parent access) until then.`);
    }
    return warnings;
  }

  setDecision(candidate: PromotionCandidate, decision: RowDecision): void {
    this.decisions.set(candidate.studentId, decision);
    if (!this.isExit(decision)) {
      this.exitReasons.delete(candidate.studentId);
    }
    if (decision !== 'PROMOTE' && decision !== 'DETAIN') {
      this.targetSections.delete(candidate.studentId);
    } else if (decision === 'DETAIN' && candidate.proposedDetainTargetSectionId != null) {
      this.targetSections.set(candidate.studentId, candidate.proposedDetainTargetSectionId);
    } else if (decision === 'PROMOTE' && candidate.proposedPromoteTargetSectionId != null) {
      this.targetSections.set(candidate.studentId, candidate.proposedPromoteTargetSectionId);
    } else {
      this.targetSections.delete(candidate.studentId);
    }
    this.cdr.markForCheck();
  }

  getTargetSection(studentId: string): number | null {
    return this.targetSections.get(studentId) ?? null;
  }

  setTargetSection(studentId: string, sectionId: number | ''): void {
    if (sectionId === '') this.targetSections.delete(studentId);
    else this.targetSections.set(studentId, Number(sectionId));
    this.cdr.markForCheck();
  }

  /** Whether this row still needs an explicit section pick before it can be submitted. */
  rowNeedsSection(candidate: PromotionCandidate): boolean {
    const decision = this.getDecision(candidate.studentId);
    if (decision === 'PROMOTE') {
      return candidate.promoteTargetSectionRequired && this.getTargetSection(candidate.studentId) == null;
    }
    if (decision === 'DETAIN') {
      if (candidate.proposedDetainTargetSectionId != null) return false;
      const detainClassId = candidate.detainTargetClassId ?? candidate.sourceClassId;
      const hasSections = detainClassId != null && this.sectionsFor(detainClassId).length > 0;
      return hasSections && this.getTargetSection(candidate.studentId) == null;
    }
    return false;
  }

  showSectionPicker(candidate: PromotionCandidate): boolean {
    const decision = this.getDecision(candidate.studentId);
    if (decision === 'PROMOTE') return candidate.promoteTargetSectionRequired;
    if (decision === 'DETAIN') {
      const detainClassId = candidate.detainTargetClassId ?? candidate.sourceClassId;
      return detainClassId != null && this.sectionsFor(detainClassId).length > 0;
    }
    return false;
  }

  sectionPickerClassId(candidate: PromotionCandidate): number | null {
    const decision = this.getDecision(candidate.studentId);
    if (decision === 'PROMOTE') return candidate.promoteTargetClassId;
    if (decision === 'DETAIN') return candidate.detainTargetClassId ?? candidate.sourceClassId;
    return null;
  }

  /** True only for a row the admin can actually submit right now: a real decision is chosen,
   *  the row carries no blocking error, and any required section has been picked. */
  rowIsReady(candidate: PromotionCandidate): boolean {
    const decision = this.getDecision(candidate.studentId);
    if (decision === 'NONE') return false;
    if (candidate.errors.length > 0) return false;
    if (candidate.appliedDecisionState !== 'NOT_APPLIED') return false;
    if (!this.actionsFor(candidate).includes(decision)) return false;
    return !this.rowNeedsSection(candidate);
  }

  get readyCandidates(): PromotionCandidate[] {
    if (!this.preview) return [];
    return this.preview.candidates.filter(c => this.rowIsReady(c));
  }

  get blockedSelectedCount(): number {
    if (!this.preview) return 0;
    return this.preview.candidates.filter(c => this.getDecision(c.studentId) !== 'NONE' && !this.rowIsReady(c)).length;
  }

  get promoteCount(): number { return this.readyCandidates.filter(c => this.getDecision(c.studentId) === 'PROMOTE').length; }
  get detainCount(): number { return this.readyCandidates.filter(c => this.getDecision(c.studentId) === 'DETAIN').length; }
  get passOutCount(): number { return this.readyCandidates.filter(c => this.getDecision(c.studentId) === 'PASS_OUT').length; }
  get transferCount(): number { return this.readyCandidates.filter(c => this.getDecision(c.studentId) === 'TRANSFER').length; }
  get pendingCount(): number { return this.readyCandidates.filter(c => this.getDecision(c.studentId) === 'PENDING').length; }
  get omittedCount(): number {
    if (!this.preview) return 0;
    return this.preview.candidates.length - this.readyCandidates.length;
  }

  get canExecute(): boolean {
    return !!this.preview && this.preview.valid && !this.previewIsStale && !this.executing
      && this.readyCandidates.length > 0;
  }

  // ── Confirmation + execute ────────────────────────────────────────────

  async confirmAndExecute(): Promise<void> {
    if (!this.canExecute) return;
    const promote = this.promoteCount, detain = this.detainCount, passOut = this.passOutCount;
    const transfer = this.transferCount, pending = this.pendingCount;
    const sourceLabel = this.escape(this.sessionLabel(this.previewedSourceSessionId));
    const targetLabel = this.escape(this.sessionLabel(this.previewedTargetSessionId));
    const warnings = this.preSubmitWarnings;
    const chip = (bg: string, fg: string, text: string) =>
      `<span style="background:${bg};color:${fg};padding:6px 14px;border-radius:20px;font-weight:700;">${text}</span>`;

    const confirmed = await this.toast.confirm({
      title: 'Confirm Year-End Decisions',
      html: `
        <p style="margin-bottom:12px;color:#374151;">
          This records year-end decisions from <strong>${sourceLabel}</strong> to <strong>${targetLabel}</strong>
          for <strong>${this.readyCandidates.length}</strong> student(s):
        </p>
        <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
          ${chip('#dcfce7', '#166534', `${promote} Promote`)}
          ${chip('#fef9c3', '#854d0e', `${detain} Repeat`)}
          ${chip('#dbeafe', '#1e40af', `${passOut} Pass Out`)}
          ${transfer ? chip('#fee2e2', '#991b1b', `${transfer} Transfer`) : ''}
          ${pending ? chip('#f1f5f9', '#475569', `${pending} Keep Pending`) : ''}
        </div>
        ${warnings.length ? `<div style="margin-top:14px;padding:10px 12px;border-radius:10px;background:#fffbeb;border:1px solid #fde68a;text-align:left;">
          <p style="margin:0 0 6px;font-weight:700;color:#92400e;">Please check before confirming:</p>
          <ul style="margin:0;padding-left:18px;color:#78350f;font-size:0.85rem;">${warnings.map(w => `<li>${this.escape(w)}</li>`).join('')}</ul>
        </div>` : ''}
        <p style="margin-top:14px;font-size:0.85rem;color:#334155;">
          Promote/Repeat to a future session doesn't change a student's current class until ${targetLabel} begins;
          a Pass Out graduates the student when ${sourceLabel} ends. The school's rules are re-checked for every student.
        </p>
      `,
      icon: 'warning',
      danger: passOut + transfer > 0 || warnings.length > 0,
      confirmText: 'Yes, Record Decisions',
      cancelText: 'Cancel',
    });
    if (confirmed) this.doExecute();
  }

  private escape(text: string): string {
    return text.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[ch]);
  }

  private doExecute(): void {
    if (!this.preview || this.previewedSourceSessionId == null || this.previewedTargetSessionId == null) return;
    this.executing = true;
    this.cdr.markForCheck();

    const decisions: PromotionDecisionPayload[] = this.readyCandidates.map((c) => {
      const action = this.getDecision(c.studentId) as PromotionAction;
      const payload: PromotionDecisionPayload = {
        studentId: c.studentId,
        action,
        expectedSourceEnrollmentId: c.sourceEnrollmentId,
        expectedSourceClassId: c.sourceClassId as number,
      };
      if (action === 'PROMOTE') {
        payload.targetClassId = c.promoteTargetClassId;
        payload.targetSectionId = c.promoteTargetSectionRequired ? this.getTargetSection(c.studentId) : null;
      } else if (action === 'DETAIN') {
        payload.targetClassId = c.detainTargetClassId;
        payload.targetSectionId = this.getTargetSection(c.studentId) ?? c.proposedDetainTargetSectionId ?? null;
      } else if (action === 'TRANSFER') {
        payload.targetClassId = null;
        payload.targetSectionId = null;
        payload.reason = this.getExitReason(c.studentId).trim() || null;
      } else {
        payload.targetClassId = null;
        payload.targetSectionId = null;
      }
      return payload;
    });

    const request: PromotionExecuteRequest = {
      sourceSessionId: this.previewedSourceSessionId,
      targetSessionId: this.previewedTargetSessionId,
      classId: this.previewedClassFilter,
      decisions,
    };
    const undecided = this.overallSummary.undecided;

    this.studentService.executePromotion(request).pipe(takeUntil(this.destroy$)).subscribe({
      next: (result) => {
        this.result = result;
        this.resultUndecided = undecided;
        this.executing = false;
        this.cdr.markForCheck();
        // Reflect authoritative backend state — never assume the UI's own optimistic view.
        this.loadPreview();
      },
      error: (e) => {
        this.logger.error('Error executing promotion:', e);
        this.executing = false;
        this.toast.error('Error', 'Recording year-end decisions failed. Please try again.');
        this.cdr.markForCheck();
      }
    });
  }

  // ── Result display helpers ────────────────────────────────────────────

  outcomeStudentName(outcome: PromotionStudentOutcome): string {
    return this.preview?.candidates.find(c => c.studentId === outcome.studentId)?.studentName ?? outcome.studentId;
  }

  isSuccessOutcome(code: string): boolean {
    return code === 'PROMOTED' || code === 'DETAINED' || code === 'PASSED_OUT' || code === 'TRANSFERRED';
  }

  isInfoOutcome(code: string): boolean {
    return code === 'ALREADY_APPLIED' || code === 'PENDING';
  }

  /** Applied / Already Applied / Conflict / Failed / Pending. */
  outcomeGroup(code: string): string {
    if (this.isSuccessOutcome(code)) return 'Applied';
    if (code === 'ALREADY_APPLIED') return 'Already Applied';
    if (code === 'CONFLICT') return 'Conflict';
    if (code === 'PENDING') return 'Pending';
    return 'Failed';
  }

  outcomeLabel(code: string): string {
    return ({ PROMOTED: 'Promoted', DETAINED: 'Repeating', PASSED_OUT: 'Pass Out', TRANSFERRED: 'Transferred',
      PENDING: 'Kept pending', ALREADY_APPLIED: 'Already applied', CONFLICT: 'Conflict',
      INVALID_SOURCE: 'Failed', VALIDATION_ERROR: 'Failed' } as Record<string, string>)[code] ?? code;
  }

  /** Counts per outcome group, in a fixed order. */
  outcomeGroups(): { label: string; count: number }[] {
    if (!this.result) return [];
    const order = ['Applied', 'Already Applied', 'Conflict', 'Failed', 'Pending'];
    const counts = new Map<string, number>();
    for (const o of this.result.outcomes) counts.set(this.outcomeGroup(o.code), (counts.get(this.outcomeGroup(o.code)) ?? 0) + 1);
    return order.filter(l => counts.has(l)).map(label => ({ label, count: counts.get(label)! }));
  }

  // ── Session readiness (warnings only; never blocks anything) ──────────

  loadReadiness(): void {
    const target = this.previewedTargetSessionId ?? this.targetSessionId;
    if (target == null || this.readinessLoading) return;
    this.readinessLoading = true;
    this.cdr.markForCheck();
    this.academicSessionService.getReadiness(target).pipe(takeUntil(this.destroy$)).subscribe({
      next: (r) => { this.readiness = r; this.readinessLoading = false; this.cdr.markForCheck(); },
      error: (e) => {
        this.logger.error('Error loading session readiness:', e);
        this.readinessLoading = false;
        this.toast.error('Error', 'Could not check session readiness.');
        this.cdr.markForCheck();
      }
    });
  }

  summaryEntries(): { code: string; count: number }[] {
    if (!this.result) return [];
    return Object.entries(this.result.summary).map(([code, count]) => ({ code, count }));
  }

  dismissResult(): void {
    this.result = null;
    this.cdr.markForCheck();
  }

  // ── trackBy ────────────────────────────────────────────────────────────
  trackByGroup(_: number, g: CandidateGroup): string { return `${g.classId}`; }
  trackByCandidate(_: number, c: PromotionCandidate): string { return c.studentId; }
  trackByOutcome(_: number, o: PromotionStudentOutcome): string { return o.studentId; }
  trackBySession(_: number, s: AcademicSession): number { return s.id; }
  trackByClass(_: number, c: SchoolClass): number { return c.id; }
}
