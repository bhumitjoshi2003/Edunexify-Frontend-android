import { coordinatorClassNames, optionalCoordinatorService } from '../../services/coordinator.service';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  OnDestroy,
  OnInit
} from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, takeUntil, switchMap } from 'rxjs';

import {
  AssessmentGroup,
  AssessmentGroupRequest,
  AssessmentGroupService
} from '../../services/assessment-group.service';
import { AcademicSessionService } from '../../services/academic-session.service';
import { AcademicSession } from '../../interfaces/academic-session';
import { SchoolService } from '../../services/school.service';
import { ExamConfigService, ExamConfig } from '../../services/exam-config.service';
import { ToastService } from '../../services/toast.service';

interface FormExamMapping {
  examConfigId: number;
  weightage: number;
  weightageDisplay: number; // 0–100 for the input; weightage = display/100
  displayOrder: number;
}

interface FormComposition {
  childGroupId: number;
  weightage: number;
  weightageDisplay: number;
  displayOrder: number;
}

interface GroupForm {
  name: string;
  displayName: string;
  groupType: 'EXAM_BASED' | 'GROUP_BASED';
  displayOrder: number;
  examMappings: FormExamMapping[];
  compositions: FormComposition[];
}

@Component({
  selector: 'app-assessment-group-config',
  standalone: true,
  imports: [CommonModule, FormsModule, DecimalPipe],
  templateUrl: './assessment-group-config.component.html',
  styleUrls: ['./assessment-group-config.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AssessmentGroupConfigComponent implements OnInit, OnDestroy {
  /** Coordinators see only classes they cover in full; everyone else is unaffected. */
  private coordinators = optionalCoordinatorService();


  private destroy$ = new Subject<void>();
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  constructor(
    private groupService: AssessmentGroupService,
    private sessionService: AcademicSessionService,
    private schoolService: SchoolService,
    private examConfigService: ExamConfigService,
    private toast: ToastService
  ) {}

  // ── State ──────────────────────────────────────────────────────────
  sessions: AcademicSession[] = [];
  classes: string[] = [];
  availableExams: ExamConfig[] = [];

  selectedSession = '';
  selectedClass = '';

  groups: AssessmentGroup[] = [];
  loading = false;

  showForm = false;
  editingGroup: AssessmentGroup | null = null;
  saving = false;

  form: GroupForm = this.emptyForm();

  // ── Lifecycle ──────────────────────────────────────────────────────
  ngOnInit(): void {
    this.loadSessions();
    this.loadClasses();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Data loading ───────────────────────────────────────────────────
  private loadSessions(): void {
    this.sessionService.getAllSessions()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (sessions: AcademicSession[]) => {
          this.sessions = sessions;
          const current = sessions.find(s => s.current);
          if (current && !this.selectedSession) this.selectedSession = current.label;
          else if (sessions.length > 0 && !this.selectedSession) this.selectedSession = sessions[sessions.length - 1].label;
          this.cdr.markForCheck();
          if (this.selectedSession && this.selectedClass) this.loadGroups();
        },
        error: () => this.toast.error('Failed to load sessions')
      });
  }

  private loadClasses(): void {
    this.schoolService.getClasses()
      .pipe(switchMap(c => coordinatorClassNames(this.coordinators, c)), takeUntil(this.destroy$))
      .subscribe({
        next: (classes: string[]) => {
          this.classes = classes;
          this.cdr.markForCheck();
        },
        error: () => this.toast.error('Failed to load classes')
      });
  }

  private loadGroups(): void {
    if (!this.selectedSession || !this.selectedClass) return;
    this.loading = true;
    this.cdr.markForCheck();

    this.groupService.getGroups(this.selectedSession, this.selectedClass)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (groups) => {
          this.groups = groups;
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.loading = false;
          this.toast.error('Failed to load assessment groups');
          this.cdr.markForCheck();
        }
      });
  }

  private loadAvailableExams(): void {
    if (!this.selectedSession || !this.selectedClass) return;
    this.examConfigService.getExams(this.selectedSession, this.selectedClass)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (exams) => {
          this.availableExams = exams;
          this.cdr.markForCheck();
        },
        error: () => this.toast.error('Failed to load exams')
      });
  }

  // ── Filter change ──────────────────────────────────────────────────
  onFilterChange(): void {
    this.groups = [];
    this.loadGroups();
    if (this.selectedSession && this.selectedClass) {
      this.loadAvailableExams();
    }
  }

  // ── Form open / close ──────────────────────────────────────────────
  openForm(group: AssessmentGroup | null): void {
    this.editingGroup = group;
    if (group) {
      this.form = {
        name: group.name,
        displayName: group.displayName ?? '',
        groupType: group.groupType,
        displayOrder: group.displayOrder,
        examMappings: (group.examMappings ?? []).map((m, i) => ({
          examConfigId: m.examConfigId,
          weightage: m.weightage,
          weightageDisplay: Math.round(m.weightage * 100),
          displayOrder: i
        })),
        compositions: (group.compositions ?? []).map((c, i) => ({
          childGroupId: c.childGroupId,
          weightage: c.weightage,
          weightageDisplay: Math.round(c.weightage * 100),
          displayOrder: i
        }))
      };
    } else {
      this.form = this.emptyForm();
    }
    if (this.availableExams.length === 0) this.loadAvailableExams();
    this.showForm = true;
    this.cdr.markForCheck();
  }

  closeForm(): void {
    this.showForm = false;
    this.editingGroup = null;
    this.saving = false;
    this.cdr.markForCheck();
  }

  private emptyForm(): GroupForm {
    return {
      name: '',
      displayName: '',
      groupType: 'EXAM_BASED',
      displayOrder: 0,
      examMappings: [],
      compositions: []
    };
  }

  // ── Mapping helpers ────────────────────────────────────────────────
  addExamMapping(): void {
    this.form.examMappings.push({
      examConfigId: 0,
      weightage: 0,
      weightageDisplay: 0,
      displayOrder: this.form.examMappings.length
    });
    this.cdr.markForCheck();
  }

  removeExamMapping(index: number): void {
    this.form.examMappings.splice(index, 1);
    this.cdr.markForCheck();
  }

  addComposition(): void {
    this.form.compositions.push({
      childGroupId: 0,
      weightage: 0,
      weightageDisplay: 0,
      displayOrder: this.form.compositions.length
    });
    this.cdr.markForCheck();
  }

  removeComposition(index: number): void {
    this.form.compositions.splice(index, 1);
    this.cdr.markForCheck();
  }

  // ── Computed: weightage sums ───────────────────────────────────────
  get examWeightSum(): number {
    return this.form.examMappings.reduce((s, m) => s + (m.weightageDisplay || 0), 0);
  }

  get examWeightSumOk(): boolean {
    return Math.abs(this.examWeightSum - 100) < 0.5;
  }

  get groupWeightSum(): number {
    return this.form.compositions.reduce((s, c) => s + (c.weightageDisplay || 0), 0);
  }

  get groupWeightSumOk(): boolean {
    return Math.abs(this.groupWeightSum - 100) < 0.5;
  }

  get formValid(): boolean {
    if (!this.form.name.trim()) return false;
    if (this.form.groupType === 'EXAM_BASED') {
      return this.form.examMappings.length > 0
          && this.examWeightSumOk
          && this.form.examMappings.every(m => m.examConfigId > 0);
    }
    return this.form.compositions.length > 0
        && this.groupWeightSumOk
        && this.form.compositions.every(c => c.childGroupId > 0);
  }

  // ── Display helpers ────────────────────────────────────────────────
  getExamWeightTotal(group: AssessmentGroup): number {
    return Math.round((group.examMappings ?? []).reduce((s, m) => s + m.weightage * 100, 0));
  }

  getGroupWeightTotal(group: AssessmentGroup): number {
    return Math.round((group.compositions ?? []).reduce((s, c) => s + c.weightage * 100, 0));
  }

  // ── Save ───────────────────────────────────────────────────────────
  saveGroup(): void {
    if (!this.formValid || this.saving) return;
    this.saving = true;
    this.cdr.markForCheck();

    const req: AssessmentGroupRequest = {
      session: this.selectedSession,
      className: this.selectedClass,
      name: this.form.name.trim(),
      displayName: this.form.displayName.trim() || undefined,
      groupType: this.form.groupType,
      displayOrder: this.form.displayOrder,
      examMappings: this.form.groupType === 'EXAM_BASED'
        ? this.form.examMappings.map((m, i) => ({
            examConfigId: m.examConfigId,
            weightage: m.weightageDisplay / 100,
            displayOrder: i
          }))
        : undefined,
      compositions: this.form.groupType === 'GROUP_BASED'
        ? this.form.compositions.map((c, i) => ({
            childGroupId: c.childGroupId,
            weightage: c.weightageDisplay / 100,
            displayOrder: i
          }))
        : undefined
    };

    const op$ = this.editingGroup
      ? this.groupService.updateGroup(this.editingGroup.id, req)
      : this.groupService.createGroup(req);

    op$.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.toast.success(this.editingGroup ? 'Group updated' : 'Group created');
        this.closeForm();
        this.loadGroups();
      },
      error: (err) => {
        const msg = err?.error?.message ?? 'Failed to save group';
        this.toast.error(msg);
        this.saving = false;
        this.cdr.markForCheck();
      }
    });
  }

  // ── Delete ─────────────────────────────────────────────────────────
  async confirmDelete(group: AssessmentGroup): Promise<void> {
    const confirmed = await this.toast.confirm({
      title: 'Delete Assessment Group',
      message: `Delete "${group.name}"? All weightage mappings will be removed. This cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      danger: true
    });
    if (!confirmed) return;

    this.groupService.deleteGroup(group.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.toast.success('Group deleted');
          this.loadGroups();
        },
        error: () => this.toast.error('Failed to delete group')
      });
  }

  // ── Navigation ─────────────────────────────────────────────────────
  goBack(): void {
    this.router.navigate(['/dashboard/admin-dashboard']);
  }
}
