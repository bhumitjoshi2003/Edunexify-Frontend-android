import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, switchMap, catchError, EMPTY } from 'rxjs';
import { TimetableService, TimetableTimingConfig, TimetableTimingPeriod, TimetableTimingProfile } from '../../services/timetable.service';
import { TeacherService } from '../../services/teacher.service';
import { AuthStateService } from '../../auth/auth-state.service';
import { StudentService } from '../../services/student.service';
import { LoggerService } from '../../services/logger.service';
import { TimetableEntry, TimetableEntryRequest } from '../../interfaces/timetable';
import { Teacher } from '../../interfaces/teacher';
import { ToastService } from '../../services/toast.service';
import { Capacitor } from '@capacitor/core';
import { SchoolService, SchoolClass } from '../../services/school.service';
import { SectionService } from '../../services/section.service';
import { Section } from '../../interfaces/section';
import { ActivatedRoute, Router } from '@angular/router';
import { ParentChildContextComponent } from '../parent-child-context/parent-child-context.component';
import { ChildAccess } from '../../interfaces/parent-portal';
import { TeacherClassGrantService } from '../../services/teacher-class-grant.service';

import { AcademicSession } from '../../interfaces/academic-session';
import { AcademicSessionSelectorComponent, writableSession, apiMessage } from '../academic-session-selector/academic-session-selector.component';
import { TeachingConfigurationComponent } from '../teaching-configuration/teaching-configuration.component';
import { subjectIcon, subjectAccentClass } from '../../utils/subject-visual.util';

@Component({
  selector: 'app-timetable',
  standalone: true,
  imports: [CommonModule, FormsModule, ParentChildContextComponent, AcademicSessionSelectorComponent, TeachingConfigurationComponent],
  templateUrl: './timetable.component.html',
  styleUrl: './timetable.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TimetableComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  canEditEntry(entry: TimetableEntry): boolean {
    return this.canWrite() || (this.isTeacher() && entry.teacherId === this.userId
      && !!entry.academicSessionId && this.teacherEntries.some(e => e.id === entry.id));
  }

  role = '';
  userId = '';
  userClassName = '';
  activeTab: 'timetable' | 'setup' = 'timetable';

  private static readonly DAY_LABELS: Record<string, string> = {
    MONDAY: 'Monday', TUESDAY: 'Tuesday', WEDNESDAY: 'Wednesday',
    THURSDAY: 'Thursday', FRIDAY: 'Friday', SATURDAY: 'Saturday', SUNDAY: 'Sunday'
  };
  private static readonly DAY_ABBR: Record<string, string> = {
    MONDAY: 'Mon', TUESDAY: 'Tue', WEDNESDAY: 'Wed',
    THURSDAY: 'Thu', FRIDAY: 'Fri', SATURDAY: 'Sat', SUNDAY: 'Sun'
  };
  private static readonly DAY_LETTER: Record<string, string> = {
    MONDAY: 'M', TUESDAY: 'T', WEDNESDAY: 'W',
    THURSDAY: 'T', FRIDAY: 'F', SATURDAY: 'S', SUNDAY: 'S'
  };

  days: string[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  dayLabels: Record<string, string> = TimetableComponent.DAY_LABELS;
  dayAbbr: Record<string, string> = TimetableComponent.DAY_ABBR;
  dayLetter: Record<string, string> = TimetableComponent.DAY_LETTER;
  allPeriods: number[] = Array.from({ length: 8 }, (_, i) => i + 1);

  managedClasses: SchoolClass[] = [];
  sections: Section[] = [];
  selectedClass = '';
  selectedClassId: number | null = null;
  selectedSession: AcademicSession | null = null;
  configurationBusy = false;
  sectionsLoaded = false;
  private selectionChanged$ = new Subject<void>();
  private classRead$ = new Subject<{ className: string; sectionId: number | null; studentId: string | null; academicSessionId?: number } | null>();
  private destroyed = false;
  get initialSessionId(): number | null { return Number(this.route.snapshot.queryParamMap.get('academicSessionId')) || null; }
  canManage(): boolean { return this.role === 'ADMIN'; }
  canWrite(): boolean { return this.canManage() && writableSession(this.selectedSession); }
  canAdd(): boolean { return this.canWrite() && !!this.selectedClassId && this.sectionsLoaded && (this.sections.length ? this.sections.some(s => s.id === this.selectedSectionId) : this.selectedSectionId == null); }
  onSessionSelected(session: AcademicSession | null): void {
    this.classRead$.next(null);
    this.selectedSession = session; this.showModal = false; this.showGrantModal = false;
    this.entries = []; this.isLoading = false; this.loadClassTimetable(); this.cdr.markForCheck();
  }
  selectedSectionId: number | null = null;
  selectedDay = 'MONDAY';
  todayDay = '';
  userName = '';

  /** Distinct class+section combos a TEACHER already has a real relationship with (they
   *  already teach it, or are its class-teacher) — the only options they may add a period
   *  into. The backend enforces this independently; this only scopes what's offered. */
  myClasses: { classId?: number; className: string; sectionId: number | null; sectionName: string | null }[] = [];

  showTimes = true;
  centralTimingActive = false;
  activeTimingProfileName: string | null = null;
  timingConfig: TimetableTimingConfig | null = null;
  timingLoading = false;
  timingError = '';
  timingProfileId: number | null = null;
  timingProfileName = '';
  timingDraft: TimetableTimingPeriod[] = [];
  newTimingProfileName = 'Winter Schedule';
  private timingByPeriod = new Map<number, TimetableTimingPeriod>();

  entries: TimetableEntry[] = [];
  teacherEntries: TimetableEntry[] = [];
  teacherGrid: Record<string, TimetableEntry[]> = {};

  isLoading = false;
  error: string | null = null;
  teachers: Teacher[] = [];

  showModal = false;
  isEditMode = false;
  modalForm: TimetableEntry = this.emptyForm();
  modalError: string | null = null;
  modalSaving = false;

  /** Admin-only "Grant Teacher Access" modal — separate from the period modal above since its
   *  fields are entirely different (just a teacher, against the already-selected class). */
  showGrantModal = false;
  grantTeacherId = '';
  grantError: string | null = null;
  grantSaving = false;

  constructor(
    private timetableService: TimetableService,
    private teacherService: TeacherService,
    private authStateService: AuthStateService,
    private studentService: StudentService,
    private logger: LoggerService,
    private cdr: ChangeDetectorRef,
    private toast: ToastService,
    private schoolService: SchoolService,
    private sectionService: SectionService,
    private route: ActivatedRoute,
    private router: Router,
    private teacherClassGrantService: TeacherClassGrantService
  ) {
    this.classRead$.pipe(
      switchMap(query => query ? this.timetableService.getClassTimetable(
        query.className, query.sectionId, query.studentId, query.academicSessionId
      ).pipe(catchError(err => {
        this.error = apiMessage(err); this.isLoading = false; this.cdr.markForCheck();
        return EMPTY;
      })) : EMPTY),
      takeUntil(this.destroy$)
    ).subscribe(data => {
      this.entries = data; this.isLoading = false; this.cdr.markForCheck();
    });
  }

  ngOnInit(): void {
    const user = this.authStateService.getUser();
    this.role = user?.role ?? '';
    this.userId = user?.userId ?? '';
    this.userClassName = user?.className ?? '';
    this.userName = user?.name ?? '';
    this.loadTimingDisplay();
    if (this.canManage()) this.loadTimingConfig();

    const dayMap = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
    this.todayDay = dayMap[new Date().getDay()];
    this.selectedDay = this.days.includes(this.todayDay) ? this.todayDay : this.days[0];

    // Load school settings (working days)
    this.schoolService.getSettings().pipe(takeUntil(this.destroy$)).subscribe({
      next: (settings) => {
        if (settings.workingDays) {
          this.days = settings.workingDays.split(',').filter(d => d.trim()).map(d => d.trim().toUpperCase());
        }
        if (!this.days.includes(this.selectedDay)) {
          this.selectedDay = this.days.includes(this.todayDay) ? this.todayDay : this.days[0] ?? 'MONDAY';
        }
        this.cdr.markForCheck();
      },
      error: (err) => this.logger.error('Failed to load school settings', err)
    });

    if (this.isAdmin()) {
      this.schoolService.getManagedClasses().pipe(takeUntil(this.destroy$)).subscribe({
        next: managed => {
          this.managedClasses = managed;
          if (managed.length && !this.selectedClassId) {
            this.selectedClassId = managed[0].id;
            this.onClassChange();
          }
          this.cdr.markForCheck();
        },
        error: err => { this.error = apiMessage(err); this.cdr.markForCheck(); }
      });
      if (this.canManage()) this.loadTeachers();
    }

    if (this.isTeacher()) {
      this.schoolService.getManagedClasses().pipe(takeUntil(this.destroy$)).subscribe({
        next: classes => { this.managedClasses = classes; this.loadTeacherTimetable(); },
        error: err => { this.logger.error('Failed to load canonical class choices', err); this.loadTeacherTimetable(); }
      });
    }

    if (this.isStudent()) {
      this.selectedClass = this.userClassName;
      // Fetch the student's section so we filter the timetable to their section
      this.studentService.getStudent(this.userId).pipe(takeUntil(this.destroy$)).subscribe({
        next: (student) => {
          this.selectedSectionId = student.sectionId ?? null;
          this.loadClassTimetable();
        },
        error: () => {
          // Fall back to class-wide timetable if profile fetch fails
          this.loadClassTimetable();
        }
      });
    }

    if (this.isParent()) {
      const studentId = this.route.snapshot.queryParamMap.get('studentId') ?? '';
      const className = this.route.snapshot.queryParamMap.get('className') ?? '';
      if (!studentId || !className) {
        this.error = 'Select a child from the parent dashboard to view their timetable.';
      } else {
        this.userId = studentId;
        this.selectedClass = className;
        this.loadClassTimetable();
      }
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.selectionChanged$.next(); this.selectionChanged$.complete();
    this.classRead$.next(null); this.classRead$.complete();
    this.destroy$.next();
    this.destroy$.complete();
  }

  onChildTabSelected(child: ChildAccess): void {
    if (!child.canViewTimetable) {
      this.toast.error('Timetable access unavailable', 'Please contact the school administrator.');
      return;
    }
    this.userId = child.studentId;
    this.selectedClass = child.className;
    this.error = null;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { studentId: child.studentId, className: child.className },
      replaceUrl: true,
    });
    this.loadClassTimetable();
  }

  isStudent(): boolean { return this.role === 'STUDENT'; }
  isParent(): boolean { return this.role === 'PARENT'; }
  isTeacher(): boolean { return this.role === 'TEACHER'; }
  isAdmin(): boolean {
    return this.role === 'ADMIN' || this.role === 'SUB_ADMIN' || this.role === 'SUPER_ADMIN';
  }

  onDaySelect(day: string): void {
    this.selectedDay = day;
    this.cdr.markForCheck();
  }

  onClassChange(): void {
    this.selectionChanged$.next(); this.classRead$.next(null);
    this.selectedClass = this.managedClasses.find(c => c.id === this.selectedClassId)?.name ?? '';
    this.showModal = false; this.sectionsLoaded = false; this.isLoading = false;
    this.sections = [];
    this.selectedSectionId = null;
    this.entries = [];
    if (!this.selectedClass) { this.cdr.markForCheck(); return; }
    this.loadSectionsForClass(this.selectedClass, () => this.loadClassTimetable());
  }

  onSectionChange(): void {
    this.loadClassTimetable();
  }

  private loadSectionsForClass(className: string, then?: () => void): void {
    const cls = this.managedClasses.find(c => c.id === this.selectedClassId);
    if (!cls) { then?.(); return; }
    this.sectionService.getSectionsForClass(cls.id)
      .pipe(takeUntil(this.selectionChanged$), takeUntil(this.destroy$)).subscribe({
        next: (secs) => {
          this.sections = secs.filter(s => s.active);
          this.sectionsLoaded = true;
          this.cdr.markForCheck();
          then?.();
        },
        error: err => { this.sections = []; this.sectionsLoaded = false; this.error = apiMessage(err); this.cdr.markForCheck(); }
      });
  }

  loadTimingDisplay(): void {
    this.timetableService.getTimingDisplay().pipe(takeUntil(this.destroy$)).subscribe({
      next: display => {
        this.showTimes = display.showTimes;
        this.centralTimingActive = display.activeProfileId != null;
        this.activeTimingProfileName = display.activeProfileName;
        this.applyTimingPeriods(display.periods);
        this.cdr.markForCheck();
      },
      error: err => {
        // Backward-compatible fallback: if the new endpoint is temporarily unavailable,
        // preserve the existing timetable row times rather than hiding the schedule.
        this.logger.error('Failed to load timetable timing display settings', err);
        this.showTimes = true;
        this.centralTimingActive = false;
        this.activeTimingProfileName = null;
        this.applyTimingPeriods([]);
        this.cdr.markForCheck();
      }
    });
  }

  loadTimingConfig(): void {
    if (!this.canManage()) return;
    this.timingLoading = true;
    this.timingError = '';
    this.timetableService.getTimingConfig().pipe(takeUntil(this.destroy$)).subscribe({
      next: config => {
        this.timingLoading = false;
        this.applyTimingConfig(config);
      },
      error: err => {
        this.timingLoading = false;
        this.timingError = apiMessage(err, 'Could not load period timing settings.');
        this.cdr.markForCheck();
      }
    });
  }

  setSchoolShowTimes(enabled: boolean): void {
    if (!this.canManage() || this.timingLoading) return;
    this.timingLoading = true;
    this.timingError = '';
    this.timetableService.setTimingVisibility(enabled).pipe(takeUntil(this.destroy$)).subscribe({
      next: config => {
        this.timingLoading = false;
        this.applyTimingConfig(config);
      },
      error: err => {
        this.timingLoading = false;
        this.timingError = apiMessage(err, 'Could not update period-time visibility.');
        this.cdr.markForCheck();
      }
    });
  }

  get selectedTimingProfile(): TimetableTimingProfile | null {
    return this.timingConfig?.profiles.find(p => p.id === this.timingProfileId) ?? null;
  }

  selectTimingProfile(profile: TimetableTimingProfile): void {
    this.timingProfileId = profile.id;
    this.timingProfileName = profile.name;
    const byPeriod = new Map(profile.periods.map(p => [p.periodNumber, p]));
    const count = Math.max(8, ...profile.periods.map(p => p.periodNumber), 0);
    this.timingDraft = Array.from({ length: count }, (_, i) => {
      const periodNumber = i + 1;
      const current = byPeriod.get(periodNumber);
      return current ? { ...current } : { periodNumber, startTime: '', endTime: '' };
    });
    this.cdr.markForCheck();
  }

  createTimingProfile(fromCurrentTimetable = false): void {
    if (!this.canManage() || this.timingLoading) return;
    const name = this.newTimingProfileName.trim();
    if (!name) {
      this.timingError = 'Enter a name for the timing profile.';
      this.cdr.markForCheck();
      return;
    }
    const activeId = this.timingConfig?.activeProfileId ?? null;
    this.timingLoading = true;
    this.timingError = '';
    this.timetableService.createTimingProfile({
      name,
      copyFromProfileId: fromCurrentTimetable ? null : activeId,
      fromCurrentTimetable
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: profile => {
        this.newTimingProfileName = profile.name.toLowerCase().includes('winter') ? 'Summer Schedule' : 'Winter Schedule';
        this.timingLoading = false;
        this.loadTimingConfig();
        this.selectTimingProfile(profile);
      },
      error: err => {
        this.timingLoading = false;
        this.timingError = apiMessage(err, 'Could not create the timing profile.');
        this.cdr.markForCheck();
      }
    });
  }

  saveTimingProfile(): void {
    if (!this.canManage() || !this.timingProfileId || this.timingLoading) return;
    const periods = this.timingDraft.filter(p => p.startTime && p.endTime);
    if (!periods.length) {
      this.timingError = 'Add at least one period time before saving.';
      this.cdr.markForCheck();
      return;
    }
    this.timingLoading = true;
    this.timingError = '';
    this.timetableService.updateTimingProfile(this.timingProfileId, {
      name: this.timingProfileName.trim(),
      periods
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: profile => {
        this.timingLoading = false;
        this.loadTimingConfig();
        this.selectTimingProfile(profile);
      },
      error: err => {
        this.timingLoading = false;
        this.timingError = apiMessage(err, 'Could not save the timing profile.');
        this.cdr.markForCheck();
      }
    });
  }

  saveAndActivateTimingProfile(): void {
    if (!this.canManage() || !this.timingProfileId || this.timingLoading) return;
    const periods = this.timingDraft.filter(p => p.startTime && p.endTime);
    if (!periods.length) {
      this.timingError = 'Add at least one period time before activating.';
      this.cdr.markForCheck();
      return;
    }
    this.timingLoading = true;
    this.timingError = '';
    this.timetableService.updateTimingProfile(this.timingProfileId, {
      name: this.timingProfileName.trim(),
      periods
    }).pipe(
      switchMap(() => this.timetableService.activateTimingProfile(this.timingProfileId!)),
      takeUntil(this.destroy$)
    ).subscribe({
      next: config => {
        this.timingLoading = false;
        this.applyTimingConfig(config);
      },
      error: err => {
        this.timingLoading = false;
        this.timingError = apiMessage(err, 'Could not save and activate the timing profile.');
        this.cdr.markForCheck();
      }
    });
  }

  activateTimingProfile(profileId: number): void {
    if (!this.canManage() || this.timingLoading) return;
    this.timingLoading = true;
    this.timingError = '';
    this.timetableService.activateTimingProfile(profileId).pipe(takeUntil(this.destroy$)).subscribe({
      next: config => {
        this.timingLoading = false;
        this.applyTimingConfig(config);
      },
      error: err => {
        this.timingLoading = false;
        this.timingError = apiMessage(err, 'Could not activate the timing profile.');
        this.cdr.markForCheck();
      }
    });
  }

  deleteTimingProfile(profile: TimetableTimingProfile): void {
    if (!this.canManage() || profile.active || this.timingLoading) return;
    this.timingLoading = true;
    this.timingError = '';
    this.timetableService.deleteTimingProfile(profile.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.timingLoading = false;
        if (this.timingProfileId === profile.id) {
          this.timingProfileId = null;
          this.timingDraft = [];
        }
        this.loadTimingConfig();
      },
      error: err => {
        this.timingLoading = false;
        this.timingError = apiMessage(err, 'Could not delete the timing profile.');
        this.cdr.markForCheck();
      }
    });
  }

  entryStartTime(entry: TimetableEntry): string {
    if (this.centralTimingActive) return this.timingByPeriod.get(entry.periodNumber)?.startTime ?? '';
    return entry.startTime || '';
  }

  entryEndTime(entry: TimetableEntry): string {
    if (this.centralTimingActive) return this.timingByPeriod.get(entry.periodNumber)?.endTime ?? '';
    return entry.endTime || '';
  }

  configuredTimeForPeriod(periodNumber: number): TimetableTimingPeriod | null {
    return this.timingByPeriod.get(periodNumber) ?? null;
  }

  private applyTimingConfig(config: TimetableTimingConfig): void {
    this.timingConfig = config;
    this.showTimes = config.showTimes;
    if (!config.profiles.length && this.newTimingProfileName === 'Winter Schedule') {
      this.newTimingProfileName = 'Current Schedule';
    }
    const active = config.profiles.find(p => p.active) ?? null;
    this.centralTimingActive = active != null;
    this.activeTimingProfileName = active?.name ?? null;
    this.applyTimingPeriods(active?.periods ?? []);
    if (this.timingProfileId) {
      const selected = config.profiles.find(p => p.id === this.timingProfileId);
      if (selected) this.selectTimingProfile(selected);
    } else if (active) {
      this.selectTimingProfile(active);
    } else if (config.profiles.length) {
      this.selectTimingProfile(config.profiles[0]);
    }
    this.cdr.markForCheck();
  }

  private applyTimingPeriods(periods: TimetableTimingPeriod[]): void {
    this.timingByPeriod = new Map(periods.map(p => [p.periodNumber, p]));
  }

  get dayEntries(): TimetableEntry[] {
    return this.entries
      .filter(e => e.day === this.selectedDay)
      .sort((a, b) => a.periodNumber - b.periodNumber);
  }

  /** Clusters dayEntries sharing the same period number into one visual block — any number of
   *  independent entries may share a slot (the timetable never rejects a row for colliding with
   *  another), rendered as stacked subject/teacher rows under one "Period N" header instead of
   *  separate cards. */
  get groupedDayEntries(): { periodNumber: number; entries: TimetableEntry[] }[] {
    const map = new Map<number, TimetableEntry[]>();
    for (const entry of this.dayEntries) {
      const list = map.get(entry.periodNumber) ?? [];
      list.push(entry);
      map.set(entry.periodNumber, list);
    }
    return Array.from(map.entries())
      .map(([periodNumber, entries]) => ({ periodNumber, entries }))
      .sort((a, b) => a.periodNumber - b.periodNumber);
  }

  get teacherDayEntries(): TimetableEntry[] {
    return this.teacherGrid[this.selectedDay] ?? [];
  }

  // ── Subject icon ─────────────────────────────────────────────────

  getSubjectIcon(name: string): string {
    return subjectIcon(name);
  }

  // ── Subject colour class ─────────────────────────────────────────

  getSubjectClass(name: string): string {
    return subjectAccentClass(name);
  }

  // ── Data loading ─────────────────────────────────────────────────

  loadClassTimetable(): void {
    this.classRead$.next(null);
    if (!this.selectedClass || (this.canManage() && !this.selectedSession)) return;
    this.isLoading = true;
    this.error = null;
    this.entries = [];
    this.cdr.markForCheck();

    this.classRead$.next({
      className: this.selectedClass,
      sectionId: this.selectedSectionId,
      studentId: this.isParent() ? this.userId : null,
      academicSessionId: this.canManage() ? this.selectedSession!.id : undefined
    });
  }

  private loadTeacherTimetable(): void {
    this.isLoading = true;
    this.cdr.markForCheck();

    this.timetableService.getTeacherTimetable(this.userId)
      .pipe(takeUntil(this.destroy$)).subscribe({
        next: (data) => {
          this.teacherEntries = data;
          this.buildTeacherGrid(data);
          this.buildMyClasses(data);
          this.isLoading = false;
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.logger.error('Failed to load teacher timetable:', err);
          this.error = 'Failed to load your schedule. Please try again.';
          this.isLoading = false;
          this.cdr.markForCheck();
        }
      });
  }

  /** Distinct class+section combos derived from the teacher's own existing periods, plus
   *  their class-teacher assignment (if any) even when it has no periods logged yet.
   *
   *  classId is always re-resolved against the canonical managedClasses list rather than
   *  trusted blindly from the entry: a teacher's own timetable entry is expected to already
   *  carry its own classId, but if it ever doesn't (a legacy/edge-case row), falling back here
   *  is what prevents "Unable to determine the class for this period" on an otherwise ordinary
   *  Add Period — the same defense openEdit() already applies when populating the edit form. */
  private buildMyClasses(entries: TimetableEntry[]): void {
    const seen = new Set<string>();
    const classes: { classId?: number; className: string; sectionId: number | null; sectionName: string | null }[] = [];
    for (const e of entries) {
      const key = `${e.className}::${e.sectionId ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const classId = e.classId ?? this.managedClasses.find(c => c.name === e.className)?.id;
      classes.push({ classId, className: e.className, sectionId: e.sectionId ?? null, sectionName: e.sectionName ?? null });
    }
    this.myClasses = classes;
    this.cdr.markForCheck();

    // seen/myClasses are shared across these two independent, order-agnostic lookups so
    // neither one can add a class the other already added.
    const addIfNew = (className: string, sectionId: number | null, sectionName: string | null) => {
      const key = `${className}::${sectionId ?? ''}`;
      if (seen.has(key)) return;
      seen.add(key);
      // These legacy live/grant DTOs expose only a name; resolve once against canonical school classes.
      const classId = this.managedClasses.find(c => c.name === className)?.id;
      if (!classId) return;
      this.myClasses = [...this.myClasses, { classId, className, sectionId, sectionName }];
      this.cdr.markForCheck();
    };

    this.teacherService.getTeacher(this.userId).pipe(takeUntil(this.destroy$)).subscribe({
      next: teacher => {
        if (!teacher.classTeacher) return;
        addIfNew(teacher.classTeacher, teacher.classTeacherSectionId ?? null, null);
      },
      error: () => { /* non-critical — self-add just won't offer this class if the lookup fails */ }
    });

    this.teacherClassGrantService.getForTeacher(this.userId).pipe(takeUntil(this.destroy$)).subscribe({
      next: grants => {
        for (const g of grants) {
          addIfNew(g.className, g.sectionId, g.sectionName);
        }
      },
      error: () => { /* non-critical — self-add just won't offer admin-granted classes if this fails */ }
    });
  }

  private loadTeachers(): void {
    this.teacherService.getAllTeachers()
      .pipe(takeUntil(this.destroy$)).subscribe({
        next: (list) => { this.teachers = list; this.cdr.markForCheck(); },
        error: (err) => this.logger.error('Failed to load teachers:', err)
      });
  }

  private buildTeacherGrid(data: TimetableEntry[]): void {
    this.teacherGrid = {};
    for (const day of this.days) {
      this.teacherGrid[day] = data
        .filter(e => e.day === day)
        .sort((a, b) => a.periodNumber - b.periodNumber);
    }
  }

  hasAnyEntry(): boolean { return this.entries.length > 0; }
  hasAnyTeacherEntry(): boolean { return this.teacherEntries.length > 0; }

  // ── Modal ────────────────────────────────────────────────────────

  openAddPeriod(): void {
    if (!this.canAdd()) return;
    this.isEditMode = false;
    this.modalForm = this.emptyForm();
    this.modalForm.classId = this.selectedClassId!;
    this.modalForm.academicSessionId = this.selectedSession!.id;
    this.modalForm.className = this.selectedClass;
    this.modalForm.sectionId = this.selectedSectionId;
    this.modalForm.day = this.selectedDay;
    this.modalError = null;
    this.showModal = true;
    this.cdr.markForCheck();
  }

  /** TEACHER self-service: opens a fresh Add Period form scoped to a class/section the teacher
   *  already has a real relationship with (see myClasses). teacherId is forced to themselves —
   *  never shown as a choice — and the backend re-enforces both independently. It does not
   *  matter whether 0, 1, or many other rows already exist in the chosen slot — the timetable
   *  never rejects a row for colliding with another. */
  openAddPeriodAsTeacher(): void {
    if (!this.isTeacher() || this.myClasses.length === 0) return;
    this.isEditMode = false;
    this.modalForm = this.emptyForm();
    this.modalForm.day = this.selectedDay;
    this.modalForm.teacherId = this.userId;
    this.modalForm.teacherName = this.userName;
    const first = this.myClasses[0];
    this.modalForm.classId = first.classId;
    this.modalForm.className = first.className;
    this.modalForm.sectionId = first.sectionId;
    this.modalForm.sectionName = first.sectionName;
    this.modalError = null;
    this.showModal = true;
    this.cdr.markForCheck();
  }

  myClassKey(c: { className: string; sectionId: number | null }): string {
    return `${c.className}::${c.sectionId ?? ''}`;
  }

  get selectedMyClassKey(): string {
    return `${this.modalForm.className}::${this.modalForm.sectionId ?? ''}`;
  }

  onMyClassSelect(key: string): void {
    const match = this.myClasses.find(c => this.myClassKey(c) === key);
    if (!match) return;
    this.modalForm.classId = match.classId;
    this.modalForm.className = match.className;
    this.modalForm.sectionId = match.sectionId;
    this.modalForm.sectionName = match.sectionName;
  }

  openEdit(entry: TimetableEntry): void {
    if (!this.canEditEntry(entry)) return;
    this.isEditMode = true;
    this.modalForm = { ...entry };
    // Defense in depth: a teacher's own entry should always carry its own classId, but if it
    // ever doesn't, resolve it from myClasses (built from this same loaded dataset) rather than
    // silently failing validation on save.
    if (this.isTeacher() && this.modalForm.classId == null) {
      const match = this.myClasses.find(c =>
        c.className === entry.className && (c.sectionId ?? null) === (entry.sectionId ?? null));
      if (match?.classId != null) this.modalForm.classId = match.classId;
    }
    this.modalError = null;
    this.showModal = true;
    this.cdr.markForCheck();
  }

  closeModal(): void {
    this.showModal = false;
    this.cdr.markForCheck();
  }

  /** Admin-only: authorizes a teacher to self-serve periods for the currently selected
   *  class/section, even one with no periods logged yet and that isn't their class-teacher
   *  assignment. See TeacherClassGrantService (backend) for what this actually grants. */
  openGrantModal(): void {
    if (!this.canAdd() || !this.selectedSession?.current) return;
    this.grantTeacherId = '';
    this.grantError = null;
    this.showGrantModal = true;
    this.cdr.markForCheck();
  }

  closeGrantModal(): void {
    this.showGrantModal = false;
    this.cdr.markForCheck();
  }

  saveGrant(): void {
    if (!this.canAdd() || !this.selectedSession?.current || this.grantSaving) return;
    this.grantError = null;
    if (!this.grantTeacherId) {
      this.grantError = 'Please select a teacher.'; return;
    }

    this.grantSaving = true;
    this.cdr.markForCheck();

    this.teacherClassGrantService.create({
      teacherId: this.grantTeacherId,
      className: this.selectedClass,
      sectionId: this.selectedSectionId
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.grantSaving = false;
        this.showGrantModal = false;
        this.toast.success('Access granted!');
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.grantSaving = false;
        this.grantError = typeof err.error === 'string' && err.error
          ? err.error
          : 'Failed to grant access. Please try again.';
        this.cdr.markForCheck();
      }
    });
  }

  onTeacherSelect(): void {
    const teacher = this.teachers.find(t => t.teacherId === this.modalForm.teacherId);
    this.modalForm.teacherName = teacher?.name ?? '';
  }

  saveEntry(): void {
    if (this.modalSaving) return;
    if (this.isEditMode && !this.canEditEntry(this.modalForm)) return;
    this.modalError = null;
    if (this.isTeacher()) {
      // Teachers never pick a session — the current session is always resolved server-side —
      // so their validation error must never mention "session" at all. Nullish (not falsy) so a
      // genuinely valid class id of 0 is never mistaken for "no class selected".
      if (this.modalForm.classId == null) {
        this.modalError = 'Unable to determine the class for this period. Close and reopen it.'; return;
      }
    } else if (!this.canWrite() || this.modalForm.classId == null) {
      this.modalError = 'Select a writable session and a valid class.'; return;
    }
    if (this.canManage() && this.modalForm.academicSessionId !== this.selectedSession?.id) {
      this.modalError = 'Session changed. Reopen this period.'; return;
    }
    if (this.canManage() && (!this.sectionsLoaded || (this.sections.length ? !this.sections.some(s => s.id === this.modalForm.sectionId) : this.modalForm.sectionId != null))) {
      this.modalError = 'Select a valid section for this class.'; return;
    }
    if (!this.modalForm.subjectName?.trim()) {
      this.modalError = 'Subject name is required.'; return;
    }
    if (!this.modalForm.teacherId) {
      this.modalError = 'Please select a teacher.'; return;
    }
    if (this.centralTimingActive) {
      const timing = this.configuredTimeForPeriod(this.modalForm.periodNumber);
      if (!timing) {
        this.modalError = `Period ${this.modalForm.periodNumber} does not have a time in the active timing profile. Ask an admin to configure it in Timetable → Setup.`;
        return;
      }
      this.modalForm.startTime = timing.startTime;
      this.modalForm.endTime = timing.endTime;
    }
    if (!this.modalForm.startTime || !this.modalForm.endTime) {
      this.modalError = 'Start and end time are required.'; return;
    }
    if (this.modalForm.startTime >= this.modalForm.endTime) {
      this.modalError = 'End time must be after start time.'; return;
    }

    this.modalSaving = true;
    this.cdr.markForCheck();

    const form = this.modalForm;
    const body: TimetableEntryRequest = {
      ...(this.canManage() ? { academicSessionId: this.selectedSession!.id } : this.isEditMode ? { academicSessionId: form.academicSessionId } : {}),
      classId: form.classId!, sectionId: form.sectionId ?? null, day: form.day,
      periodNumber: form.periodNumber, startTime: form.startTime, endTime: form.endTime,
      subjectName: form.subjectName, teacherId: this.isTeacher() ? this.userId : form.teacherId
    };
    const save$ = this.isEditMode && this.modalForm.id != null
      ? this.timetableService.updateEntry(this.modalForm.id, body)
      : this.timetableService.createEntry(body);

    save$.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.modalSaving = false;
        this.showModal = false;
        if (this.isTeacher()) {
          this.loadTeacherTimetable();
        } else {
          this.loadClassTimetable();
        }
        this.toast.success('Saved!');
      },
      error: (err) => {
        this.modalSaving = false;
        this.logger.error('Failed to save timetable entry:', err);
        this.modalError = apiMessage(err);
        this.cdr.markForCheck();
      }
    });
  }

  /** Direct delete for the teacher's own card, without requiring the edit modal. */
  deleteTeacherEntry(entry: TimetableEntry): void {
    if (!this.isTeacher() || !this.canEditEntry(entry) ||
        !entry.id || !entry.academicSessionId || this.modalSaving) return;
    const id = entry.id;
    const sessionId = entry.academicSessionId;
    this.toast.confirm({
      title: 'Delete this period?',
      message: `${entry.subjectName} — ${this.dayLabels[entry.day]} Period ${entry.periodNumber}`,
      confirmText: 'Yes, delete',
      danger: true
    }).then(confirmed => {
      if (!confirmed || this.destroyed || this.modalSaving ||
          !this.canEditEntry(entry)) return;
      this.modalSaving = true;
      this.cdr.markForCheck();
      this.timetableService.deleteEntry(id, sessionId)
        .pipe(takeUntil(this.destroy$)).subscribe({
          next: () => {
            this.modalSaving = false;
            this.loadTeacherTimetable();
            this.toast.success('Deleted');
            this.cdr.markForCheck();
          },
          error: err => {
            this.modalSaving = false;
            this.logger.error('Failed to delete teacher timetable entry:', err);
            this.toast.error('Error', apiMessage(err));
            this.cdr.markForCheck();
          }
        });
    });
  }

  deleteEntry(): void {
    if (!this.canEditEntry(this.modalForm) || !this.modalForm.id || this.modalSaving) return;
    const id = this.modalForm.id;
    const sessionId = this.modalForm.academicSessionId!;
    this.toast.confirm({
      title: 'Delete this period?',
      message: `${this.modalForm.subjectName} — ${this.dayLabels[this.modalForm.day]} Period ${this.modalForm.periodNumber}`,
      confirmText: 'Yes, delete',
      danger: true
    }).then(confirmed => {
      if (!confirmed || this.destroyed || !this.canEditEntry(this.modalForm) || this.modalForm.id !== id || (this.canManage() && this.selectedSession?.id !== sessionId)) return;
      this.modalSaving = true;
      this.cdr.markForCheck();
      this.timetableService.deleteEntry(id, sessionId)
        .pipe(takeUntil(this.destroy$)).subscribe({
          next: () => {
            this.modalSaving = false;
            this.showModal = false;
            if (this.isTeacher()) this.loadTeacherTimetable(); else this.loadClassTimetable();
            this.toast.success('Deleted');
            this.cdr.markForCheck();
          },
          error: (err) => {
            this.modalSaving = false;
            this.cdr.markForCheck();
            this.logger.error('Failed to delete entry:', err);
            this.toast.error('Error', apiMessage(err));
          }
        });
    });
  }

  get timetableHeading(): string {
    const cls = this.selectedClass ?? '';
    const section = this.selectedSectionName ?? '';
    return section ? `Class ${cls} – Section ${section}` : `Class ${cls}`;
  }

  goToBulkImport(): void {
    if (!this.canWrite()) return;
    this.router.navigate(['/dashboard/timetable-bulk-import'], { queryParams: { academicSessionId: this.selectedSession!.id } });
  }

  printTimetable(): void {
    if (Capacitor.isNativePlatform()) {
      this.toast.info('Print Not Available', 'Printing is not supported on the mobile app. Please use the web version at edunexify.co.in');
      return;
    }
    window.print();
  }

  private emptyForm(): TimetableEntry {
    return {
      className: '', sectionId: null, day: this.selectedDay ?? 'MONDAY', periodNumber: 1,
      startTime: '', endTime: '', subjectName: '', teacherId: ''
    };
  }

  get selectedSectionName(): string | null {
    if (this.selectedSectionId == null) return null;
    return this.sections.find(s => s.id === this.selectedSectionId)?.name ?? null;
  }

  trackByDay(_: number, day: string): string { return day; }
  trackByEntry(_: number, e: TimetableEntry): string {
    return `${e.id ?? e.day + e.periodNumber}`;
  }
  trackByPeriod(_: number, group: { periodNumber: number }): number { return group.periodNumber; }
}
