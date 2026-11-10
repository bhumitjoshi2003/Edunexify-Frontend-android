import { coordinatorClassNames, optionalCoordinatorService } from '../../services/coordinator.service';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, forkJoin, switchMap } from 'rxjs';
import { ToastService } from '../../services/toast.service';
import { ExamConfigService, ExamConfig, ExamSubjectEntry } from '../../services/exam-config.service';
import { SubjectConfigService, ClassSubject } from '../../services/subject-config.service';
import { LoggerService } from '../../services/logger.service';
import { AcademicSessionService } from '../../services/academic-session.service';
import { SchoolService } from '../../services/school.service';

/** One row in the subject checklist (class subject or extra). */
interface SubjectRow {
  subjectName: string;
  checked: boolean;
  maxMarks: number | null;
  examDate: string;
  isElective: boolean;
  optionalGroup: string | null;
  isExtra: boolean;          // true = user-added, not from class config
  existingEntryId?: number;  // set if this subject was already saved for this exam
}

@Component({
  selector: 'app-exam-config',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './exam-config.component.html',
  styleUrl: './exam-config.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExamConfigComponent implements OnInit, OnDestroy {
  /** Coordinators see only classes they cover in full; everyone else is unaffected. */
  private coordinators = optionalCoordinatorService();

  private destroy$ = new Subject<void>();

  classOptions: string[] = [];
  selectedClass = '';
  selectedSession = '';
  sessions: string[] = [];

  exams: ExamConfig[] = [];
  isLoadingExams = false;
  expandedExamId: number | null = null;

  // Per-exam subject setup state
  subjectRows: Record<number, SubjectRow[]> = {};
  defaultMaxMarks: Record<number, number> = {};
  savingExam: Record<number, boolean> = {};
  loadingSubjects: Record<number, boolean> = {};

  newExamName = '';

  // Cached class subjects to avoid re-fetching on every toggle
  private classSubjectsCache: Record<string, ClassSubject[]> = {};

  constructor(
    private examService: ExamConfigService,
    private subjectConfigService: SubjectConfigService,
    private academicSessionService: AcademicSessionService,
    private cdr: ChangeDetectorRef,
    private logger: LoggerService,
    private toast: ToastService,
    private schoolService: SchoolService
  ) { }

  ngOnInit(): void {
    this.academicSessionService.getAllSessions().pipe(takeUntil(this.destroy$)).subscribe({
      next: sessions => {
        this.sessions = sessions.map(s => s.label);
        const current = sessions.find(s => s.current);
        this.selectedSession = current ? current.label : (this.sessions[0] ?? '');
        this.cdr.markForCheck();
        if (this.selectedClass) this.loadExams();
      },
      error: (e) => this.logger.error('Failed to load sessions', e)
    });
    this.schoolService.getClasses().pipe(switchMap(c => coordinatorClassNames(this.coordinators, c)), takeUntil(this.destroy$)).subscribe({
      next: classes => {
        this.classOptions = classes;
        if (!this.selectedClass && classes.length > 0) {
          this.selectedClass = classes[0];
        }
        this.cdr.markForCheck();
        if (this.selectedSession) this.loadExams();
      },
      error: e => this.logger.error('Failed to load classes', e),
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadExams(): void {
    this.exams = [];
    this.expandedExamId = null;
    this.subjectRows = {};
    this.defaultMaxMarks = {};
    this.classSubjectsCache = {};
    this.isLoadingExams = true;
    this.cdr.markForCheck();
    this.examService.getExams(this.selectedSession, this.selectedClass)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.exams = data;
          this.isLoadingExams = false;
          this.cdr.markForCheck();
        },
        error: (e) => {
          this.logger.error('Error loading exams:', e);
          this.isLoadingExams = false;
          this.cdr.markForCheck();
          this.toast.error('Error', 'Failed to load exams.');
        },
      });
  }

  toggleExam(exam: ExamConfig): void {
    if (this.expandedExamId === exam.id) {
      this.expandedExamId = null;
      return;
    }
    this.expandedExamId = exam.id;
    if (!this.subjectRows[exam.id]) {
      this.loadSubjectSetup(exam);
    }
  }

  /** Load class subjects + existing exam subjects and merge into the checklist. */
  loadSubjectSetup(exam: ExamConfig): void {
    this.loadingSubjects[exam.id] = true;
    this.cdr.markForCheck();

    const classSubjects$ = this.classSubjectsCache[exam.className]
      ? new Subject<ClassSubject[]>() as any // will be replaced below
      : this.subjectConfigService.getClassSubjects(exam.className);

    // If cached, just use the cache
    if (this.classSubjectsCache[exam.className]) {
      this.mergeSubjectSetup(exam, this.classSubjectsCache[exam.className]);
      return;
    }

    forkJoin([
      this.subjectConfigService.getClassSubjects(exam.className),
      this.examService.getExamSubjects(exam.id)
    ]).pipe(takeUntil(this.destroy$)).subscribe({
      next: ([classSubjects, examEntries]) => {
        this.classSubjectsCache[exam.className] = classSubjects;
        this.mergeSubjectSetup(exam, classSubjects, examEntries);
      },
      error: (e) => {
        this.logger.error('Error loading subject setup:', e);
        this.loadingSubjects[exam.id] = false;
        this.cdr.markForCheck();
        this.toast.error('Error', 'Failed to load subjects.');
      },
    });
  }

  private mergeSubjectSetup(exam: ExamConfig, classSubjects: ClassSubject[], examEntries?: ExamSubjectEntry[]): void {
    // If examEntries not provided, fetch them
    if (!examEntries) {
      this.examService.getExamSubjects(exam.id).pipe(takeUntil(this.destroy$)).subscribe({
        next: (entries) => this.mergeSubjectSetup(exam, classSubjects, entries),
        error: (e) => {
          this.logger.error('Error loading exam subjects:', e);
          this.loadingSubjects[exam.id] = false;
          this.cdr.markForCheck();
        },
      });
      return;
    }

    const entryByName: Record<string, ExamSubjectEntry> = {};
    for (const e of examEntries) {
      entryByName[e.subjectName] = e;
    }

    const rows: SubjectRow[] = [];
    const classSubjectNames = new Set<string>();

    // Class subjects first
    for (const cs of classSubjects) {
      classSubjectNames.add(cs.subjectName);
      const existing = entryByName[cs.subjectName];
      rows.push({
        subjectName: cs.subjectName,
        checked: !!existing,
        maxMarks: existing?.maxMarks ?? null,
        examDate: existing?.examDate ?? '',
        isElective: cs.optional,
        optionalGroup: cs.optionalGroup,
        isExtra: false,
        existingEntryId: existing?.id,
      });
    }

    // Extra subjects (in exam but not in class config)
    for (const entry of examEntries) {
      if (!classSubjectNames.has(entry.subjectName)) {
        rows.push({
          subjectName: entry.subjectName,
          checked: true,
          maxMarks: entry.maxMarks,
          examDate: entry.examDate,
          isElective: false,
          optionalGroup: null,
          isExtra: true,
          existingEntryId: entry.id,
        });
      }
    }

    // Infer a sensible default maxMarks from existing entries
    const existingMarks = examEntries.map(e => e.maxMarks).filter(m => m > 0);
    if (!this.defaultMaxMarks[exam.id]) {
      this.defaultMaxMarks[exam.id] = existingMarks.length > 0
        ? existingMarks[0]
        : 80;
    }

    this.subjectRows[exam.id] = rows;
    this.loadingSubjects[exam.id] = false;
    this.cdr.markForCheck();
  }

  addExam(): void {
    const name = this.newExamName.trim();
    if (!name) return;
    this.examService.addExam(this.selectedSession, this.selectedClass, name)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (exam) => {
          this.exams = [...this.exams, exam];
          this.newExamName = '';
          this.cdr.markForCheck();
          // Auto-expand the new exam
          this.expandedExamId = exam.id;
          this.loadSubjectSetup(exam);
        },
        error: (e) => {
          this.logger.error('Error adding exam:', e);
          this.toast.error('Error', 'Could not add exam. It may already exist.');
        },
      });
  }

  deleteExam(id: number): void {
    this.toast.confirm({
      title: 'Delete exam?',
      message: 'All subject entries and marks for this exam will be deleted.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      danger: true,
    }).then((confirmed) => {
      if (!confirmed) return;
      this.examService.deleteExam(id).pipe(takeUntil(this.destroy$)).subscribe({
        next: () => {
          this.exams = this.exams.filter(e => e.id !== id);
          delete this.subjectRows[id];
          delete this.defaultMaxMarks[id];
          if (this.expandedExamId === id) this.expandedExamId = null;
          this.cdr.markForCheck();
        },
        error: (e) => {
          this.logger.error('Error deleting exam:', e);
          this.toast.error('Error', 'Could not delete exam.');
        },
      });
    });
  }

  /** Apply default max marks to all rows that don't have a value yet. */
  applyDefaultMarks(examId: number): void {
    const def = this.defaultMaxMarks[examId];
    if (!def || def <= 0) return;
    for (const row of this.subjectRows[examId] ?? []) {
      if (row.checked && !row.maxMarks) {
        row.maxMarks = def;
      }
    }
    this.cdr.markForCheck();
  }

  /** Toggle all class subjects on/off. */
  toggleAll(examId: number, checked: boolean): void {
    for (const row of this.subjectRows[examId] ?? []) {
      if (!row.isExtra) row.checked = checked;
    }
    this.cdr.markForCheck();
  }

  /** Add an empty extra subject row. */
  addExtraSubject(examId: number): void {
    const rows = this.subjectRows[examId];
    if (!rows) return;
    rows.push({
      subjectName: '',
      checked: true,
      maxMarks: this.defaultMaxMarks[examId] ?? null,
      examDate: '',
      isElective: false,
      optionalGroup: null,
      isExtra: true,
    });
    this.cdr.markForCheck();
  }

  removeExtraSubject(examId: number, index: number): void {
    const rows = this.subjectRows[examId];
    if (!rows) return;
    rows.splice(index, 1);
    this.cdr.markForCheck();
  }

  /** Save all checked subjects in one bulk call. */
  saveAllSubjects(examId: number): void {
    const rows = this.subjectRows[examId];
    if (!rows) return;

    const checked = rows.filter(r => r.checked);

    // Validate
    for (const r of checked) {
      if (!r.subjectName.trim()) {
        this.toast.warning('Incomplete', 'Each subject must have a name.');
        return;
      }
      // Issue #59: Max marks must be between 1 and 500
      if (!r.maxMarks || r.maxMarks <= 0 || r.maxMarks > 500) {
        this.toast.error('Invalid', `Maximum marks for "${r.subjectName}" must be between 1 and 500.`);
        return;
      }
      if (!r.examDate) {
        this.toast.warning('Incomplete', `Please set exam date for "${r.subjectName}".`);
        return;
      }
    }

    // Check for duplicate subject names
    const names = new Set<string>();
    for (const r of checked) {
      const name = r.subjectName.trim().toLowerCase();
      if (names.has(name)) {
        this.toast.warning('Duplicate', `Subject "${r.subjectName}" appears more than once.`);
        return;
      }
      names.add(name);
    }

    const payload = checked.map(r => ({
      subjectName: r.subjectName.trim(),
      maxMarks: r.maxMarks!,
      examDate: r.examDate,
    }));

    this.savingExam[examId] = true;
    this.cdr.markForCheck();

    this.examService.bulkSyncExamSubjects(examId, payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (saved) => {
          this.savingExam[examId] = false;
          // Refresh the rows with server-returned IDs
          const entryByName: Record<string, ExamSubjectEntry> = {};
          for (const e of saved) entryByName[e.subjectName] = e;
          for (const row of rows) {
            const entry = entryByName[row.subjectName];
            if (entry) row.existingEntryId = entry.id;
          }
          // Remove unchecked extra rows that had no existing entry
          this.subjectRows[examId] = rows.filter(r => r.checked || r.existingEntryId);
          this.cdr.markForCheck();
          this.toast.success('Saved', `${saved.length} subject(s) configured for this exam.`);
        },
        error: (e) => {
          this.savingExam[examId] = false;
          this.logger.error('Error saving exam subjects:', e);
          this.toast.error('Error', 'Failed to save exam subjects.');
          this.cdr.markForCheck();
        },
      });
  }

  get allClassChecked(): boolean {
    const rows = this.subjectRows[this.expandedExamId!];
    if (!rows) return false;
    const classRows = rows.filter(r => !r.isExtra);
    return classRows.length > 0 && classRows.every(r => r.checked);
  }

  getClassRows(examId: number): SubjectRow[] {
    return (this.subjectRows[examId] ?? []).filter(r => !r.isExtra);
  }

  getExtraRows(examId: number): SubjectRow[] {
    return (this.subjectRows[examId] ?? []).filter(r => r.isExtra);
  }

  getExtraRowIndex(examId: number, row: SubjectRow): number {
    return (this.subjectRows[examId] ?? []).indexOf(row);
  }

  trackById(index: number, item: { id: number }): number { return item.id; }
  trackByIndex(index: number): number { return index; }
  trackByName(index: number, row: SubjectRow): string { return row.subjectName + index; }
}
