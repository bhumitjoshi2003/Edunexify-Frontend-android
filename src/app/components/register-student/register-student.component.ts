import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, OnDestroy } from '@angular/core';
import { LoggerService } from '../../services/logger.service';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subject, forkJoin, takeUntil } from 'rxjs';
import { finalize, tap } from 'rxjs/operators';
import { StudentService } from '../../services/student.service';
import { Router } from '@angular/router';
import { ToastService } from '../../services/toast.service';
import { CommonModule } from '@angular/common';
import { AuthStateService } from '../../auth/auth-state.service';
import { SchoolService, SchoolClass } from '../../services/school.service';
import { SectionService } from '../../services/section.service';
import { Section } from '../../interfaces/section';
import { strictEmailValidator, pastDateValidator, phoneValidator } from '../../validators/shared.validators';

@Component({
  selector: 'app-register-student',
  templateUrl: './register-student.component.html',
  imports: [CommonModule, ReactiveFormsModule],
  styleUrls: ['./register-student.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RegisterStudentComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  studentForm: FormGroup;
  isBusUser = false;
  classList: string[] = [];
  managedClasses: SchoolClass[] = [];
  sections: Section[] = [];
  isSubmitting = false;

  constructor(
    private fb: FormBuilder,
    private studentService: StudentService,
    private router: Router,
    private authState: AuthStateService,
    private logger: LoggerService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef,
    private schoolService: SchoolService,
    private sectionService: SectionService
  ) {
    this.studentForm = this.fb.group({
      name: ['', Validators.required],
      email: ['', [Validators.required, strictEmailValidator()]],
      phoneNumber: ['', phoneValidator()],
      dob: ['', [Validators.required, pastDateValidator()]],
      className: ['', Validators.required],
      gender: ['', Validators.required],
      fatherName: [''],
      motherName: [''],
      sectionId: [null],
      takesBus: [false],
      distance: [''],
      joiningDate: ['', Validators.required]
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get todayStr(): string {
    return new Date().toISOString().split('T')[0];
  }

  ngOnInit(): void {
    // Issue #13: Defense-in-depth role check — backend is authoritative, this is UX-only
    const role = this.authState.getUserRole();
    if (role !== 'ADMIN') {
      this.router.navigate(['/dashboard']);
      return;
    }

    forkJoin({
      classList: this.schoolService.getClasses(),
      managedClasses: this.schoolService.getManagedClasses()
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: ({ classList, managedClasses }) => {
        this.classList = classList;
        this.managedClasses = managedClasses;
        this.cdr.markForCheck();
      },
      error: () => {
        this.toast.error('Error', 'Failed to load class list.');
      }
    });
    // Load sections when class changes — managedClasses is guaranteed populated by the time
    // the user can interact with the class dropdown
    this.studentForm.get('className')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(className => {
      this.sections = [];
      this.studentForm.get('sectionId')?.setValue(null);
      if (!className) return;
      const cls = this.managedClasses.find(c => c.name === className);
      if (cls) {
        this.sectionService.getSectionsForClass(cls.id).pipe(takeUntil(this.destroy$)).subscribe({
          next: sections => { this.sections = sections; this.cdr.markForCheck(); },
          error: (err) => this.logger.error('Failed to load sections', err)
        });
      }
    });
    this.studentForm.get('takesBus')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(value => {
      this.isBusUser = value;
      if (this.isBusUser) {
        this.studentForm.get('distance')?.setValidators([Validators.required]);
      } else {
        this.studentForm.get('distance')?.clearValidators();
      }
      this.studentForm.get('distance')?.updateValueAndValidity();
    });
  }

  onSubmit() {
    if (this.isSubmitting) return;

    if (this.studentForm.valid) {
      this.isSubmitting = true;
      this.cdr.markForCheck();
      // One call: the backend generates the Student ID and creates the student, enrollment and
      // login (initial password = date of birth, YYYYMMDD) in a single transaction, so a failure
      // never leaves a student without an account.
      let generatedStudentId = '';
      this.studentService.addStudent(this.studentForm.value).pipe(
        takeUntil(this.destroy$),
        tap((response: { studentId: string }) => { generatedStudentId = response.studentId; }),
        finalize(() => {
          this.isSubmitting = false;
          this.cdr.markForCheck();
        })
      ).subscribe({
        next: () => {
          this.toast.success('Student Registered!', `Edunexify Student ID: ${generatedStudentId}. Initial password: Date of birth in YYYYMMDD format. ` +
            'Example: 23 May 1990 → 19900523. The user must create a new password during their first login.');
          this.studentForm.reset();
          this.isBusUser = false;
        },
        error: (error) => {
          this.logger.error('Error registering student:', error);
          let errorMessage = 'Failed to register new student.';
          if ((error.status === 409 || error.status === 400) && typeof error.error === 'string' && error.error) {
            // e.g. a joining date in a past academic session — nothing was created.
            errorMessage = error.error;
          }
          this.toast.error('Error!', errorMessage);
        }
      });
    } else {
      this.toast.error('Validation Error!', 'Please fill in all the required fields correctly.');
    }
  }

  goBack() {
    if (this.isSubmitting) return;
    this.studentForm.reset();
    this.isBusUser = false;
  }
}
