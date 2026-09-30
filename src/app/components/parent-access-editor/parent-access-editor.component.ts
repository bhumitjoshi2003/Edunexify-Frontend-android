import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, inject, Input, OnChanges,
  OnDestroy, OnInit, Output, SimpleChanges,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { catchError, debounceTime, distinctUntilChanged, finalize, of, Subject, switchMap, takeUntil, tap } from 'rxjs';
import { ChildAccess, ParentProfile } from '../../interfaces/parent-portal';
import { ParentPortalService } from '../../services/parent-portal.service';
import { ToastService } from '../../services/toast.service';
import { StudentService } from '../../services/student.service';
import { Student } from '../../interfaces/student';

/**
 * The "link a student" / "edit a linked student's access" form, extracted out of the parent
 * detail page so that its student-search and Standard/Customize-access logic stays
 * self-contained and independently readable. Backend permission enforcement is untouched —
 * this component only ever calls the existing ParentPortalService.linkStudent().
 */
@Component({
  selector: 'app-parent-access-editor',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatIconModule],
  templateUrl: './parent-access-editor.component.html',
  styleUrl: './parent-access-editor.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ParentAccessEditorComponent implements OnInit, OnChanges, OnDestroy {
  @Input({ required: true }) parentId!: string;
  @Input() editingChild: ChildAccess | null = null;
  @Output() saved = new EventEmitter<ParentProfile>();
  @Output() cancelled = new EventEmitter<void>();

  private readonly fb = inject(FormBuilder);
  private readonly parentService = inject(ParentPortalService);
  private readonly studentService = inject(StudentService);
  private readonly toast = inject(ToastService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();
  private readonly studentSearch$ = new Subject<string>();

  working = false;
  customizingAccess = false;
  studentQuery = '';
  studentMatches: Student[] = [];
  searchingStudents = false;
  studentSearchOpen = false;

  linkForm = this.fb.nonNullable.group({
    studentId: ['', Validators.required],
    relationshipType: ['PARENT', Validators.required],
    primaryGuardian: [true],
    canViewAttendance: [true], canViewFees: [true], canPayFees: [true],
    canViewResults: [true], canViewTimetable: [true], canManageLeave: [true],
    effectiveFrom: [new Date().toISOString().slice(0, 10), Validators.required],
  });

  ngOnInit(): void {
    this.linkForm.controls.canPayFees.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(enabled => {
      if (enabled && !this.linkForm.controls.canViewFees.value) this.linkForm.controls.canViewFees.setValue(true);
    });
    this.linkForm.controls.canViewFees.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(enabled => {
      if (!enabled && this.linkForm.controls.canPayFees.value) this.linkForm.controls.canPayFees.setValue(false);
    });
    this.studentSearch$.pipe(
      debounceTime(250), distinctUntilChanged(),
      tap(query => {
        this.searchingStudents = query.length >= 2;
        if (query.length < 2) this.studentMatches = [];
        this.cdr.markForCheck();
      }),
      switchMap(query => query.length >= 2
        ? this.studentService.searchStudents(query).pipe(catchError(() => of([])))
        : of([])),
      takeUntil(this.destroy$)
    ).subscribe(matches => {
      this.studentMatches = matches.filter(student =>
        !['GRADUATED', 'TRANSFERRED', 'WITHDRAWN', 'ADMISSION_CANCELLED'].includes(student.status ?? ''));
      this.searchingStudents = false;
      this.studentSearchOpen = this.studentQuery.trim().length >= 2;
      this.cdr.markForCheck();
    });
    this.populateFromInput();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['editingChild'] && !changes['editingChild'].firstChange) this.populateFromInput();
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  private populateFromInput(): void {
    const child = this.editingChild;
    this.customizingAccess = !!child && !this.isStandardAccess(child);
    this.studentSearchOpen = false;
    if (child) {
      this.studentQuery = `${child.studentName} (${child.studentId})`;
      this.linkForm.setValue({
        studentId: child.studentId, relationshipType: child.relationshipType,
        primaryGuardian: child.primaryGuardian, canViewAttendance: child.canViewAttendance,
        canViewFees: child.canViewFees, canPayFees: child.canPayFees,
        canViewResults: child.canViewResults, canViewTimetable: child.canViewTimetable,
        canManageLeave: child.canManageLeave,
        effectiveFrom: child.effectiveFrom,
      });
    } else {
      this.studentQuery = '';
      this.studentMatches = [];
      this.linkForm.reset({
        studentId: '', relationshipType: 'PARENT', primaryGuardian: true,
        canViewAttendance: true, canViewFees: true, canPayFees: true,
        canViewResults: true, canViewTimetable: true, canManageLeave: true,
        effectiveFrom: new Date().toISOString().slice(0, 10),
      });
    }
  }

  private isStandardAccess(access: {
    canViewAttendance: boolean; canViewFees: boolean; canPayFees: boolean;
    canViewResults: boolean; canViewTimetable: boolean; canManageLeave: boolean;
  }): boolean {
    return access.canViewAttendance && access.canViewFees && access.canPayFees
      && access.canViewResults && access.canViewTimetable && access.canManageLeave;
  }

  get allPermissionsSelected(): boolean {
    const value = this.linkForm.getRawValue();
    return value.canViewAttendance && value.canViewFees && value.canPayFees && value.canViewResults
      && value.canViewTimetable && value.canManageLeave;
  }

  enableCustomizeAccess(): void { this.customizingAccess = true; }

  useStandardAccess(): void {
    this.customizingAccess = false;
    this.setAllPermissions(true);
  }

  setAllPermissions(selected: boolean): void {
    this.linkForm.patchValue({
      canViewAttendance: selected, canViewFees: selected, canPayFees: selected,
      canViewResults: selected, canViewTimetable: selected,
      canManageLeave: selected,
    });
  }

  searchStudents(event: Event): void {
    const query = (event.target as HTMLInputElement).value;
    this.studentQuery = query;
    this.linkForm.controls.studentId.setValue(query.trim());
    this.studentSearchOpen = query.trim().length >= 2;
    this.studentSearch$.next(query.trim());
  }

  chooseStudent(student: Student): void {
    this.studentQuery = `${student.name} (${student.studentId})`;
    this.linkForm.controls.studentId.setValue(student.studentId);
    this.studentSearchOpen = false;
  }

  submit(): void {
    if (this.linkForm.invalid || this.working) { this.linkForm.markAllAsTouched(); return; }
    const wasEditing = !!this.editingChild;
    this.working = true;
    this.parentService.linkStudent(this.parentId, this.linkForm.getRawValue()).pipe(
      takeUntil(this.destroy$), finalize(() => { this.working = false; this.cdr.markForCheck(); })
    ).subscribe({
      next: profile => {
        this.toast.success(wasEditing ? 'Access updated' : 'Student linked', wasEditing
          ? 'The guardian permissions have been saved.'
          : 'The parent can now access this child.');
        this.saved.emit(profile);
      },
      error: error => this.toast.error(wasEditing ? 'Could not update access' : 'Could not link student', error?.error?.message || error?.error || 'Please verify the student.'),
    });
  }

  cancel(): void { this.cancelled.emit(); }
}
