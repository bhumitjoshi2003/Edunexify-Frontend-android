import { coordinatorFullClasses, optionalCoordinatorService } from '../../services/coordinator.service';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, forkJoin, takeUntil, switchMap } from 'rxjs';
import { ToastService } from '../../services/toast.service';
import { StudentStreamService, StudentStreamOverview } from '../../services/student-stream.service';
import { SubjectConfigService, AcademicStream, OptionalSubjectGroup } from '../../services/subject-config.service';
import { SchoolService, SchoolClass } from '../../services/school.service';
import { SectionService } from '../../services/section.service';
import { Section } from '../../interfaces/section';
import { LoggerService } from '../../services/logger.service';

@Component({
  selector: 'app-student-stream',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './student-stream.component.html',
  styleUrl: './student-stream.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudentStreamComponent implements OnInit, OnDestroy {
  /** Coordinators see only classes they cover in full; everyone else is unaffected. */
  private coordinators = optionalCoordinatorService();

  private destroy$ = new Subject<void>();

  eligibleClasses: SchoolClass[] = [];
  selectedClass = '';
  students: StudentStreamOverview[] = [];
  streams: AcademicStream[] = [];
  optionalGroups: OptionalSubjectGroup[] = [];
  loading = false;
  noEligibleClasses = false;

  // Section support
  sections: Section[] = [];
  get hasSections(): boolean { return this.sections.length > 0; }

  // Bulk-assign state
  bulkSectionId: number | null = null;
  bulkStreamId: number | null = null;
  bulkOptionalId: number | null = null;
  bulkSaving = false;

  editingStudentId: string | null = null;
  editStreamId: number | null = null;
  editOptionalSubjectId: number | null = null;

  constructor(
    private streamService: StudentStreamService,
    private subjectService: SubjectConfigService,
    private schoolService: SchoolService,
    private sectionService: SectionService,
    private cdr: ChangeDetectorRef,
    private logger: LoggerService,
    private toast: ToastService
  ) { }

  ngOnInit(): void {
    forkJoin([
      this.subjectService.getStreams(),
      this.subjectService.getOptionalGroups(),
      this.schoolService.getManagedClasses().pipe(switchMap(c => coordinatorFullClasses(this.coordinators, c))),
    ]).pipe(takeUntil(this.destroy$)).subscribe({
      next: ([streams, groups, classes]) => {
        this.streams = streams;
        this.optionalGroups = groups;
        this.eligibleClasses = classes.filter(c => c.streamEligible && c.active);
        this.noEligibleClasses = this.eligibleClasses.length === 0;
        if (this.eligibleClasses.length > 0) {
          this.selectedClass = this.eligibleClasses[0].name;
          this.loadSectionsForClass(this.eligibleClasses[0], () => this.loadStudents());
        }
        this.cdr.markForCheck();
      },
      error: (e) => this.logger.error('Error loading config:', e),
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onClassSelect(className: string): void {
    this.selectedClass = className;
    this.sections = [];
    this.bulkSectionId = null;
    this.cancelEdit();
    const cls = this.eligibleClasses.find(c => c.name === className);
    if (cls) {
      this.loadSectionsForClass(cls, () => this.loadStudents());
    } else {
      this.loadStudents();
    }
  }

  private loadSectionsForClass(cls: SchoolClass, then?: () => void): void {
    this.sectionService.getSectionsForClass(cls.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: secs => {
        this.sections = secs;
        this.bulkSectionId = secs.length > 0 ? secs[0].id ?? null : null;
        this.cdr.markForCheck();
        then?.();
      },
      error: () => { this.sections = []; then?.(); }
    });
  }

  applyBulkSection(): void {
    if (!this.bulkSectionId || !this.bulkStreamId) {
      this.toast.warning('Incomplete', 'Please select a section and a stream.');
      return;
    }
    const sectionName = this.sections.find(s => s.id === this.bulkSectionId)?.name ?? 'selected section';
    const streamName = this.streams.find(s => s.id === this.bulkStreamId)?.streamName ?? 'selected stream';
    this.toast.confirm({
      title: 'Bulk assign stream?',
      message: `Assign ${streamName} to all students in Section ${sectionName}? This will overwrite any existing stream assignments for those students.`,
      confirmText: 'Yes, apply',
      danger: false
    }).then(confirmed => {
      if (!confirmed) return;
      this.bulkSaving = true;
      this.cdr.markForCheck();
      this.streamService.bulkAssignSection(this.selectedClass, this.bulkSectionId!, this.bulkStreamId!, this.bulkOptionalId)
        .pipe(takeUntil(this.destroy$)).subscribe({
          next: ({ updated }) => {
            this.bulkSaving = false;
            this.toast.success('Done', `Stream assigned to ${updated} student${updated !== 1 ? 's' : ''}.`);
            this.loadStudents();
          },
          error: (e) => {
            this.bulkSaving = false;
            this.logger.error('Bulk assign failed:', e);
            this.toast.error('Error', 'Failed to bulk assign stream. Please try again.');
            this.cdr.markForCheck();
          }
        });
    });
  }

  loadStudents(): void {
    if (!this.selectedClass) return;
    this.loading = true;
    this.students = [];
    this.streamService.getClassStreamOverview(this.selectedClass)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.students = data;
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: (e) => {
          this.logger.error('Error loading students:', e);
          this.loading = false;
          this.cdr.markForCheck();
        },
      });
  }

  startEdit(studentId: string, current: StudentStreamOverview): void {
    this.editingStudentId = studentId;
    this.editStreamId = this.streams.find(s => s.streamName === current.streamName)?.id ?? null;
    this.editOptionalSubjectId = this.allOptionalSubjects.find(s => s.subjectName === current.optionalSubjectName)?.id ?? null;
    this.cdr.markForCheck();
  }

  cancelEdit(): void {
    this.editingStudentId = null;
    this.editStreamId = null;
    this.editOptionalSubjectId = null;
    this.cdr.markForCheck();
  }

  saveAssignment(student: StudentStreamOverview): void {
    if (!this.editStreamId) {
      this.toast.warning('Incomplete', 'Please select a stream.');
      return;
    }

    const isNew = !student.streamName;
    const op = isNew
      ? this.streamService.assignStream(student.studentId, this.editStreamId, this.editOptionalSubjectId)
      : this.streamService.updateStream(student.studentId, this.editStreamId, this.editOptionalSubjectId);

    // Capture display values from local data before cancelEdit() clears the selections
    const savedStreamName = this.streams.find(s => s.id === this.editStreamId)?.streamName ?? null;
    const savedOptionalName = this.allOptionalSubjects.find(s => s.id === this.editOptionalSubjectId)?.subjectName ?? null;

    op.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.students = this.students.map(st =>
          st.studentId === student.studentId
            ? { ...st, streamName: savedStreamName, optionalSubjectName: savedOptionalName }
            : st
        );
        this.cancelEdit();
        this.cdr.markForCheck();
        this.toast.success('Saved');
      },
      error: (e) => {
        this.logger.error('Error saving stream:', e);
        this.toast.error('Error', 'Could not save assignment.');
      },
    });
  }

  removeAssignment(studentId: string): void {
    this.toast.confirm({
      title: 'Remove stream assignment?',
      confirmText: 'Remove',
      danger: true
    }).then((confirmed) => {
      if (!confirmed) return;
      this.streamService.deleteStream(studentId).pipe(takeUntil(this.destroy$)).subscribe({
        next: () => {
          // Immutable update so OnPush detects the change
          this.students = this.students.map(st =>
            st.studentId === studentId
              ? { ...st, streamName: null, optionalSubjectName: null }
              : st
          );
          this.cdr.markForCheck();
        },
        error: (e) => {
          this.logger.error('Error removing stream:', e);
          this.toast.error('Error', 'Could not remove assignment.');
        },
      });
    });
  }

  get allOptionalSubjects() {
    return this.optionalGroups.flatMap(g => g.subjects);
  }

  get filteredStudents(): StudentStreamOverview[] {
    if (!this.hasSections || !this.bulkSectionId) return this.students;
    const sectionName = this.sections.find(s => s.id === this.bulkSectionId)?.name;
    if (!sectionName) return this.students;
    return this.students.filter(s => s.sectionName === sectionName);
  }

  trackByStudentId(index: number, s: StudentStreamOverview): string { return s.studentId; }
  trackById(index: number, item: { id: number }): number { return item.id; }
  trackBySection(index: number, s: Section): number | undefined { return s.id; }
  trackByIndex(index: number): number { return index; }
}
