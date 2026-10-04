import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, OnDestroy } from '@angular/core';
import { LoggerService } from '../../services/logger.service';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { TeacherService } from '../../services/teacher.service';
import { Router } from '@angular/router';
import { ToastService } from '../../services/toast.service';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { AuthStateService } from '../../auth/auth-state.service';
import { Subject, forkJoin, takeUntil } from 'rxjs';
import { finalize, tap } from 'rxjs/operators';
import { SchoolClass, SchoolService } from '../../services/school.service';
import { SectionService } from '../../services/section.service';
import { Section } from '../../interfaces/section';
import { strictEmailValidator, pastDateValidator, phoneValidator } from '../../validators/shared.validators';

@Component({
  selector: 'app-register-teacher',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './register-teacher.component.html',
  styleUrls: ['./register-teacher.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RegisterTeacherComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  teacherForm: FormGroup;
  classList: string[] = [];
  /** Full class records (name + id) — the id is what the section lookup needs. */
  managedClasses: SchoolClass[] = [];
  /** Active sections of the currently selected class; empty means the class has none. */
  sections: Section[] = [];
  isSubmitting = false;

  constructor(
    private fb: FormBuilder,
    private teacherService: TeacherService,
    private router: Router,
    private authState: AuthStateService,
    private logger: LoggerService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef,
    private schoolService: SchoolService,
    private sectionService: SectionService
  ) {
    this.teacherForm = this.fb.group({
      name: ['', Validators.required],
      email: ['', [Validators.required, strictEmailValidator()]],
      phoneNumber: ['', phoneValidator()],
      dob: ['', [Validators.required, pastDateValidator()]],
      gender: ['', Validators.required],
      classTeacher: [''],
      // Validators are attached/removed dynamically: required only while the selected
      // class actually has active sections (mirrors the backend's own rule).
      classTeacherSectionId: [null as number | null],
      joiningDate: ['', Validators.required]
    });
  }

  get sectionControl() {
    return this.teacherForm.controls['classTeacherSectionId'];
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

    // Class names drive the dropdown; the managed records supply the classId the
    // section lookup needs.
    forkJoin({
      classes: this.schoolService.getClasses(),
      managed: this.schoolService.getManagedClasses()
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: ({ classes, managed }) => {
        this.classList = classes;
        this.managedClasses = managed;
        this.cdr.markForCheck();
      },
      error: () => {
        this.toast.error('Error', 'Failed to load class list.');
      }
    });

    // Reacting to valueChanges (rather than a template (change) handler) also covers
    // programmatic resets, so the section field can never keep a stale value.
    this.teacherForm.controls['classTeacher'].valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((className: string | null) => this.onClassTeacherChange(className));
  }

  /**
   * Clears any previously chosen section, then reloads the section list for the newly
   * selected class. The section field is shown and made required only when that class
   * has active sections — otherwise it stays hidden and submits null.
   */
  private onClassTeacherChange(className: string | null): void {
    this.sections = [];
    this.sectionControl.setValue(null, { emitEvent: false });
    this.sectionControl.clearValidators();
    this.sectionControl.updateValueAndValidity({ emitEvent: false });
    this.cdr.markForCheck();

    if (!className) return;
    const cls = this.managedClasses.find(c => c.name === className);
    if (!cls) return;

    this.sectionService.getSectionsForClass(cls.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: sections => {
          // A slower response for a class the admin has since switched away from must
          // not repopulate the dropdown.
          if (this.teacherForm.controls['classTeacher'].value !== className) return;
          this.sections = sections;
          if (sections.length > 0) {
            this.sectionControl.setValidators(Validators.required);
            this.sectionControl.updateValueAndValidity({ emitEvent: false });
          }
          this.cdr.markForCheck();
        },
        error: () => {
          this.sections = [];
          this.cdr.markForCheck();
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onSubmit() {
    if (this.isSubmitting) return;

    if (this.teacherForm.valid) {
      this.isSubmitting = true;
      this.cdr.markForCheck();
      // The backend generates the Employee ID (and derives the initial login password
      // from date of birth, YYYYMMDD) — neither is ever supplied by the frontend. The
      // generated ID is captured here (switchMap discards the outer emission) so it can
      // still be shown to the admin once account setup completes.
      let generatedTeacherId = '';
      const payload = {
        ...this.teacherForm.value,
        // Belt-and-braces: a class with no sections must never carry a sectionId.
        classTeacherSectionId: this.sections.length > 0
          ? this.sectionControl.value
          : null
      };
      // One call: the backend generates the Employee ID and creates the teacher and their login
      // (initial password = date of birth, YYYYMMDD) in a single transaction.
      let joinsLater = false;
      this.teacherService.addTeacher(payload).pipe(
        takeUntil(this.destroy$),
        tap((response: { teacherId: string; status?: string }) => {
          generatedTeacherId = response.teacherId;
          joinsLater = response.status === 'UPCOMING';
        }),
        finalize(() => {
          this.isSubmitting = false;
          this.cdr.markForCheck();
        })
      ).subscribe({
        next: () => {
          this.toast.success('Teacher Registered!', `Edunexify Employee ID: ${generatedTeacherId}. Initial password: Date of birth in YYYYMMDD format. ` +
            'Example: 23 May 1990 → 19900523. The user must create a new password during their first login.' +
            (joinsLater ? ' The login activates on the joining date.' : ''));
          this.teacherForm.reset();
        },
        error: (error) => {
          this.logger.error('Error registering teacher:', error);
          let errorMessage = 'Failed to register new teacher.';
          if ((error.status === 409 || error.status === 400) && typeof error.error === 'string' && error.error) {
            // e.g. the class/section already has a class teacher — nothing was created.
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
    this.teacherForm.reset();
  }
}
