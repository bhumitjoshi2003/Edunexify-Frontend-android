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
import { CoordinatorAppointment, CoordinatorScopeEntry, CoordinatorScopeRequest, coordinatorScopeLabel } from '../../interfaces/coordinator';
import { apiMessage } from '../academic-session-selector/academic-session-selector.component';

/**
 * One chosen class. No section chip selected = every section of the class; no stream chip selected =
 * every stream. A class whose existing scope is not a plain sections × streams selection is kept
 * exactly as it was (`custom`) so editing never silently widens or narrows it.
 */
export interface ClassPick {
  classId: number;
  sections: number[];
  streams: number[];
  custom: CoordinatorScopeRequest[] | null;
}

/**
 * Admin / Principal: appoint teachers as Coordinators, change what they cover and end appointments
 * (with a reason). The teacher keeps one account and all teaching work.
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
  picks: ClassPick[] = [];
  saving = false;

  removing: CoordinatorAppointment | null = null;
  removalReason = '';

  readonly scopeLabel = coordinatorScopeLabel;
  readonly skeletons = [1, 2, 3];

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
        this.classes = classes.filter(c => c.active).sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
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
    this.coordinators.list(true).pipe(takeUntil(this.destroy$)).subscribe({
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

  toggleHistory(): void { this.showHistory = !this.showHistory; }

  get availableTeachers(): Teacher[] {
    const appointed = new Set(this.appointments.filter(a => a.active).map(a => a.teacherId));
    return this.teachers.filter(t => !appointed.has(t.teacherId));
  }

  get active(): CoordinatorAppointment[] { return this.appointments.filter(a => a.active); }
  get history(): CoordinatorAppointment[] { return this.appointments.filter(a => !a.active); }

  initials(name: string | null, fallback: string): string {
    const parts = (name || fallback).trim().split(/\s+/).filter(Boolean);
    return (parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] ?? '?').slice(0, 2)).toUpperCase();
  }

  // ── Editor ────────────────────────────────────────────────────────

  startNew(): void {
    this.removing = null;
    this.editingId = 0;
    this.teacherId = '';
    this.picks = [];
  }

  startEdit(a: CoordinatorAppointment): void {
    this.removing = null;
    this.editingId = a.id;
    this.teacherId = a.teacherId;
    this.picks = this.picksFromScope(a.scope);
    this.picks.forEach(p => this.loadSections(p.classId));
  }

  cancelEdit(): void {
    this.editingId = null;
    this.picks = [];
  }

  /** Groups scope entries by class; anything that is not a plain sections × streams selection stays as stored. */
  private picksFromScope(scope: CoordinatorScopeEntry[]): ClassPick[] {
    const byClass = new Map<number, CoordinatorScopeEntry[]>();
    scope.forEach(s => byClass.set(s.classId, [...(byClass.get(s.classId) ?? []), s]));
    const result: ClassPick[] = [];
    byClass.forEach((rows, classId) => {
      const sections = [...new Set(rows.filter(r => r.sectionId != null).map(r => r.sectionId!))];
      const streams = [...new Set(rows.filter(r => r.streamId != null).map(r => r.streamId!))];
      const sectionsAllSet = rows.every(r => r.sectionId != null) || rows.every(r => r.sectionId == null);
      const streamsAllSet = rows.every(r => r.streamId != null) || rows.every(r => r.streamId == null);
      const product = Math.max(sections.length, 1) * Math.max(streams.length, 1);
      const plain = sectionsAllSet && streamsAllSet && rows.length === product;
      result.push({
        classId, sections, streams,
        custom: plain ? null : rows.map(r => ({ classId: r.classId, sectionId: r.sectionId, streamId: r.streamId }))
      });
    });
    return this.sorted(result);
  }

  private sorted(picks: ClassPick[]): ClassPick[] {
    const order = (id: number) => this.classes.findIndex(c => c.id === id);
    return [...picks].sort((a, b) => order(a.classId) - order(b.classId));
  }

  isPicked(classId: number): boolean { return this.picks.some(p => p.classId === classId); }

  pickOf(classId: number): ClassPick | undefined { return this.picks.find(p => p.classId === classId); }

  toggleClass(c: SchoolClass): void {
    if (this.isPicked(c.id)) {
      this.picks = this.picks.filter(p => p.classId !== c.id);
    } else {
      this.picks = this.sorted([...this.picks, { classId: c.id, sections: [], streams: [], custom: null }]);
      this.loadSections(c.id);
    }
  }

  removePick(p: ClassPick): void { this.picks = this.picks.filter(x => x.classId !== p.classId); }

  get allPicked(): boolean { return this.classes.length > 0 && this.picks.length === this.classes.length; }

  toggleAllClasses(): void {
    if (this.allPicked) {
      this.picks = [];
      return;
    }
    const existing = new Map(this.picks.map(p => [p.classId, p]));
    this.picks = this.classes.map(c => existing.get(c.id) ?? { classId: c.id, sections: [], streams: [], custom: null });
    this.classes.forEach(c => this.loadSections(c.id));
  }

  /** null = "All sections". Picking every section individually is the same as all, so it collapses back. */
  toggleSection(pick: ClassPick, sectionId: number | null): void {
    if (pick.custom) return;
    if (sectionId == null) {
      pick.sections = [];
    } else {
      const next = pick.sections.includes(sectionId) ? pick.sections.filter(id => id !== sectionId) : [...pick.sections, sectionId];
      const total = this.sectionsOf(pick.classId).length;
      pick.sections = total > 0 && next.length === total ? [] : next;
    }
    this.picks = [...this.picks];
  }

  toggleStream(pick: ClassPick, streamId: number | null): void {
    if (pick.custom) return;
    if (streamId == null) {
      pick.streams = [];
    } else {
      const next = pick.streams.includes(streamId) ? pick.streams.filter(id => id !== streamId) : [...pick.streams, streamId];
      pick.streams = next.length === this.streams.length ? [] : next;
    }
    this.picks = [...this.picks];
  }

  sectionsOf(classId: number): { id: number; name: string }[] {
    return (this.sectionsByClass[classId] ?? []).filter(s => s.id != null).map(s => ({ id: s.id as number, name: s.name }));
  }

  isStreamClass(classId: number | null): boolean {
    return this.streams.length > 0 && this.classes.some(c => c.id === classId && c.streamEligible);
  }

  className(classId: number): string { return this.classes.find(c => c.id === classId)?.name ?? String(classId); }

  /** Short description of one chosen class, e.g. "all sections" or "A, C". */
  pickSummary(p: ClassPick): string {
    if (p.custom) return 'Custom scope';
    const secs = p.sections.length ? this.sectionsOf(p.classId).filter(s => p.sections.includes(s.id)).map(s => s.name).join(', ') : 'All sections';
    const strs = p.streams.length ? ' · ' + this.streams.filter(s => p.streams.includes(s.id)).map(s => s.streamName).join(', ') : '';
    return secs + strs;
  }

  /** The scope rows the server expects, with no duplicates by construction. */
  toRequests(): CoordinatorScopeRequest[] {
    const rows: CoordinatorScopeRequest[] = [];
    for (const p of this.picks) {
      if (p.custom) { rows.push(...p.custom); continue; }
      const secs: (number | null)[] = p.sections.length ? p.sections : [null];
      const strs: (number | null)[] = p.streams.length ? p.streams : [null];
      for (const sectionId of secs) for (const streamId of strs) rows.push({ classId: p.classId, sectionId, streamId });
    }
    return rows;
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

  get canSave(): boolean {
    return !this.saving && (this.editingId !== 0 || !!this.teacherId) && this.picks.length > 0;
  }

  /** Why Save is unavailable, shown quietly under the picker. */
  get saveHint(): string | null {
    if (this.editingId === 0 && !this.teacherId) return 'Choose a teacher.';
    if (!this.picks.length) return 'Select at least one class.';
    return null;
  }

  save(): void {
    if (!this.canSave || this.editingId == null) return;
    const scope = this.toRequests();
    const isNew = this.editingId === 0;
    const save$ = isNew ? this.coordinators.appoint(this.teacherId, scope) : this.coordinators.updateScope(this.editingId, scope);
    this.saving = true;
    save$.pipe(takeUntil(this.destroy$)).subscribe({
      next: saved => {
        this.saving = false;
        this.toast.success(isNew ? 'Coordinator appointed' : 'Scope updated',
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

  // ── Ending an appointment ─────────────────────────────────────────

  startRemove(a: CoordinatorAppointment): void {
    this.cancelEdit();
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
    return this.teachers.find(t => t.teacherId === id)?.name ?? this.appointments.find(a => a.teacherId === id)?.teacherName ?? id;
  }
}
