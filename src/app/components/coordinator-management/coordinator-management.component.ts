import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Subject, forkJoin, of, catchError, takeUntil } from 'rxjs';
import { CoordinatorService } from '../../services/coordinator.service';
import { TeacherService } from '../../services/teacher.service';
import { SchoolClass, SchoolService } from '../../services/school.service';
import { SectionService } from '../../services/section.service';
import { AcademicStream, SubjectConfigService } from '../../services/subject-config.service';
import { ToastService } from '../../services/toast.service';
import { Teacher } from '../../interfaces/teacher';
import { Section } from '../../interfaces/section';
import { CoordinatorAppointment, CoordinatorScopeRequest, coordinatorScopeLabel } from '../../interfaces/coordinator';
import { apiMessage } from '../academic-session-selector/academic-session-selector.component';

/** One scope row being edited: a class, optionally one section and/or one stream. */
interface DraftScope { classId: number | null; sectionId: number | null; streamId: number | null; }

/**
 * Admin / Principal: appoint teachers as Academic Coordinators, change what they cover and end
 * appointments (with a reason). The teacher keeps one account and all teaching work.
 */
@Component({
  selector: 'app-coordinator-management',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './coordinator-management.component.html',
  styleUrl: './coordinator-management.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CoordinatorManagementComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  appointments: CoordinatorAppointment[] = [];
  teachers: Teacher[] = [];
  classes: SchoolClass[] = [];
  streams: AcademicStream[] = [];
  sectionsByClass: Record<number, Section[] | undefined> = {};
  loading = true;
  loadError: string | null = null;
  showHistory = false;

  /** null = closed; 0 = new appointment; otherwise the appointment being edited. */
  editingId: number | null = null;
  teacherId = '';
  draft: DraftScope[] = [];
  saving = false;

  removing: CoordinatorAppointment | null = null;
  removalReason = '';

  readonly scopeLabel = coordinatorScopeLabel;

  constructor(
    private coordinators: CoordinatorService,
    private teacherService: TeacherService,
    private schoolService: SchoolService,
    private sectionService: SectionService,
    private subjects: SubjectConfigService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    forkJoin({
      teachers: this.teacherService.getAllTeachers(),
      classes: this.schoolService.getManagedClasses(),
      streams: this.subjects.getStreams().pipe(catchError(() => of([] as AcademicStream[])))
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: ({ teachers, classes, streams }) => {
        this.teachers = teachers.filter(t => (t.status ?? 'ACTIVE') === 'ACTIVE')
          .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
        this.classes = classes.filter(c => c.active);
        this.streams = streams;
        this.loadAppointments();
      },
      error: err => {
        this.loading = false;
        this.loadError = apiMessage(err);
        this.cdr.markForCheck();
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadAppointments(): void {
    this.loading = true;
    this.coordinators.list(this.showHistory).pipe(takeUntil(this.destroy$)).subscribe({
      next: list => {
        this.appointments = list;
        this.loading = false;
        this.loadError = null;
        this.cdr.markForCheck();
      },
      error: err => {
        this.loading = false;
        this.loadError = apiMessage(err);
        this.cdr.markForCheck();
      }
    });
  }

  toggleHistory(): void {
    this.showHistory = !this.showHistory;
    this.loadAppointments();
  }

  get availableTeachers(): Teacher[] {
    const appointed = new Set(this.appointments.filter(a => a.active).map(a => a.teacherId));
    return this.teachers.filter(t => !appointed.has(t.teacherId));
  }

  get active(): CoordinatorAppointment[] { return this.appointments.filter(a => a.active); }
  get history(): CoordinatorAppointment[] { return this.appointments.filter(a => !a.active); }

  startNew(): void {
    this.editingId = 0;
    this.teacherId = '';
    this.draft = [{ classId: null, sectionId: null, streamId: null }];
  }

  startEdit(a: CoordinatorAppointment): void {
    this.editingId = a.id;
    this.teacherId = a.teacherId;
    this.draft = a.scope.map(s => ({ classId: s.classId, sectionId: s.sectionId, streamId: s.streamId }));
    this.draft.forEach(d => d.classId != null && this.loadSections(d.classId));
  }

  cancelEdit(): void {
    this.editingId = null;
    this.draft = [];
  }

  addRow(): void {
    this.draft = [...this.draft, { classId: null, sectionId: null, streamId: null }];
  }

  removeRow(index: number): void {
    this.draft = this.draft.filter((_, i) => i !== index);
  }

  onClassChange(row: DraftScope): void {
    row.sectionId = null;
    row.streamId = null;
    if (row.classId != null) this.loadSections(row.classId);
  }

  private loadSections(classId: number): void {
    if (this.sectionsByClass[classId]) return;
    this.sectionService.getSectionsForClass(classId).pipe(takeUntil(this.destroy$)).subscribe({
      next: sections => {
        this.sectionsByClass = { ...this.sectionsByClass, [classId]: sections.filter(s => s.active) };
        this.cdr.markForCheck();
      },
      error: () => {
        this.sectionsByClass = { ...this.sectionsByClass, [classId]: [] };
        this.cdr.markForCheck();
      }
    });
  }

  isStreamClass(classId: number | null): boolean {
    return this.classes.some(c => c.id === classId && c.streamEligible);
  }

  get canSave(): boolean {
    return !this.saving && (this.editingId !== 0 || !!this.teacherId)
      && this.draft.length > 0 && this.draft.every(d => d.classId != null);
  }

  save(): void {
    if (!this.canSave || this.editingId == null) return;
    const scope: CoordinatorScopeRequest[] = this.draft.map(d => ({ classId: d.classId!, sectionId: d.sectionId, streamId: d.streamId }));
    const save$ = this.editingId === 0
      ? this.coordinators.appoint(this.teacherId, scope)
      : this.coordinators.updateScope(this.editingId, scope);
    this.saving = true;
    save$.pipe(takeUntil(this.destroy$)).subscribe({
      next: saved => {
        this.saving = false;
        this.toast.success(this.editingId === 0 ? 'Coordinator appointed' : 'Coordinator scope updated',
          `${saved.teacherName ?? saved.teacherId} — ${saved.scope.map(s => this.scopeLabel(s)).join(', ')}`);
        this.cancelEdit();
        this.loadAppointments();
      },
      error: err => {
        this.saving = false;
        this.toast.error('Could not save', apiMessage(err));
        this.cdr.markForCheck();
      }
    });
  }

  startRemove(a: CoordinatorAppointment): void {
    this.removing = a;
    this.removalReason = '';
  }

  confirmRemove(): void {
    const target = this.removing;
    const reason = this.removalReason.trim();
    if (!target || !reason) return;
    this.saving = true;
    this.coordinators.remove(target.id, reason).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.saving = false;
        this.removing = null;
        this.toast.success('Appointment ended', `${target.teacherName ?? target.teacherId} is no longer a Coordinator. Their teaching work is unchanged.`);
        this.loadAppointments();
      },
      error: err => {
        this.saving = false;
        this.toast.error('Could not end the appointment', apiMessage(err));
        this.cdr.markForCheck();
      }
    });
  }

  teacherName(id: string): string {
    return this.teachers.find(t => t.teacherId === id)?.name ?? id;
  }
}
