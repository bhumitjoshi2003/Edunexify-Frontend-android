import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, OnDestroy } from '@angular/core';
import { LoggerService } from '../../services/logger.service';
import { AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { finalize, tap } from 'rxjs/operators';
import { StudentService } from '../../services/student.service';
import { Router } from '@angular/router';
import { SchoolService, SchoolClass } from '../../services/school.service';
import { SectionService } from '../../services/section.service';
import { Section } from '../../interfaces/section';
import { ToastService } from '../../services/toast.service';
import { CommonModule } from '@angular/common';
import { AuthStateService } from '../../auth/auth-state.service';
import { strictEmailValidator, pastDateValidator, phoneValidator, nonBlankValidator } from '../../validators/shared.validators';
import { ClassSectionConfig } from '../../utils/class-section-config';
import { registrationCredentialsDialog } from '../../utils/registration.util';
import { schoolDateKey } from '../../utils/school-date.util';

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
  /** Class list, managed classes and the selected class's sections (see utils/class-section-config.ts). */
  readonly config: ClassSectionConfig;
  isSubmitting = false;

  get classList(): string[] { return this.config.classList; }
  get managedClasses(): SchoolClass[] { return this.config.managedClasses; }
  get sections(): Section[] { return this.config.sections; }

  constructor(
    private fb: FormBuilder,
    private studentService: StudentService,
    private router: Router,
    private authState: AuthStateService,
    private logger: LoggerService,
    private schoolService: SchoolService,
    private sectionService: SectionService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef
  ) {
    this.studentForm = this.fb.group({
      name: ['', [Validators.required, nonBlankValidator()]],
      email: ['', [Validators.required, strictEmailValidator()]],
      phoneNumber: ['', phoneValidator()],
      dob: ['', [Validators.required, pastDateValidator()]],
      className: ['', Validators.required],
      gender: ['', Validators.required],
      fatherName: [''],
      motherName: [''],
      // Required whenever the chosen class has sections (B5-2); a sectionless class allows none.
      sectionId: [null, (c: AbstractControl) => this.config?.sections.length && c.value == null ? { required: true } : null],
      takesBus: [false],
      distance: [''],
      joiningDate: ['', Validators.required]
    });
    this.config = new ClassSectionConfig({
      getClasses: () => this.schoolService.getClasses(),
      getManagedClasses: () => this.schoolService.getManagedClasses(),
      getSectionsForClass: (classId) => this.sectionService.getSectionsForClass(classId),
    }, () => {
      this.studentForm.get('sectionId')?.updateValueAndValidity({ emitEvent: false });
      this.cdr.markForCheck();
    }, this.destroy$);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get todayStr(): string {
    return schoolDateKey(new Date());
  }

  ngOnInit(): void {
    // Issue #13: Defense-in-depth role check — backend is authoritative, this is UX-only
    const role = this.authState.getUserRole();
    if (role !== 'ADMIN') {
      this.router.navigate(['/dashboard']);
      return;
    }

    this.config.load();
    // A new class clears the section; a slower response for the previous class is discarded.
    this.studentForm.get('className')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(className => {
      this.studentForm.get('sectionId')?.setValue(null);
      this.config.selectClass(className);
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

    if (this.studentForm.valid && this.config.sectionsPending) {
      this.toast.warning('Sections still loading', 'Please wait for the section list, then choose a section if needed.');
      return;
    }

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
          this.toast.confirm(registrationCredentialsDialog('student', generatedStudentId));
          this.studentForm.reset();
          this.isBusUser = false;
          this.cdr.markForCheck();
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
