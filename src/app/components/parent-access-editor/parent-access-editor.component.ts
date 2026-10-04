import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, inject, Input, OnChanges,
  OnDestroy, OnInit, Output, SimpleChanges,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { catchError, debounceTime, distinctUntilChanged, finalize, of, Subject, switchMap, takeUntil, tap } from 'rxjs';
import { ChildAccess, GuardianLink, ParentProfile } from '../../interfaces/parent-portal';
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
  /** Used in the "make … the primary guardian instead?" confirmation. */
  @Input() parentName = '';
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
  /** The chosen student's current primary guardian, when it is another parent. */
  currentPrimary: GuardianLink | null = null;
  private readonly guardianLookup$ = new Subject<string>();

  linkForm = this.fb.nonNullable.group({
    studentId: ['', Validators.required],
    relationshipType: ['PARENT', Validators.required],
    primaryGuardian: [false],
    canViewAttendance: [true], canViewFees: [true], canPayFees: [true],
    canViewResults: [true], canViewTimetable: [true], canManageLeave: [true],
    effectiveFrom: [localToday(), Validators.required],
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
    // The chosen student's guardians decide the Primary default: on only when the child has no
    // current primary. switchMap drops a slower answer for a previously chosen student.
    this.guardianLookup$.pipe(
      switchMap(studentId => this.parentService.getGuardians(studentId).pipe(catchError(() => of([] as GuardianLink[])))),
      takeUntil(this.destroy$)
    ).subscribe(guardians => {
      this.currentPrimary = guardians.find(g => g.primaryGuardian && g.linkStatus !== 'ENDED' && g.parentId !== this.parentId) ?? null;
      if (!this.editingChild) this.linkForm.controls.primaryGuardian.setValue(!this.currentPrimary);
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
    this.currentPrimary = null;
    if (child) {
      this.guardianLookup$.next(child.studentId);
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
        studentId: '', relationshipType: 'PARENT', primaryGuardian: false,
        canViewAttendance: true, canViewFees: true, canPayFees: true,
        canViewResults: true, canViewTimetable: true, canManageLeave: true,
        effectiveFrom: localToday(),
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
    // Off until we know the child has no current primary guardian.
    this.linkForm.controls.primaryGuardian.setValue(false);
    this.currentPrimary = null;
    this.guardianLookup$.next(student.studentId);
  }

  async submit(): Promise<void> {
    if (this.linkForm.invalid || this.working) { this.linkForm.markAllAsTouched(); return; }
    const value = this.linkForm.getRawValue();
    let replacePrimary = false;
    if (value.primaryGuardian && this.currentPrimary && !this.editingChild?.primaryGuardian) {
      if (!await this.confirmTakeover(`${this.currentPrimary.parentName} is currently the primary guardian. `
        + `Make ${this.parentName || 'this parent'} the primary guardian instead?`)) return;
      replacePrimary = true;
    }
    this.save(replacePrimary);
  }

  private confirmTakeover(message: string): Promise<boolean> {
    return this.toast.confirm({
      title: 'Change primary guardian?', message, icon: 'question',
      confirmText: 'Make primary', cancelText: 'Keep current',
    });
  }

  private save(replacePrimary: boolean): void {
    const wasEditing = !!this.editingChild;
    this.working = true;
    this.cdr.markForCheck();
    this.parentService.linkStudent(this.parentId, { ...this.linkForm.getRawValue(), replacePrimary }).pipe(
      takeUntil(this.destroy$), finalize(() => { this.working = false; this.cdr.markForCheck(); })
    ).subscribe({
      next: profile => {
        this.toast.success(wasEditing ? 'Access updated' : 'Student linked', wasEditing
          ? 'The guardian permissions have been saved.'
          : 'The parent can now access this child.');
        this.saved.emit(profile);
      },
      error: async error => {
        const message: string = error?.error?.message || (typeof error?.error === 'string' ? error.error : '');
        // Someone else became primary since the form loaded: ask, then retry as a takeover.
        if (error?.status === 409 && !replacePrimary && message.includes('is currently the primary guardian')) {
          if (await this.confirmTakeover(message)) this.save(true);
          return;
        }
        this.toast.error(wasEditing ? 'Could not update access' : 'Could not link student', message || 'Please verify the student.');
      },
    });
  }

  cancel(): void { this.cancelled.emit(); }
}

/** Today's date in the browser's own timezone (not UTC) as yyyy-MM-dd. */
function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
