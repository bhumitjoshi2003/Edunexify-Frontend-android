import { ChangeDetectionStrategy, ChangeDetectorRef, Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription, takeUntil, forkJoin } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { ToastService } from '../../services/toast.service';
import { ExamConfigService, ExamConfig, ExamSubjectEntry, isPublished } from '../../services/exam-config.service';
import { MarksService, MarkEntryStudent, StudentExamSubject, MarkEntryRequest, MarkError } from '../../services/marks.service';
import { AuthStateService } from '../../auth/auth-state.service';
import { TeacherService } from '../../services/teacher.service';
import { StudentService } from '../../services/student.service';
import { AcademicSessionService } from '../../services/academic-session.service';
import { LoggerService } from '../../services/logger.service';
import { SchoolService, SchoolClass } from '../../services/school.service';
import { SectionService } from '../../services/section.service';
import { Section } from '../../interfaces/section';

type LoadState = 'idle' | 'loading' | 'loaded' | 'error';

@Component({
  selector: 'app-mark-entry',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './mark-entry.component.html',
  styleUrl: './mark-entry.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarkEntryComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  mode: 'subject' | 'student' = 'subject';
  role = '';
  classOptions: string[] = [];
  sessions: string[] = [];

  selectedSession = '';
  selectedClass = '';
  exams: ExamConfig[] = [];
  selectedExamId: number | null = null;

  // Mode A — by subject
  examSubjects: ExamSubjectEntry[] = [];
  selectedSubjectEntryId: number | null = null;
  subjectStudents: MarkEntryStudent[] = [];
  marksInputA: Record<string, number | null> = {};
  originalMarksA: Record<string, number | null> = {};

  // Mode B — by student
  students: { studentId: string; name: string }[] = [];
  selectedStudentId = '';
  studentSubjects: StudentExamSubject[] = [];
  marksInputB: Record<number, number | null> = {};
  originalMarksB: Record<number, number | null> = {};

  saving = false;
  managedClasses: SchoolClass[] = [];
  sections: Section[] = [];
  selectedSectionId: number | null = null;
  private sectionMemory: Map<string, number | null> = new Map();

  /** Request state of each table, so "nothing found" is only shown after an empty, successful load. */
  subjectStudentsState: LoadState = 'idle';
  studentSubjectsState: LoadState = 'idle';
  studentsState: LoadState = 'idle';
  private subjectStudentsSub?: Subscription;
  private studentSubjectsSub?: Subscription;
  private studentsSub?: Subscription;
  readonly skeletonRows = [1, 2, 3, 4, 5];

  /** Per-row reasons from the last rejected save, keyed "studentId|examSubjectEntryId". Nothing was saved. */
  rowErrors: Record<string, string> = {};

  constructor(
    private examService: ExamConfigService,
    private marksService: MarksService,
    private authState: AuthStateService,
    private teacherService: TeacherService,
    private studentService: StudentService,
    private academicSessionService: AcademicSessionService,
    private cdr: ChangeDetectorRef,
    private logger: LoggerService,
    private toast: ToastService,
    private schoolService: SchoolService,
    private sectionService: SectionService
  ) { }

  ngOnInit(): void {
    const user = this.authState.getUser();
    this.role = user?.role ?? '';

    this.schoolService.getClasses().pipe(takeUntil(this.destroy$)).subscribe({
      next: classes => { this.classOptions = classes; this.cdr.markForCheck(); },
      error: (err) => this.logger.error('Failed to load classes', err)
    });
    this.schoolService.getManagedClasses().pipe(takeUntil(this.destroy$)).subscribe({
      next: classes => { this.managedClasses = classes; },
      error: (err) => this.logger.error('Failed to load managed classes', err)
    });

    this.academicSessionService.getAllSessions().pipe(takeUntil(this.destroy$)).subscribe({
      next: sessions => {
        this.sessions = sessions.map(s => s.label);
        const current = sessions.find(s => s.current);
        this.selectedSession = current ? current.label : (this.sessions[0] ?? '');
        this.cdr.markForCheck();
        this.initAfterSettings(user);
      },
      error: (e) => {
        this.logger.error('Failed to load sessions', e);
        this.initAfterSettings(user);
      }
    });
  }

  private initAfterSettings(user: { userId: string; role: string } | null): void {
    if (this.role === 'TEACHER') {
      const teacherId = user!.userId;
      this.teacherService.getTeacher(teacherId).pipe(takeUntil(this.destroy$)).subscribe({
        next: (t) => {
          this.selectedClass = t.classTeacher ?? '';
          this.cdr.markForCheck();
          if (this.selectedClass) {
            this.loadSectionsForClass(this.selectedClass);
            this.loadExams();
          }
        },
        error: (e) => this.logger.error('Error fetching teacher:', e),
      });
    } else {
      this.selectedClass = this.classOptions.length > 0 ? this.classOptions[0] : '1';
      this.loadSectionsForClass(this.selectedClass);
      this.loadExams();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get isTeacher(): boolean { return this.role === 'TEACHER'; }

  get selectedExam(): ExamConfig | null {
    return this.exams.find(e => e.id === this.selectedExamId) ?? null;
  }

  /** Published results are locked on the server; an admin must unpublish before marks change. */
  get examLocked(): boolean { return isPublished(this.selectedExam); }

  isExamPublished(exam: ExamConfig): boolean { return isPublished(exam); }

  rowError(studentId: string, entryId: number | null): string | null {
    return entryId == null ? null : this.rowErrors[`${studentId}|${entryId}`] ?? null;
  }

  @HostListener('window:beforeunload', ['$event'])
  warnBeforeLeaving(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedMarks()) event.preventDefault();
  }

  private hasUnsavedMarks(): boolean {
    // Issue #67: Check if any marks have been entered that differ from saved state
    const hasA = Object.entries(this.marksInputA).some(([id, val]) => {
      return val !== null && val !== undefined && val !== (this.originalMarksA[id] ?? null);
    });
    const hasB = Object.entries(this.marksInputB).some(([id, val]) => {
      return val !== null && val !== undefined && val !== (this.originalMarksB[+id] ?? null);
    });
    return hasA || hasB;
  }

  async setMode(m: 'subject' | 'student'): Promise<void> {
    if (this.mode === m) return;
    // Issue #67: Warn before discarding unsaved marks on mode switch
    if (this.hasUnsavedMarks()) {
      const discard = await this.toast.confirm({
        title: 'Unsaved Marks',
        message: 'You have unsaved marks. Switching mode will discard them. Continue?',
        confirmText: 'Discard',
        cancelText: 'Stay',
      });
      if (!discard) return;
    }
    this.mode = m;
    this.resetSubjectSelection();
    this.resetStudentSelection();
    // If an exam is already selected, trigger the appropriate data load for the new mode
    if (this.selectedExamId) {
      this.onExamChange();
    }
  }

  onClassChange(): void {
    // Issue #86: Remember section per class
    this.sectionMemory.set(this.selectedClass, this.selectedSectionId);
    this.selectedSectionId = this.sectionMemory.get(this.selectedClass) ?? null;
    this.sections = [];
    this.loadSectionsForClass(this.selectedClass);
    this.loadExams();
  }

  loadSectionsForClass(className: string): void {
    const cls = this.managedClasses.find(c => c.name === className);
    if (!cls) return;
    this.sectionService.getSectionsForClass(cls.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: sections => { this.sections = sections; this.cdr.markForCheck(); },
      error: (err) => this.logger.error('Failed to load sections', err)
    });
  }

  onSectionSelect(sectionId: number | null): void {
    this.selectedSectionId = sectionId;
    // Issue #86: Persist section selection per class
    this.sectionMemory.set(this.selectedClass, sectionId);
    if (this.mode === 'subject' && this.selectedSubjectEntryId) {
      this.onSubjectChange();
    } else if (this.mode === 'student' && this.selectedExamId) {
      this.onExamChange();
    }
  }

  loadExams(): void {
    this.resetSelections();
    this.examService.getExams(this.selectedSession, this.selectedClass)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => { this.exams = data; this.cdr.markForCheck(); },
        error: (e) => { this.logger.error('Error loading exams:', e); this.toast.error('Error', 'Failed to load exams.'); },
      });
  }

  onExamChange(): void {
    this.resetSubjectSelection();
    this.resetStudentSelection();
    if (!this.selectedExamId) return;

    if (this.mode === 'subject') {
      this.loadExamSubjects();
    } else {
      const secId = this.selectedSectionId ?? undefined;
      this.studentsState = 'loading';
      this.cdr.markForCheck();
      this.studentsSub = forkJoin([
        this.examService.getExamSubjects(this.selectedExamId),
        this.studentService.getActiveStudentsByClass(this.selectedClass, secId),
      ]).pipe(takeUntil(this.destroy$)).subscribe({
        next: ([subjects, studentList]) => {
          this.examSubjects = subjects;
          this.students = studentList.map((s: { studentId: string; name: string }) => ({ studentId: s.studentId, name: s.name }));
          this.studentsState = 'loaded';
          this.cdr.markForCheck();
        },
        error: (e) => {
          this.studentsState = 'error';
          this.logger.error('Error loading exam data:', e);
          this.toast.error('Error', 'Failed to load exam data.');
          this.cdr.markForCheck();
        },
      });
    }
  }

  loadExamSubjects(): void {
    if (!this.selectedExamId) return;
    this.examService.getExamSubjects(this.selectedExamId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => { this.examSubjects = data; this.cdr.markForCheck(); },
        error: (e) => { this.logger.error('Error loading exam subjects:', e); this.toast.error('Error', 'Failed to load exam subjects.'); },
      });
  }

  // Mode A — load students for a subject
  onSubjectChange(): void {
    this.subjectStudents = [];
    this.marksInputA = {};
    this.subjectStudentsSub?.unsubscribe();   // a late answer for a previous subject must not land here
    this.subjectStudentsState = 'idle';
    if (!this.selectedSubjectEntryId) return;

    this.subjectStudentsState = 'loading';
    this.cdr.markForCheck();
    this.subjectStudentsSub = this.marksService.getStudentsForSubject(this.selectedSubjectEntryId, this.selectedSectionId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.subjectStudents = data;
          this.subjectStudentsState = 'loaded';
          this.marksInputA = {};
          this.originalMarksA = {};
          data.forEach(s => {
            this.marksInputA[s.studentId] = s.marksObtained;
            this.originalMarksA[s.studentId] = s.marksObtained;
          });
          this.cdr.markForCheck();
        },
        error: (e) => {
          this.subjectStudentsState = 'error';
          this.logger.error('Error loading students for subject:', e);
          this.toast.error('Error', 'Failed to load students for this subject.');
          this.cdr.markForCheck();
        },
      });
  }

  // Mode B — load subjects for a student
  onStudentChange(): void {
    this.studentSubjects = [];
    this.marksInputB = {};
    this.studentSubjectsSub?.unsubscribe();
    this.studentSubjectsState = 'idle';
    if (!this.selectedStudentId || !this.selectedExamId) return;

    this.studentSubjectsState = 'loading';
    this.cdr.markForCheck();
    this.studentSubjectsSub = this.marksService.getSubjectsForStudent(this.selectedStudentId, this.selectedExamId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.studentSubjects = data;
          this.studentSubjectsState = 'loaded';
          this.marksInputB = {};
          this.originalMarksB = {};
          data.forEach(s => {
            this.marksInputB[s.examSubjectEntryId] = s.marksObtained;
            this.originalMarksB[s.examSubjectEntryId] = s.marksObtained;
          });
          this.cdr.markForCheck();
        },
        error: (e) => {
          this.studentSubjectsState = 'error';
          this.logger.error('Error loading subjects for student:', e);
          this.toast.error('Error', 'Failed to load subjects for this student.');
          this.cdr.markForCheck();
        },
      });
  }

  async saveMarksA(): Promise<void> {
    if (!this.selectedSubjectEntryId) return;

    if (this.examLocked) {
      this.toast.warning('Results Published', 'These results are published and locked. Ask an admin to unpublish them to change marks.');
      return;
    }
    // Issue #11, #28: Validate marks range before saving
    const maxMarks = this.getSelectedSubject()?.maxMarks ?? Infinity;
    const invalidEntries = Object.entries(this.marksInputA)
      .filter(([, val]) => val !== null && val !== undefined)
      // FIX Issue #33: Use !== null/undefined instead of truthy to preserve 0 marks
      .filter(([, val]) => +val! < 0 || +val! > maxMarks);
    if (invalidEntries.length > 0) {
      this.toast.error('Invalid Marks', `${invalidEntries.length} entries have invalid marks. Marks must be between 0 and ${maxMarks}.`);
      return;
    }

    // Only send entries where the mark has actually changed from the loaded value
    // FIX Issue #33: Use !== null && !== undefined instead of truthy check to preserve 0 marks
    const entries: MarkEntryRequest[] = this.subjectStudents
      .filter(s => {
        const current = this.marksInputA[s.studentId];
        const original = this.originalMarksA[s.studentId];
        // Include if value is not null/undefined AND has changed (including changed TO 0)
        return current !== null && current !== undefined && current !== original;
      })
      .map(s => ({
        studentId: s.studentId,
        examSubjectEntryId: this.selectedSubjectEntryId!,
        marksObtained: this.marksInputA[s.studentId]!,
      }));

    if (entries.length === 0) {
      this.toast.info('No Changes', 'No marks were modified.');
      return;
    }

    const confirmed = await this.toast.confirm({
      title: 'Save Marks',
      message: `You are about to save marks for ${entries.length} students. This cannot be easily undone.`,
      confirmText: 'Yes, Save',
      cancelText: 'Cancel',
      danger: false,
    });
    if (!confirmed) return;

    this.saving = true;
    this.rowErrors = {};
    this.marksService.saveBulkMarks(entries).pipe(takeUntil(this.destroy$)).subscribe({
      next: (result) => {
        this.saving = false;
        // Sync snapshot so a second save won't re-send the same changes
        entries.forEach(e => { this.originalMarksA[e.studentId] = e.marksObtained; });
        this.cdr.markForCheck();
        const msg = `Saved: ${result.saved}, Updated: ${result.updated}` +
          (result.errors.length ? `, Errors: ${result.errors.length}` : '');
        result.errors.length ? this.toast.warning('Marks Saved', msg) : this.toast.success('Marks Saved', msg);
      },
      error: (e) => this.onSaveRejected(e),
    });
  }

  async saveMarksB(): Promise<void> {
    if (!this.selectedStudentId) return;
    if (this.examLocked) {
      this.toast.warning('Results Published', 'These results are published and locked. Ask an admin to unpublish them to change marks.');
      return;
    }

    // Issue #11, #28: Validate marks range before saving — check per-subject maxMarks
    const invalidSubjectEntries = this.studentSubjects.filter(s => {
      const val = this.marksInputB[s.examSubjectEntryId];
      if (val === null || val === undefined) return false;
      const subjectEntry = this.examSubjects.find(e => e.id === s.examSubjectEntryId);
      const max = subjectEntry?.maxMarks ?? Infinity;
      return +val < 0 || +val > max;
    });
    if (invalidSubjectEntries.length > 0) {
      this.toast.error('Invalid Marks', `${invalidSubjectEntries.length} entries have invalid marks. Check that marks are between 0 and the subject maximum.`);
      return;
    }

    // Only send subjects where the mark has actually changed from the loaded value
    // FIX Issue #33: Use !== null && !== undefined instead of truthy check to preserve 0 marks
    const entries: MarkEntryRequest[] = this.studentSubjects
      .filter(s => {
        const current = this.marksInputB[s.examSubjectEntryId];
        const original = this.originalMarksB[s.examSubjectEntryId];
        // Include if value is not null/undefined AND has changed (including changed TO 0)
        return current !== null && current !== undefined && current !== original;
      })
      .map(s => ({
        studentId: this.selectedStudentId,
        examSubjectEntryId: s.examSubjectEntryId,
        marksObtained: this.marksInputB[s.examSubjectEntryId]!,
      }));

    if (entries.length === 0) {
      this.toast.info('No Changes', 'No marks were modified.');
      return;
    }

    const confirmed = await this.toast.confirm({
      title: 'Save Marks',
      message: `You are about to save marks for ${entries.length} subjects. This cannot be easily undone.`,
      confirmText: 'Yes, Save',
      cancelText: 'Cancel',
      danger: false,
    });
    if (!confirmed) return;

    this.saving = true;
    this.rowErrors = {};
    this.marksService.saveBulkMarks(entries).pipe(takeUntil(this.destroy$)).subscribe({
      next: (result) => {
        this.saving = false;
        // Sync snapshot so a second save won't re-send the same changes
        entries.forEach(e => { this.originalMarksB[e.examSubjectEntryId] = e.marksObtained; });
        this.cdr.markForCheck();
        this.toast.success('Marks Saved', `Saved: ${result.saved}, Updated: ${result.updated}`);
      },
      error: (e) => this.onSaveRejected(e),
    });
  }

  getSelectedSubject(): ExamSubjectEntry | undefined {
    return this.examSubjects.find(s => s.id === this.selectedSubjectEntryId);
  }

  /** A rejected save saved nothing: show every per-row reason next to its input. */
  private onSaveRejected(e: any): void {
    this.saving = false;
    this.logger.error('Error saving marks:', e);
    const errors: MarkError[] = e?.error?.errors ?? [];
    this.rowErrors = {};
    errors.forEach(err => {
      if (err.studentId && err.examSubjectEntryId != null) this.rowErrors[`${err.studentId}|${err.examSubjectEntryId}`] = err.reason;
    });
    const message = e?.error?.message || 'Failed to save marks.';
    this.toast.error('Nothing was saved', errors.length ? `${message} Fix the highlighted rows and try again.` : message);
    this.cdr.markForCheck();
  }

  get selectedStudentName(): string {
    return this.students.find(s => s.studentId === this.selectedStudentId)?.name ?? '';
  }

  private resetSelections(): void {
    this.selectedExamId = null;
    this.exams = [];
    this.resetSubjectSelection();
    this.resetStudentSelection();
  }

  private resetSubjectSelection(): void {
    this.rowErrors = {};
    this.examSubjects = [];
    this.selectedSubjectEntryId = null;
    this.subjectStudentsSub?.unsubscribe();
    this.subjectStudentsState = 'idle';
    this.subjectStudents = [];
    this.marksInputA = {};
    this.originalMarksA = {};
  }

  private resetStudentSelection(): void {
    this.studentsSub?.unsubscribe();
    this.studentsState = 'idle';
    this.students = [];
    this.selectedStudentId = '';
    this.studentSubjectsSub?.unsubscribe();
    this.studentSubjectsState = 'idle';
    this.studentSubjects = [];
    this.marksInputB = {};
    this.originalMarksB = {};
  }

  trackById(index: number, item: { id: number }): number { return item.id; }
  trackByEntryId(index: number, s: StudentExamSubject): number { return s.examSubjectEntryId; }
  trackByStudentId(index: number, s: { studentId: string }): string { return s.studentId; }
  trackByIndex(index: number): number { return index; }
}
