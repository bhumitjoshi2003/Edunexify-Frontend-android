import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { coordinatorClassNames, optionalCoordinatorService } from '../../services/coordinator.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, forkJoin, takeUntil, switchMap } from 'rxjs';
import { ToastService } from '../../services/toast.service';
import { SubjectConfigService, ClassSubject } from '../../services/subject-config.service';
import { StudentElectiveEnrollmentService, ElectiveEnrollment } from '../../services/student-elective-enrollment.service';
import { StudentService } from '../../services/student.service';
import { SchoolService, SchoolClass } from '../../services/school.service';
import { SectionService } from '../../services/section.service';
import { Section } from '../../interfaces/section';
import { LoggerService } from '../../services/logger.service';

interface StudentRow {
  studentId: string;
  studentName: string;
  /** map of optionalGroup → currently selected subjectName (or '' if none) */
  selections: Record<string, string>;
  /** original saved selections for dirty-check */
  saved: Record<string, string>;
  saving: boolean;
}

interface ElectiveGroup {
  groupName: string;
  subjects: string[];
}

@Component({
  selector: 'app-elective-assignment',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './elective-assignment.component.html',
  styleUrl: './elective-assignment.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ElectiveAssignmentComponent implements OnInit, OnDestroy {
  /** Coordinators see only classes they cover in full; everyone else is unaffected. */
  private coordinators = optionalCoordinatorService();

  private destroy$ = new Subject<void>();

  classOptions: string[] = [];
  managedClasses: SchoolClass[] = [];
  selectedClass = '';

  sections: Section[] = [];
  selectedSectionId: number | null = null;

  electiveGroups: ElectiveGroup[] = [];
  students: StudentRow[] = [];
  loading = false;

  // Bulk assign state
  bulkGroup = '';
  bulkSubject = '';
  bulkSaving = false;

  constructor(
    private enrollmentService: StudentElectiveEnrollmentService,
    private subjectService: SubjectConfigService,
    private studentService: StudentService,
    private schoolService: SchoolService,
    private sectionService: SectionService,
    private cdr: ChangeDetectorRef,
    private logger: LoggerService,
    private toast: ToastService
  ) { }

  ngOnInit(): void {
    forkJoin([
      this.schoolService.getClasses().pipe(switchMap(c => coordinatorClassNames(this.coordinators, c))),
      this.schoolService.getManagedClasses(),
    ]).pipe(takeUntil(this.destroy$)).subscribe({
      next: ([classes, managed]) => {
        this.classOptions = classes;
        this.managedClasses = managed;
        if (classes.length > 0) {
          this.selectedClass = classes[0];
          this.loadData();
        }
        this.cdr.markForCheck();
      },
      error: (e) => this.logger.error('Error loading classes:', e),
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onClassChange(): void {
    this.selectedSectionId = null;
    this.sections = [];
    this.students = [];
    this.electiveGroups = [];
    this.loadData();
  }

  onSectionChange(sectionId: number | null): void {
    this.selectedSectionId = sectionId;
    this.loadStudents();
  }

  private loadData(): void {
    if (!this.selectedClass) return;
    this.loading = true;
    this.cdr.markForCheck();

    // Load elective subjects for this class
    this.subjectService.getClassSubjects(this.selectedClass)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (subjects) => {
          const optionals = subjects.filter(s => s.optional && s.optionalGroup);
          // Group by optionalGroup
          const groupMap = new Map<string, string[]>();
          optionals.forEach(s => {
            const g = s.optionalGroup!;
            if (!groupMap.has(g)) groupMap.set(g, []);
            groupMap.get(g)!.push(s.subjectName);
          });
          this.electiveGroups = Array.from(groupMap.entries()).map(([groupName, subjects]) => ({ groupName, subjects }));
          this.cdr.markForCheck();

          // Load sections
          const cls = this.managedClasses.find(c => c.name === this.selectedClass);
          if (cls) {
            this.sectionService.getSectionsForClass(cls.id).pipe(takeUntil(this.destroy$)).subscribe({
              next: sections => {
                this.sections = sections;
                this.cdr.markForCheck();
                this.loadStudents();
              },
              error: () => this.loadStudents(),
            });
          } else {
            this.loadStudents();
          }
        },
        error: (e) => {
          this.logger.error('Error loading subjects:', e);
          this.loading = false;
          this.cdr.markForCheck();
        },
      });
  }

  private loadStudents(): void {
    if (!this.selectedClass || this.electiveGroups.length === 0) {
      this.students = [];
      this.loading = false;
      this.cdr.markForCheck();
      return;
    }

    forkJoin([
      this.studentService.getActiveStudentsByClass(this.selectedClass, this.selectedSectionId ?? undefined),
      this.enrollmentService.getEnrollmentsForClass(this.selectedClass),
    ]).pipe(takeUntil(this.destroy$)).subscribe({
      next: ([studentList, enrollments]) => {
        // Build enrollment map: studentId → (group → subjectName)
        const enrollMap = new Map<string, Record<string, string>>();
        enrollments.forEach(e => {
          if (!enrollMap.has(e.studentId)) enrollMap.set(e.studentId, {});
          enrollMap.get(e.studentId)![e.optionalGroup] = e.subjectName;
        });

        this.students = studentList.map(s => {
          const saved = enrollMap.get(s.studentId) ?? {};
          return {
            studentId: s.studentId,
            studentName: s.name,
            selections: { ...saved },
            saved: { ...saved },
            saving: false,
          };
        });
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: (e) => {
        this.logger.error('Error loading students/enrollments:', e);
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  isDirty(student: StudentRow): boolean {
    return this.electiveGroups.some(g =>
      (student.selections[g.groupName] ?? '') !== (student.saved[g.groupName] ?? '')
    );
  }

  saveStudent(student: StudentRow): void {
    student.saving = true;
    this.cdr.markForCheck();

    const ops: Promise<void>[] = [];

    for (const group of this.electiveGroups) {
      const current = student.selections[group.groupName] ?? '';
      const saved = student.saved[group.groupName] ?? '';
      if (current === saved) continue;

      if (current) {
        ops.push(new Promise<void>((resolve, reject) => {
          this.enrollmentService.enroll(student.studentId, this.selectedClass, group.groupName, current)
            .pipe(takeUntil(this.destroy$))
            .subscribe({ next: () => resolve(), error: reject });
        }));
      } else {
        ops.push(new Promise<void>((resolve, reject) => {
          this.enrollmentService.unenroll(student.studentId, this.selectedClass, group.groupName)
            .pipe(takeUntil(this.destroy$))
            .subscribe({ next: () => resolve(), error: reject });
        }));
      }
    }

    Promise.all(ops).then(() => {
      student.saved = { ...student.selections };
      student.saving = false;
      this.toast.success('Saved', 'Elective choice updated successfully.');
      this.cdr.markForCheck();
    }).catch((e) => {
      this.logger.error('Error saving elective for student:', e);
      this.toast.error('Error', 'Could not save elective choice.');
      student.saving = false;
      this.cdr.markForCheck();
    });
  }

  bulkAssign(): void {
    if (!this.bulkGroup || !this.bulkSubject) {
      this.toast.error('Validation', 'Select a group and subject for bulk assignment.');
      return;
    }
    const ids = this.students.map(s => s.studentId);
    if (ids.length === 0) return;

    this.bulkSaving = true;
    this.cdr.markForCheck();

    this.enrollmentService.bulkEnroll(ids, this.selectedClass, this.bulkGroup, this.bulkSubject)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.toast.success('Done', `Assigned ${res.enrolled} students to ${this.bulkSubject}.`);
          // Update local state
          this.students = this.students.map(s => ({
            ...s,
            selections: { ...s.selections, [this.bulkGroup]: this.bulkSubject },
            saved: { ...s.saved, [this.bulkGroup]: this.bulkSubject },
          }));
          this.bulkSaving = false;
          this.bulkGroup = '';
          this.bulkSubject = '';
          this.cdr.markForCheck();
        },
        error: (e) => {
          this.logger.error('Bulk assign error:', e);
          this.toast.error('Error', 'Bulk assignment failed.');
          this.bulkSaving = false;
          this.cdr.markForCheck();
        },
      });
  }

  getSubjectsForGroup(groupName: string): string[] {
    return this.electiveGroups.find(g => g.groupName === groupName)?.subjects ?? [];
  }

  trackByStudentId(index: number, s: StudentRow): string { return s.studentId; }
  trackByGroup(index: number, g: ElectiveGroup): string { return g.groupName; }
  trackByIndex(index: number): number { return index; }
}
