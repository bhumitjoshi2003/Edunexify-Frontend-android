import { ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, forkJoin, Observable, switchMap } from 'rxjs';
import { AcademicSession } from '../../interfaces/academic-session';
import { Teacher } from '../../interfaces/teacher';
import { Section } from '../../interfaces/section';
import { SchoolClass } from '../../services/school.service';
import { AcademicSessionService } from '../../services/academic-session.service';
import { SectionService } from '../../services/section.service';
import { TimetableService } from '../../services/timetable.service';
import { ClassTeacherResponsibilityService } from '../../services/class-teacher-responsibility.service';
import { ToastService } from '../../services/toast.service';
import { Responsibility, ResponsibilityRequest, SessionCopyResult, ActivationPreview, ActivationApply } from '../../interfaces/teaching-configuration';
import { apiMessage, writableSession, sessionKind } from '../academic-session-selector/academic-session-selector.component';

@Component({
  selector: 'app-teaching-configuration', standalone: true, imports: [CommonModule, FormsModule],
  templateUrl: './teaching-configuration.component.html',
  styleUrl: './teaching-configuration.component.css'
})
export class TeachingConfigurationComponent implements OnChanges, OnDestroy {
  @Input() session: AcademicSession | null = null;
  @Input() classes: SchoolClass[] = [];
  @Input() teachers: Teacher[] = [];

  /** Only ACTIVE teachers can hold a class-teacher responsibility (the backend enforces the same rule). */
  get eligibleTeachers(): Teacher[] {
    return this.teachers.filter(t => t.status === 'ACTIVE');
  }
  @Output() timetableCopied = new EventEmitter<void>();
  /** Presentational only — which sections are visually expanded. Content stays in the DOM
   *  either way (collapse is CSS-only, not *ngIf) so nothing here affects data/behavior. */
  expanded = { copy: false, responsibilities: true, activation: true };
  toggleSection(key: 'copy' | 'responsibilities' | 'activation'): void {
    this.expanded[key] = !this.expanded[key];
  }
  sessions: AcademicSession[] = [];
  rows: Responsibility[] = [];
  sections: Section[] = [];
  sectionsLoaded = false;
  classId: number | null = null;
  sectionId: number | null = null;
  teacherId = '';
  editingId: number | null = null;
  sourceId: number | null = null;
  targetId: number | null = null;
  copyResult: SessionCopyResult | null = null;
  copyType = '';
  preview: ActivationPreview | null = null;
  applied: ActivationApply | null = null;
  error = '';
  @Output() busyChange = new EventEmitter<boolean>();
  private working = false;
  get busy(): boolean { return this.working; }
  set busy(value: boolean) { this.working = value; this.busyChange.emit(value); }
  loading = false;
  kind = sessionKind;
  writable = writableSession;
  sessionLabel(id: number | null): string {
    return this.sessions.find(s => s.id === id)?.label ?? '';
  }
  private destroy$ = new Subject<void>();
  private reload$ = new Subject<void>();
  private sectionChange$ = new Subject<void>();
  private destroyed = false;
  /** This panel is hosted inside the OnPush TimetableComponent, so state set by an async response
   *  (sections, rows, preview, results, errors) is only rendered once the view is marked for check. */
  constructor(private service: ClassTeacherResponsibilityService, private timetable: TimetableService,
    private academics: AcademicSessionService, private sectionService: SectionService, private toast: ToastService,
    private cdr: ChangeDetectorRef) {}
  ngOnChanges(): void {
    this.reload$.next(); this.sectionChange$.next();
    this.rows = []; this.preview = null; this.applied = null; this.error = ''; this.copyResult = null;
    this.resetForm(); this.targetId = this.session?.id ?? null;
    this.refresh();
  }
  canWrite(): boolean { return writableSession(this.session) && !this.busy && !this.loading; }
  canSave(): boolean {
    return this.canWrite() && !!this.classId && !!this.teacherId && this.sectionsLoaded
      && (this.sections.length ? this.sections.some(s => s.id === this.sectionId) : this.sectionId == null);
  }
  refresh(): void {
    this.preview = null;
    this.reload$.next();
    if (!this.session) { this.loading = false; return; }
    const id = this.session.id;
    this.loading = true;
    forkJoin({ rows: this.service.list(id), sessions: this.academics.getAllSessions() })
      .pipe(takeUntil(this.reload$), takeUntil(this.destroy$)).subscribe({
        next: data => { this.rows = data.rows; this.sessions = data.sessions; this.loading = false; this.cdr.markForCheck(); },
        error: err => { this.error = apiMessage(err); this.loading = false; this.cdr.markForCheck(); }
      });
  }
  resetForm(): void {
    this.sectionChange$.next(); this.editingId = null; this.classId = null;
    this.sectionId = null; this.teacherId = ''; this.sections = []; this.sectionsLoaded = false;
  }
  classChanged(retainSection: number | null = null): void {
    this.sectionChange$.next(); this.sections = []; this.sectionsLoaded = false; this.sectionId = retainSection;
    if (!this.classId) return;
    this.sectionService.getSectionsForClass(this.classId)
      .pipe(takeUntil(this.sectionChange$), takeUntil(this.destroy$)).subscribe({
        next: sections => { this.sections = sections.filter(s => s.active); this.sectionsLoaded = true; this.cdr.markForCheck(); },
        error: err => { this.error = apiMessage(err); this.cdr.markForCheck(); }
      });
  }
  edit(row: Responsibility): void {
    if (!this.canWrite() || row.academicSessionId !== this.session?.id) return;
    this.editingId = row.id; this.classId = row.classId; this.teacherId = row.configuredTeacherId;
    this.classChanged(row.sectionId);
  }
  save(): void {
    if (!this.canSave()) return;
    const body: ResponsibilityRequest = { academicSessionId: this.session!.id, classId: this.classId!, sectionId: this.sectionId, teacherId: this.teacherId };
    this.mutate(this.editingId == null ? this.service.create(body) : this.service.update(this.editingId, body), () => this.resetForm());
  }
  async remove(row: Responsibility): Promise<void> {
    if (!this.canWrite()) return;
    const id = this.session!.id;
    const confirmed = await this.toast.confirm({ title: 'Delete configured responsibility?', message: `${row.className} ${row.sectionName ?? ''}: ${row.configuredTeacherName ?? row.configuredTeacherId}. Live access changes only on activation.`, confirmText: 'Delete', danger: true });
    if (!confirmed || this.destroyed || !this.canWrite() || this.session?.id !== id) return;
    this.mutate(this.service.delete(row.id, id));
  }
  private mutate<T>(request: Observable<T>, done: (result: T) => void = () => {}): void {
    this.busy = true; this.error = ''; this.preview = null; this.applied = null; this.cdr.markForCheck();
    request.pipe(takeUntil(this.destroy$)).subscribe({
      next: result => { this.busy = false; done(result); this.refresh(); this.cdr.markForCheck(); },
      error: err => { this.busy = false; this.error = apiMessage(err); this.cdr.markForCheck(); }
    });
  }
  canCopy(): boolean {
    return !this.busy && !this.loading && !!this.sourceId && this.sourceId !== this.targetId
      && this.sessions.some(s => s.id === this.sourceId)
      && writableSession(this.sessions.find(s => s.id === this.targetId) ?? null);
  }
  async copy(type: 'timetable' | 'responsibilities'): Promise<void> {
    if (!this.canCopy()) return;
    const source = this.sessions.find(s => s.id === this.sourceId)!;
    const target = this.sessions.find(s => s.id === this.targetId)!;
    const conflictNote = type === 'timetable'
      ? 'Existing target rows are preserved; any number of periods may share the same slot.'
      : 'Existing target rows will be preserved; conflicts will be reported.';
    const confirmed = await this.toast.confirm({ title: `Copy ${type}?`, message: `${source.label} → ${target.label}. ${conflictNote}${type === 'timetable' && target.current ? ' This adds periods to the CURRENT operational timetable.' : ''}`, confirmText: 'Copy' });
    if (!confirmed || this.destroyed || !this.canCopy() || source.id !== this.sourceId || target.id !== this.targetId) return;
    const body = { sourceAcademicSessionId: source.id, targetAcademicSessionId: target.id };
    this.copyResult = null;
    this.mutate(type === 'timetable' ? this.timetable.copySession({ ...body, confirmCurrentTarget: target.current }) : this.service.copy(body), result => {
      this.copyType = type; this.copyResult = result;
      if (type === 'timetable') this.timetableCopied.emit();
    });
  }
  loadPreview(): void {
    if (!this.session?.current || this.busy) return;
    const id = this.session.id;
    this.preview = null; this.error = '';
    this.service.preview().pipe(takeUntil(this.reload$), takeUntil(this.destroy$)).subscribe({
      next: result => {
        if (result.academicSessionId !== id) { this.error = 'The current session changed. Refresh the session selection.'; this.cdr.markForCheck(); return; }
        this.preview = result; this.cdr.markForCheck();
      }, error: err => { this.error = apiMessage(err); this.cdr.markForCheck(); }
    });
  }
  async apply(): Promise<void> {
    if (!this.session?.current || !this.preview || this.busy) return;
    const id = this.session.id;
    const confirmed = await this.toast.confirm({ title: `Apply ${this.session.label} class-teacher configuration?`, message: `This replaces live class-teacher access: ${this.preview.becomingLive} gains, ${this.preview.changing} changes, ${this.preview.clearing} removals. Ineligible or invalid rows are reported and protected slots remain unchanged. Direct Teacher edits are immediately live and may be replaced.`, confirmText: 'Apply to current session', danger: true });
    if (!confirmed || this.destroyed || this.session?.id !== id || !this.session.current || this.busy) return;
    this.busy = true; this.error = ''; this.cdr.markForCheck();
    // Recheck authority just before calling the parameterless current-session endpoint.
    this.academics.getCurrentSession().pipe(switchMap(current => {
      if (current.id !== id) throw new Error('The current session changed. Refresh and preview again.');
      return this.service.apply();
    }), takeUntil(this.destroy$)).subscribe({
      next: result => { this.busy = false; this.applied = result; this.preview = null; this.refresh(); this.cdr.markForCheck(); },
      error: err => { this.busy = false; this.error = apiMessage(err, err.message); this.cdr.markForCheck(); }
    });
  }
  ngOnDestroy(): void { this.destroyed = true; this.destroy$.next(); this.destroy$.complete(); this.reload$.complete(); this.sectionChange$.complete(); }
}
