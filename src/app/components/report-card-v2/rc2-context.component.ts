import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { AcademicSessionService } from '../../services/academic-session.service';
import { SchoolService, SchoolClass } from '../../services/school.service';
import { SectionService } from '../../services/section.service';
import { TeacherService } from '../../services/teacher.service';
import { AuthStateService } from '../../auth/auth-state.service';
import { ReportCardV2Service, ReportCardSetup } from '../../services/report-card-v2.service';
import { Section } from '../../interfaces/section';
import { AcademicSession } from '../../interfaces/academic-session';

export interface Rc2Context {
  session: AcademicSession | null;
  schoolClass: SchoolClass | null;
  sectionId: number | null;
  setup: ReportCardSetup | null;
  setups: ReportCardSetup[];
}

/**
 * Report Card V2 filter bar shared by Setup, Remarks and Generate & Preview: session, class
 * (a teacher only ever gets their own class), optional section and optional report card.
 */
@Component({
  selector: 'app-rc2-context',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rc2-filter-bar rc2-filters">
      <label class="rc2-field">
        <span>Session</span>
        <select class="rc2-select" [(ngModel)]="sessionId" (ngModelChange)="onSessionOrClass()" aria-label="Academic session">
          <option *ngFor="let s of sessions" [ngValue]="s.id">{{ s.label }}{{ s.current ? ' (current)' : '' }}</option>
        </select>
      </label>
      <label class="rc2-field">
        <span>Class</span>
        <select class="rc2-select" [(ngModel)]="classId" (ngModelChange)="onSessionOrClass()" [disabled]="isTeacher" aria-label="Class">
          <option [ngValue]="null" *ngIf="!isTeacher">— Select class —</option>
          <option *ngFor="let c of classes" [ngValue]="c.id">Class {{ c.name }}</option>
        </select>
      </label>
      <label class="rc2-field" *ngIf="showSection && sections.length > 0 && !isTeacher">
        <span>Section</span>
        <select class="rc2-select" [(ngModel)]="sectionId" (ngModelChange)="emit()" aria-label="Section">
          <option [ngValue]="null">All sections</option>
          <option *ngFor="let s of sections" [ngValue]="s.id">{{ s.name }}</option>
        </select>
      </label>
      <label class="rc2-field" *ngIf="showSetup">
        <span>Report card</span>
        <select class="rc2-select" [(ngModel)]="setupId" (ngModelChange)="emit()" [disabled]="setups.length === 0" aria-label="Report card">
          <option [ngValue]="null">{{ setups.length ? '— Select report card —' : 'No report cards set up' }}</option>
          <option *ngFor="let s of setups" [ngValue]="s.id">{{ s.name }}</option>
        </select>
      </label>
    </div>
    <p class="rc2-error rc2-note" *ngIf="isTeacher && noClass" role="status">You are not a class teacher, so there are no report cards to show.</p>
  `,
  styleUrls: ['./rc2-shared.css'],
  styles: [`
    .rc2-filters { display: flex; flex-wrap: wrap; gap: 14px; align-items: flex-end; }
    .rc2-filters .rc2-field { flex: 1 1 170px; min-width: 150px; max-width: 280px; }
    .rc2-filters .rc2-field > span { font-size: 0.78rem; font-weight: 700; color: var(--rc2-accent); text-transform: uppercase; letter-spacing: 0.5px; }
    .rc2-note { margin-top: 10px; }
    @media (max-width: 600px) { .rc2-filters .rc2-field { max-width: none; } }
  `],
})
export class Rc2ContextComponent implements OnInit, OnDestroy {
  @Input() showSection = false;
  @Input() showSetup = false;
  @Output() contextChange = new EventEmitter<Rc2Context>();

  sessions: AcademicSession[] = [];
  classes: SchoolClass[] = [];
  sections: Section[] = [];
  setups: ReportCardSetup[] = [];
  sessionId: number | null = null;
  classId: number | null = null;
  sectionId: number | null = null;
  setupId: number | null = null;
  isTeacher = false;
  noClass = false;
  private destroy$ = new Subject<void>();

  constructor(
    private sessionsApi: AcademicSessionService,
    private schoolApi: SchoolService,
    private sectionApi: SectionService,
    private teacherApi: TeacherService,
    private auth: AuthStateService,
    private api: ReportCardV2Service,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.isTeacher = this.auth.getUserRole() === 'TEACHER';
    this.sessionsApi.getAllSessions().pipe(takeUntil(this.destroy$)).subscribe(sessions => {
      this.sessions = sessions;
      this.sessionId = sessions.find(s => s.current)?.id ?? sessions[0]?.id ?? null;
      this.loadClasses();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadClasses(): void {
    this.schoolApi.getManagedClasses().pipe(takeUntil(this.destroy$)).subscribe(classes => {
      if (!this.isTeacher) {
        this.classes = classes;
        this.cdr.markForCheck();
        this.emit();
        return;
      }
      this.teacherApi.getTeacher(this.auth.getUserId()).pipe(takeUntil(this.destroy$)).subscribe(t => {
        const own = classes.find(c => c.name === t.classTeacher);
        this.classes = own ? [own] : [];
        this.classId = own?.id ?? null;
        this.noClass = !own;
        this.onSessionOrClass();
      });
    });
  }

  onSessionOrClass(): void {
    this.sectionId = null;
    this.setupId = null;
    this.sections = [];
    this.setups = [];
    this.cdr.markForCheck();
    if (this.classId == null || this.sessionId == null) { this.emit(); return; }
    if (this.showSection && !this.isTeacher) {
      this.sectionApi.getSectionsForClass(this.classId).pipe(takeUntil(this.destroy$)).subscribe(sections => {
        this.sections = sections;
        this.cdr.markForCheck();
      });
    }
    if (this.showSetup) {
      this.api.listSetups(this.sessionId, this.classId).pipe(takeUntil(this.destroy$)).subscribe(setups => {
        this.setups = setups;
        this.setupId = setups.length === 1 ? setups[0].id : null;
        this.cdr.markForCheck();
        this.emit();
      });
    } else {
      this.emit();
    }
  }

  /** Lets a parent screen refresh the report-card list (e.g. after creating one). */
  reloadSetups(selectId: number | null = null): void {
    if (this.classId == null || this.sessionId == null) return;
    this.api.listSetups(this.sessionId, this.classId).pipe(takeUntil(this.destroy$)).subscribe(setups => {
      this.setups = setups;
      this.setupId = selectId;
      this.cdr.markForCheck();
      this.emit();
    });
  }

  emit(): void {
    this.contextChange.emit({
      session: this.sessions.find(s => s.id === this.sessionId) ?? null,
      schoolClass: this.classes.find(c => c.id === this.classId) ?? null,
      sectionId: this.sectionId,
      setup: this.setups.find(s => s.id === this.setupId) ?? null,
      setups: this.setups,
    });
  }
}
