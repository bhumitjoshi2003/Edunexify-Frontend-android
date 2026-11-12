import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { coordinatorClassNames, optionalCoordinatorService } from '../../services/coordinator.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, switchMap } from 'rxjs';
import { ToastService } from '../../services/toast.service';
import {
  SubjectConfigService,
  ClassSubject,
  AcademicStream,
  CoreSubject,
  OptionalSubjectGroup,
  OptionalSubject,
} from '../../services/subject-config.service';
import { LoggerService } from '../../services/logger.service';
import { SchoolService } from '../../services/school.service';
import { AuthStateService } from '../../auth/auth-state.service';
import { FEATURES } from '../../auth/feature-keys';

@Component({
  selector: 'app-subject-config',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './subject-config.component.html',
  styleUrl: './subject-config.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubjectConfigComponent implements OnInit, OnDestroy {
  /** Coordinators see only classes they cover in full; everyone else is unaffected. */
  private coordinators = optionalCoordinatorService();

  private destroy$ = new Subject<void>();

  activeTab: 'class' | 'streams' | 'optional' = 'class';
  classOptions: string[] = [];

  // Class subjects tab
  /** Always one of classOptions (the school's configured classes), or '' before they load. */
  selectedClass = '';
  classSubjects: ClassSubject[] = [];
  newSubjectName = '';
  newSubjectOptional = false;
  newSubjectGroup = '';

  // Streams tab
  streams: AcademicStream[] = [];
  newStreamName = '';
  newCoreSubjectName: Record<number, string> = {};
  expandedStreamId: number | null = null;

  // Optional groups tab
  optionalGroups: OptionalSubjectGroup[] = [];
  newGroupName = '';
  newOptionalSubjectName: Record<number, string> = {};
  expandedGroupId: number | null = null;

  constructor(
    private service: SubjectConfigService,
    private cdr: ChangeDetectorRef,
    private logger: LoggerService,
    private toast: ToastService,
    private schoolService: SchoolService,
    private authState: AuthStateService
  ) { }

  ngOnInit(): void {
    this.schoolService.getClasses().pipe(switchMap(c => coordinatorClassNames(this.coordinators, c)), takeUntil(this.destroy$)).subscribe(classes => {
      this.classOptions = classes;
      if (!this.hasConfiguredClass) this.selectedClass = classes[0] ?? '';
      this.cdr.markForCheck();
      this.loadClassSubjects();
    });
    if (this.streamsAvailable) {
      this.loadStreams();
      this.loadOptionalGroups();
    }
  }

  /** Class subjects are part of every plan (the timetable needs them); streams and optional
   *  groups belong to Exams & Results. */
  get streamsAvailable(): boolean {
    return this.authState.hasFeature(FEATURES.EXAMS_RESULTS);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  setTab(tab: 'class' | 'streams' | 'optional'): void {
    this.activeTab = tab;
  }

  // ── Class Subjects ────────────────────────────────────────────────────────

  /** True when the selected class is one of the school's configured classes. */
  get hasConfiguredClass(): boolean {
    return !!this.selectedClass && this.classOptions.includes(this.selectedClass);
  }

  loadClassSubjects(): void {
    if (!this.hasConfiguredClass) {
      this.classSubjects = [];
      this.cdr.markForCheck();
      return;
    }
    this.service.getClassSubjects(this.selectedClass).pipe(takeUntil(this.destroy$)).subscribe({
      next: (data) => { this.classSubjects = data; this.cdr.markForCheck(); },
      error: (e) => { this.logger.error('Error loading class subjects:', e); this.toast.error('Error', 'Failed to load subjects.'); },
    });
  }

  onClassChange(): void {
    this.newSubjectName = '';
    this.newSubjectOptional = false;
    this.newSubjectGroup = '';
    this.loadClassSubjects();
  }

  addClassSubject(): void {
    const name = this.newSubjectName.trim();
    if (!name || !this.hasConfiguredClass) return;
    if (this.newSubjectOptional && !this.newSubjectGroup.trim()) {
      this.toast.error('Validation', 'Group name is required for optional subjects.');
      return;
    }
    // Issue #60: Duplicate subject validation
    if (this.classSubjects.some(s => s.subjectName.toLowerCase() === name.toLowerCase())) {
      this.toast.error('Duplicate Subject', 'This subject already exists for the selected class.');
      return;
    }
    this.service.addClassSubject(
      this.selectedClass, name,
      this.newSubjectOptional,
      this.newSubjectOptional ? this.newSubjectGroup.trim() : undefined
    ).pipe(takeUntil(this.destroy$)).subscribe({
      next: (s) => {
        this.classSubjects = [...this.classSubjects, s];
        this.newSubjectName = '';
        this.newSubjectOptional = false;
        this.newSubjectGroup = '';
        this.cdr.markForCheck();
      },
      error: (e) => {
        this.logger.error('Error adding subject:', e);
        this.toast.error('Error', 'Could not add subject. It may already exist.');
      },
    });
  }

  deleteClassSubject(id: number): void {
    this.toast.confirm({
      title: 'Delete subject?',
      message: 'This will remove it from the class.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      danger: true,
    }).then((confirmed) => {
      if (!confirmed) return;
      this.service.deleteClassSubject(id).pipe(takeUntil(this.destroy$)).subscribe({
        next: () => {
          this.classSubjects = this.classSubjects.filter(s => s.id !== id);
          this.cdr.markForCheck();
        },
        error: (e) => {
          this.logger.error('Error deleting subject:', e);
          this.toast.error('Error', 'Could not delete subject.');
        },
      });
    });
  }

  // ── Streams ───────────────────────────────────────────────────────────────

  loadStreams(): void {
    this.service.getStreams().pipe(takeUntil(this.destroy$)).subscribe({
      next: (data) => {
        this.streams = (data ?? []).map(s => ({ ...s, coreSubjects: s.coreSubjects ?? [] }));
        this.cdr.markForCheck();
      },
      error: (e) => { this.logger.error('Error loading streams:', e); this.toast.error('Error', 'Failed to load streams.'); },
    });
  }

  toggleStream(id: number): void {
    this.expandedStreamId = this.expandedStreamId === id ? null : id;
  }

  addStream(): void {
    const name = this.newStreamName.trim();
    if (!name) return;
    this.service.addStream(name).pipe(takeUntil(this.destroy$)).subscribe({
      next: (s) => {
        this.streams = [...this.streams, { ...s, coreSubjects: s.coreSubjects ?? [] }];
        this.newStreamName = '';
        this.cdr.markForCheck();
      },
      error: (e) => {
        this.logger.error('Error adding stream:', e);
        this.toast.error('Error', 'Could not add stream. It may already exist.');
      },
    });
  }

  deleteStream(id: number): void {
    this.toast.confirm({
      title: 'Delete stream?',
      message: 'This will remove the stream and all its core subjects.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      danger: true,
    }).then((confirmed) => {
      if (!confirmed) return;
      this.service.deleteStream(id).pipe(takeUntil(this.destroy$)).subscribe({
        next: () => {
          this.streams = this.streams.filter(s => s.id !== id);
          this.cdr.markForCheck();
        },
        error: (e) => {
          this.logger.error('Error deleting stream:', e);
          this.toast.error('Error', 'Could not delete stream.');
        },
      });
    });
  }

  addCoreSubject(streamId: number): void {
    const name = (this.newCoreSubjectName[streamId] || '').trim();
    if (!name) return;
    this.service.addCoreSubject(streamId, name).pipe(takeUntil(this.destroy$)).subscribe({
      next: (subj) => {
        // Immutable update — replace the stream object so OnPush detects the change
        this.streams = this.streams.map(s =>
          s.id === streamId ? { ...s, coreSubjects: [...s.coreSubjects, subj] } : s
        );
        this.newCoreSubjectName[streamId] = '';
        this.cdr.markForCheck();
      },
      error: (e) => {
        this.logger.error('Error adding core subject:', e);
        this.toast.error('Error', 'Could not add subject.');
      },
    });
  }

  deleteCoreSubject(streamId: number, subjectId: number): void {
    this.toast.confirm({
      title: 'Delete subject?',
      message: 'This will remove the core subject from the stream.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      danger: true,
    }).then((confirmed) => {
      if (!confirmed) return;
      this.service.deleteCoreSubject(subjectId).pipe(takeUntil(this.destroy$)).subscribe({
        next: () => {
          this.streams = this.streams.map(s =>
            s.id === streamId ? { ...s, coreSubjects: s.coreSubjects.filter(c => c.id !== subjectId) } : s
          );
          this.cdr.markForCheck();
        },
        error: (e) => {
          this.logger.error('Error deleting core subject:', e);
          this.toast.error('Error', 'Could not delete subject.');
        },
      });
    });
  }

  // ── Optional Groups ───────────────────────────────────────────────────────

  loadOptionalGroups(): void {
    this.service.getOptionalGroups().pipe(takeUntil(this.destroy$)).subscribe({
      next: (data) => {
        this.optionalGroups = (data ?? []).map(g => ({ ...g, subjects: g.subjects ?? [] }));
        this.cdr.markForCheck();
      },
      error: (e) => { this.logger.error('Error loading optional groups:', e); this.toast.error('Error', 'Failed to load optional groups.'); },
    });
  }

  toggleGroup(id: number): void {
    this.expandedGroupId = this.expandedGroupId === id ? null : id;
  }

  addOptionalGroup(): void {
    const name = this.newGroupName.trim();
    if (!name) return;
    this.service.addOptionalGroup(name).pipe(takeUntil(this.destroy$)).subscribe({
      next: (g) => {
        this.optionalGroups = [...this.optionalGroups, { ...g, subjects: g.subjects ?? [] }];
        this.newGroupName = '';
        this.cdr.markForCheck();
      },
      error: (e) => {
        this.logger.error('Error adding group:', e);
        this.toast.error('Error', 'Could not add group.');
      },
    });
  }

  deleteOptionalGroup(id: number): void {
    this.toast.confirm({
      title: 'Delete group?',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      danger: true,
    }).then((confirmed) => {
      if (!confirmed) return;
      this.service.deleteOptionalGroup(id).pipe(takeUntil(this.destroy$)).subscribe({
        next: () => {
          this.optionalGroups = this.optionalGroups.filter(g => g.id !== id);
          this.cdr.markForCheck();
        },
        error: (e) => {
          this.logger.error('Error deleting group:', e);
          this.toast.error('Error', 'Could not delete group.');
        },
      });
    });
  }

  addOptionalSubject(groupId: number): void {
    const name = (this.newOptionalSubjectName[groupId] || '').trim();
    if (!name) return;
    this.service.addOptionalSubject(groupId, name).pipe(takeUntil(this.destroy$)).subscribe({
      next: (subj) => {
        // Immutable update — replace the group object so OnPush detects the change
        this.optionalGroups = this.optionalGroups.map(g =>
          g.id === groupId ? { ...g, subjects: [...g.subjects, subj] } : g
        );
        this.newOptionalSubjectName[groupId] = '';
        this.cdr.markForCheck();
      },
      error: (e) => {
        this.logger.error('Error adding optional subject:', e);
        this.toast.error('Error', 'Could not add subject.');
      },
    });
  }

  deleteOptionalSubject(groupId: number, subjectId: number): void {
    this.toast.confirm({
      title: 'Delete subject?',
      message: 'This will remove the subject from the group.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      danger: true,
    }).then((confirmed) => {
      if (!confirmed) return;
      this.service.deleteOptionalSubject(subjectId).pipe(takeUntil(this.destroy$)).subscribe({
        next: () => {
          this.optionalGroups = this.optionalGroups.map(g =>
            g.id === groupId ? { ...g, subjects: g.subjects.filter(s => s.id !== subjectId) } : g
          );
          this.cdr.markForCheck();
        },
        error: (e) => {
          this.logger.error('Error deleting optional subject:', e);
          this.toast.error('Error', 'Could not delete subject.');
        },
      });
    });
  }

  trackById(index: number, item: { id: number }): number { return item.id; }
  trackByIndex(index: number): number { return index; }
}
