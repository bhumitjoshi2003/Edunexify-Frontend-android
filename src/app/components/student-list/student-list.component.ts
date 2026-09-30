import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, OnDestroy } from '@angular/core';
import { StudentService } from '../../services/student.service';
import { TeacherService } from '../../services/teacher.service';
import { Teacher } from '../../interfaces/teacher';
import { Router } from '@angular/router';
import { AuthStateService } from '../../auth/auth-state.service';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil, switchMap, forkJoin, of, EMPTY } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { LoggerService } from '../../services/logger.service';
import { ToastService } from '../../services/toast.service';
import { SchoolService, SchoolClass } from '../../services/school.service';
import { SectionService } from '../../services/section.service';
import { Section } from '../../interfaces/section';
import { getStoredSelectedClass, setStoredSelectedClass } from '../../utils/class-selection-storage.util';

interface Student {
  studentId: string;
  name: string;
  status?: string;
  readmissionDate?: string;
}

@Component({
  selector: 'app-student-list',
  imports: [CommonModule],
  templateUrl: './student-list.component.html',
  styleUrl: './student-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})

export class StudentListComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  /** Emits a class name whenever we want to load students for that class.
   *  switchMap auto-cancels the previous in-flight set of requests. */
  private loadClass$ = new Subject<string>();
  activeStudents: Student[] = [];
  newStudents: Student[] = [];
  alumniStudents: Student[] = [];
  leftStudents: Student[] = [];
  isLoading: boolean = true;
  teacherId: string = '';
  loggedInUserRole: string = '';
  selectedClass: string = '';
  classList: string[] = [];
  managedClasses: SchoolClass[] = [];
  sections: Section[] = [];
  selectedSectionId: number | null = null;
  private schoolSlug: string | null = null;

  constructor(
    private studentService: StudentService,
    private teacherService: TeacherService,
    private router: Router,
    private authStateService: AuthStateService,
    private logger: LoggerService,
    private cdr: ChangeDetectorRef,
    private toast: ToastService,
    private schoolService: SchoolService,
    private sectionService: SectionService
  ) { }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  ngOnInit(): void {
    // switchMap cancels any previous in-flight batch when the class changes rapidly
    this.loadClass$.pipe(
      takeUntil(this.destroy$),
      switchMap(className => {
        this.isLoading = true;
        this.cdr.markForCheck();
        const secId = this.selectedSectionId ?? undefined;

        const active$ = this.studentService.getActiveStudentsByClass(className, secId);
        const upcoming$ = this.loggedInUserRole === 'ADMIN'
          ? this.studentService.getNewStudentsByClass(className, secId)
          : of([] as Student[]);
        const alumni$ = this.loggedInUserRole === 'ADMIN'
          ? this.studentService.getAlumniByClass(className, secId)
          : of([] as Student[]);
        const left$ = this.loggedInUserRole === 'ADMIN'
          ? this.studentService.getLeftStudentsByClass(className, secId)
          : of([] as Student[]);

        return forkJoin([active$, upcoming$, alumni$, left$]).pipe(
          map(([active, upcoming, alumni, left]) => ({ active, upcoming, alumni, left })),
          catchError(err => {
            this.logger.error('Error loading students:', err);
            this.toast.error('Error', 'Failed to load students. Please try again.');
            this.isLoading = false;
            this.cdr.markForCheck();
            return EMPTY;
          })
        );
      })
    ).subscribe(({ active, upcoming, alumni, left }) => {
      this.activeStudents = active;
      this.newStudents = upcoming;
      this.alumniStudents = alumni;
      this.leftStudents = left;
      this.isLoading = false;
      this.cdr.markForCheck();
    });

    this.getUserRoleAndLoadData();
  }

  getUserRoleAndLoadData(): void {
    const user = this.authStateService.getUser();
    if (user) {
      this.loggedInUserRole = user.role;
      this.teacherId = user.userId;
      this.schoolSlug = user.schoolSlug;

      if (this.loggedInUserRole === 'ADMIN') {
        forkJoin({
          managedClasses: this.schoolService.getManagedClasses(),
          classList: this.schoolService.getClasses()
        }).pipe(takeUntil(this.destroy$)).subscribe({
          next: ({ managedClasses, classList }) => {
            this.managedClasses = managedClasses;
            this.classList = classList;
            // A stored selection only counts if it's actually one of this school's
            // currently-configured classes — otherwise it's stale (another school,
            // a deleted class) and must never be used as the current class.
            this.selectedClass = getStoredSelectedClass(this.schoolSlug, classList, classList[0] || '');
            this.cdr.markForCheck();
            if (this.selectedClass) {
              this.loadSectionsForClass(this.selectedClass, () => this.loadStudents());
            } else {
              this.isLoading = false;
              this.cdr.markForCheck();
            }
          },
          error: (err) => {
            this.logger.error('Failed to load classes:', err);
            this.toast.error('Error', 'Failed to load class list.');
            this.isLoading = false;
            this.cdr.markForCheck();
          }
        });
      } else if (this.loggedInUserRole === 'TEACHER') {
        this.getTeacherClassAndLoadStudents();
      }
    } else {
    }
  }

  getTeacherClassAndLoadStudents(): void {
    this.teacherService.getTeacher(this.teacherId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (teacher: Teacher) => {
        this.selectedClass = teacher.classTeacher ?? '';
        this.loadStudents();
      },
      error: (error: unknown) => {
        this.logger.error('Error fetching teacher details:', error);
        this.isLoading = false;
        this.cdr.markForCheck();
        this.toast.error('Error', 'Failed to load teacher details. Please try again.');
      }
    });
  }

  loadStudents(): void {
    setStoredSelectedClass(this.schoolSlug, this.selectedClass);
    // Emitting triggers the switchMap pipeline in ngOnInit, which auto-cancels
    // any in-flight requests from the previous class selection
    this.loadClass$.next(this.selectedClass);
  }

  viewStudentDetails(studentId: string): void {
    this.router.navigate(['/dashboard/student-details', studentId]);
  }

  trackByStudentId(index: number, student: Student): string { return student.studentId; }
  trackByClass(index: number, className: string): string { return className; }

  onClassSelect(selectedClass: string): void {
    this.selectedClass = selectedClass;
    this.selectedSectionId = null;
    this.sections = [];
    this.activeStudents = [];
    this.newStudents = [];
    this.alumniStudents = [];
    this.leftStudents = [];
    this.isLoading = true;
    this.cdr.markForCheck();
    this.loadSectionsForClass(selectedClass, () => this.loadStudents());
  }

  loadSectionsForClass(className: string, then?: () => void): void {
    const cls = this.managedClasses.find(c => c.name === className);
    if (!cls) { then?.(); return; }
    this.sectionService.getSectionsForClass(cls.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: sections => { this.sections = sections; this.cdr.markForCheck(); then?.(); },
      error: () => { then?.(); }
    });
  }

  onSectionSelect(sectionId: number | null): void {
    this.selectedSectionId = sectionId;
    this.loadStudents();
  }

  navigateToBulkImport(): void {
    this.router.navigate(['/dashboard/student-bulk-import']);
  }

  hasFeature(featureKey: string): boolean {
    return this.authStateService.hasFeature(featureKey);
  }

  // Issue #30: Status badge color for alumni/left sections
  getExitBadgeClass(status: string): string {
    if (status === 'GRADUATED') return 'badge-success';
    if (status === 'TRANSFERRED') return 'badge-info';
    if (status === 'WITHDRAWN') return 'badge-warning';
    if (status === 'ADMISSION_CANCELLED') return 'badge-secondary';
    return 'badge-secondary';
  }

  // Issue #81: Re-admitted badge
  isReadmitted(student: Student): boolean {
    return !!student.readmissionDate;
  }
}
