import { feeSchoolKey, feeRuleWrite, latestFeeRule } from '../../utils/fee-editor.util';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subject, takeUntil, forkJoin, Observable } from 'rxjs';
import { AuthStateService } from '../../auth/auth-state.service';
import { ToastService } from '../../services/toast.service';
import { LoggerService } from '../../services/logger.service';
import { FeeHeadService } from '../../services/fee-head.service';
import { FeeRuleService } from '../../services/fee-rule.service';
import { AcademicSessionService } from '../../services/academic-session.service';
import { SchoolService } from '../../services/school.service';
import { ParentPortalService } from '../../services/parent-portal.service';
import { FeeHead } from '../../interfaces/fee-head';
import { FeeStructureRule } from '../../interfaces/fee-rule';
import { AcademicSession } from '../../interfaces/academic-session';
import { schoolDateKey } from '../../utils/school-date.util';

@Component({
  selector: 'app-fee-structure',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './fee-structure.component.html',
  styleUrls: ['./fee-structure.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeeStructureComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private ruleRequest$ = new Subject<void>();
  private generation = 0;
  private destroyed = false;
  private loaded: { school: string; session: AcademicSession; generation: number } | null = null;
  saving = false;
  rulesError = '';
  effectiveDate = '';
  timezone = 'Asia/Kolkata';
  get schoolToday(): string { return schoolDateKey(new Date(), this.timezone); }
  canSave(): boolean { return !!this.loaded && this.matches(this.loaded) && !this.rulesLoading && !this.rulesError && !this.saving; }
  private matches(c: NonNullable<FeeStructureComponent['loaded']>): boolean {
    return !this.destroyed && c.school === feeSchoolKey(this.authStateService) && c.session.id === this.currentSession?.id && c.generation === this.generation;
  }

  sessions: AcademicSession[] = [];
  currentSession: AcademicSession | null = null;
  feeHeads: FeeHead[] = [];
  classes: string[] = [];

  // Set for STUDENT (self) and PARENT (selected child, permission-checked); left blank for ADMIN.
  subjectStudentId = '';
  subjectClassName = '';
  accessDenied = false;

  // Grid: feeGrid[className][feeHeadId] = amount in rupees
  feeGrid: { [className: string]: { [feeHeadId: number]: number } } = {};
  originalGrid: { [className: string]: { [feeHeadId: number]: number } } = {};
  // className values found on fetched fee rules with no matching configured SchoolClass —
  // surfaced to the admin rather than silently dropped or fabricated as a grid row.
  orphanFeeRuleClassNames: string[] = [];

  isEditing = false;
  isLoading = true;
  rulesLoading = false;

  // Fee head management
  showFeeHeadForm = false;
  newFeeHead: Partial<FeeHead> = this.defaultFeeHead();

  constructor(
    private feeHeadService: FeeHeadService,
    private feeRuleService: FeeRuleService,
    private sessionService: AcademicSessionService,
    private schoolService: SchoolService,
    private parentPortalService: ParentPortalService,
    private route: ActivatedRoute,
    private authStateService: AuthStateService,
    private cdr: ChangeDetectorRef,
    private logger: LoggerService,
    private toast: ToastService
  ) {}

  ngOnDestroy(): void {
    this.destroyed = true; this.generation++;
    this.destroy$.next();
    this.destroy$.complete();
  }

  ngOnInit(): void {
    const role = this.authStateService.getUserRole();
    if (role === 'ADMIN' && typeof this.schoolService.getSettings === 'function') this.schoolService.getSettings().pipe(takeUntil(this.destroy$)).subscribe({ next: s => {this.timezone = s.timezone || this.timezone;}, error: () => {} });
    if (role === 'PARENT') {
      const requestedStudentId = this.route.snapshot.queryParamMap.get('studentId');
      if (!requestedStudentId) {
        this.accessDenied = true;
        this.isLoading = false;
        this.toast.error('No child selected', 'Open fee structure from the parent portal.');
        return;
      }
      this.subjectStudentId = requestedStudentId;
      this.parentPortalService.getMyProfile().pipe(takeUntil(this.destroy$)).subscribe({
        next: profile => {
          const child = profile.children.find(child => child.studentId === this.subjectStudentId);
          const allowed = !!child?.canViewFees;
          if (!allowed) {
            this.subjectStudentId = '';
            this.accessDenied = true;
            this.isLoading = false;
            this.toast.error('Fee structure access unavailable', 'Please contact the school administrator.');
            this.cdr.markForCheck();
            return;
          }
          this.subjectClassName = child!.className;
          this.loadInitialData();
        },
        error: () => {
          this.accessDenied = true;
          this.isLoading = false;
          this.toast.error('Could not verify fee structure access');
          this.cdr.markForCheck();
        }
      });
      return;
    } else if (role === 'STUDENT') {
      this.subjectStudentId = this.authStateService.getUserId();
    }
    this.loadInitialData();
  }

  private loadInitialData(): void {
    const initialSchool = feeSchoolKey(this.authStateService);
    this.isLoading = true;
    forkJoin({
      sessions: this.sessionService.getAllSessions(),
      classes: this.schoolService.getClasses(),
      feeHeads: this.feeHeadService.getActiveFeeHeads(this.subjectStudentId || undefined),
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: ({ sessions, classes, feeHeads }) => {
        if (this.destroyed || initialSchool !== feeSchoolKey(this.authStateService)) return;
        this.sessions = sessions;
        this.classes = this.subjectClassName ? classes.filter(c => c === this.subjectClassName) : classes;
        this.feeHeads = feeHeads;
        const current = sessions.find(s => s.current);
        if (current) {
          this.currentSession = current;
          this.loadRules();
        } else if (sessions.length > 0) {
          this.currentSession = sessions[0];
          this.loadRules();
        } else {
          this.isLoading = false;
          this.cdr.markForCheck();
        }
      },
      error: () => {
        if (this.destroyed || initialSchool !== feeSchoolKey(this.authStateService)) return;
        this.rulesError = 'Could not load fee editor setup. Please retry.';
        this.isLoading = false;
        this.cdr.markForCheck();
        this.toast.error('Error', 'Failed to load data.');
      }
    });
  }

  retryLoad(): void { if (!this.currentSession) this.loadInitialData(); else this.loadRules(); }

  loadRules(): void {
    if (this.saving || this.destroyed) return;
    this.ruleRequest$.next(); const generation = ++this.generation;
    this.loaded = null; this.rulesError = ''; this.effectiveDate = ''; this.isEditing = false;
    this.feeGrid = {}; this.originalGrid = {}; this.loadedRules = []; this.orphanFeeRuleClassNames = [];
    if (!this.currentSession || this.accessDenied) { this.rulesLoading = false; this.cdr.markForCheck(); return; }
    const context = { school: feeSchoolKey(this.authStateService), session: { ...this.currentSession }, generation };
    this.feeGrid = {};
    this.originalGrid = {};
    this.loadedRules = [];
    this.orphanFeeRuleClassNames = [];
    this.rulesLoading = true;
    this.isLoading = false;
    this.cdr.markForCheck();

    const rules$ = this.subjectClassName
      ? this.feeRuleService.getRulesBySessionAndClass(context.session.id, this.subjectClassName, this.subjectStudentId)
      : this.feeRuleService.getRulesBySession(context.session.id);
    rules$
      .pipe(takeUntil(this.ruleRequest$), takeUntil(this.destroy$)).subscribe({
        next: (rules) => {
          if (!this.matches(context)) return;
          this.loaded = context;
          this.buildGrid(rules);
          this.originalGrid = JSON.parse(JSON.stringify(this.feeGrid));
          this.rulesLoading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          if (!this.matches(context)) return;
          this.rulesError = 'Could not load fee rules. Please retry.';
          this.rulesLoading = false;
          this.cdr.markForCheck();
          this.toast.error('Error', 'Failed to load fee rules.');
        }
      });
  }

  private loadedRules: FeeStructureRule[] = [];

  private buildGrid(rules: FeeStructureRule[]): void {
    this.loadedRules = rules;
    this.feeGrid = {};
    for (const cls of this.classes) {
      this.feeGrid[cls] = {};
      for (const fh of this.feeHeads) {
        this.feeGrid[cls][fh.id!] = 0;
      }
    }
    // Fill in existing rule amounts (convert paise → rupees). SchoolClass (this.classes) is
    // authoritative — a rule for a className with no matching configured class is a data
    // inconsistency, never a reason to fabricate a new grid row for it.
    const orphanClassNames = new Set<string>();
    for (const rule of rules.filter(r => latestFeeRule(rules, r.feeHeadId, r.className) === r)) {
      if (this.feeGrid[rule.className]) {
        this.feeGrid[rule.className][rule.feeHeadId] = rule.amount / 100;
      } else {
        orphanClassNames.add(rule.className);
      }
    }

    this.orphanFeeRuleClassNames = Array.from(orphanClassNames);
    if (this.orphanFeeRuleClassNames.length > 0) {
      const names = this.orphanFeeRuleClassNames.join(', ');
      this.logger.error(
        `Fee Structure: found fee rule(s) for class name(s) [${names}] with no matching ` +
        `configured SchoolClass. These rules exist in the database but cannot be displayed ` +
        `or edited until a class with that exact name is created in Class Management.`
      );
      this.toast.warning(
        'Data inconsistency detected',
        `Fee rules exist for class name(s) not configured in Class Management: ${names}. Please review Class Management.`
      );
    }
  }

  changeSession(session: AcademicSession): void {
    if (this.saving || this.destroyed) return;
    const origin = this.currentSession;
    if (this.isEditing) {
      this.toast.confirm({
        title: 'Confirm Navigation',
        message: 'Unsaved changes will be lost. Do you want to continue?',
        confirmText: 'Yes, continue!',
        cancelText: 'No, stay here',
      }).then((confirmed) => {
        if (confirmed && !this.destroyed && !this.saving && this.currentSession === origin) {
          this.currentSession = session;
          this.isEditing = false;
          this.loadRules();
        }
      });
    } else {
      this.currentSession = session;
      this.isEditing = false;
      this.loadRules();
    }
  }

  edit(): void { if (this.canSave()) { this.isEditing = true; this.cdr.markForCheck(); } }

  save(): void {
    if (!this.canSave() || !this.loaded) return;
    const context = this.loaded;
    const payloads: { [cls: string]: FeeStructureRule[] } = {};
    try {
      for (const cls of [...this.classes]) {
        const rows = this.feeHeads.map(fh => ({ feeHeadId: fh.id!, academicSessionId: context.session.id, className: cls,
          amount: Math.round((this.feeGrid[cls]?.[fh.id!] ?? 0) * 100), effectiveFrom: context.session.startDate }));
        if (rows.length) payloads[cls] = feeRuleWrite(rows, this.loadedRules, context.session, cls, this.effectiveDate, this.schoolToday);
      }
    } catch (error) { this.toast.error('Effective date / amount', (error as Error).message); return; }
    if (!Object.keys(payloads).length) { this.toast.info('No changes', 'No fee heads are available to save.'); return; }
    this.saving = true; this.cdr.markForCheck();
    this.toast.confirm({ title: 'Save Changes?', message: `Save fee rules for ${context.session.label}?`, confirmText: 'Save', cancelText: 'Cancel' }).then(confirmed => {
      if (!confirmed || !this.matches(context)) { this.saving = false; if (!this.destroyed) this.cdr.markForCheck(); return; }
      const calls = Object.fromEntries(Object.entries(payloads).map(([cls, payload]) => [cls, this.feeRuleService.saveRulesForClass(context.session.id, cls, payload)]));
      forkJoin(calls).pipe(takeUntil(this.destroy$)).subscribe({
        next: () => { this.saving = false; if (!this.matches(context)) return; this.isEditing = false; this.toast.success('Saved', `Fee structure for ${context.session.label} saved.`); this.loadRules(); },
        error: e => { this.saving = false; if (!this.matches(context)) return; this.isEditing = true; this.toast.error('Error', typeof e?.error === 'string' ? e.error : e?.error?.message || 'Could not save fee rules.'); this.cdr.markForCheck(); }
      });
    });
  }

  cancel(): void {
    if (this.saving || !this.loaded) return;
    const context = this.loaded;
    this.toast.confirm({
      title: 'Cancel Editing?',
      message: 'Are you sure you want to discard your changes?',
      confirmText: 'Yes, discard',
      cancelText: 'No, keep editing',
      danger: true,
    }).then((confirmed) => {
      if (confirmed && !this.saving && this.matches(context)) {
        this.isEditing = false;
        this.feeGrid = JSON.parse(JSON.stringify(this.originalGrid));
        this.cdr.markForCheck();
        this.toast.info('Cancelled', 'Changes discarded.');
      }
    });
  }

  // ── Fee Head Management ──────────────────────────────────────────
  editingFeeHeadId: number | null = null;
  editFeeHeadForm: Partial<FeeHead> = {};

  toggleFeeHeadForm(): void {
    this.showFeeHeadForm = !this.showFeeHeadForm;
    if (this.showFeeHeadForm) {
      this.newFeeHead = this.defaultFeeHead();
    }
    this.cdr.markForCheck();
  }

  addFeeHead(): void {
    const fh = this.newFeeHead as FeeHead;
    if (!fh.name?.trim() || !fh.code?.trim()) {
      this.toast.warning('Validation', 'Name and code are required.');
      return;
    }
    fh.code = fh.code.toUpperCase().replace(/\s+/g, '_');
    this.feeHeadService.createFeeHead(fh).pipe(takeUntil(this.destroy$)).subscribe({
      next: (created) => {
        this.feeHeads.push(created);
        for (const cls of this.classes) {
          if (this.feeGrid[cls]) this.feeGrid[cls][created.id!] = 0;
          if (this.originalGrid[cls]) this.originalGrid[cls][created.id!] = 0;
        }
        this.showFeeHeadForm = false;
        this.newFeeHead = this.defaultFeeHead();
        this.cdr.markForCheck();
        this.toast.success('Created', `Fee head "${created.name}" added.`);
      },
      error: (err) => {
        this.logger.error('Error creating fee head:', err);
        this.toast.error('Error', 'Failed to create fee head. Code may already exist.');
      }
    });
  }

  startEditFeeHead(fh: FeeHead): void {
    this.editingFeeHeadId = fh.id!;
    this.editFeeHeadForm = { ...fh };
    this.cdr.markForCheck();
  }

  cancelEditFeeHead(): void {
    this.editingFeeHeadId = null;
    this.editFeeHeadForm = {};
    this.cdr.markForCheck();
  }

  saveEditFeeHead(): void {
    const form = this.editFeeHeadForm as FeeHead;
    if (!form.name?.trim()) {
      this.toast.warning('Validation', 'Name is required.');
      return;
    }
    this.feeHeadService.updateFeeHead(this.editingFeeHeadId!, form)
      .pipe(takeUntil(this.destroy$)).subscribe({
        next: (updated) => {
          const idx = this.feeHeads.findIndex(fh => fh.id === updated.id);
          if (idx >= 0) this.feeHeads[idx] = updated;
          this.editingFeeHeadId = null;
          this.editFeeHeadForm = {};
          this.cdr.markForCheck();
          this.toast.success('Updated', `Fee head "${updated.name}" updated.`);
        },
        error: (err) => {
          this.logger.error('Error updating fee head:', err);
          this.toast.error('Error', 'Failed to update fee head.');
        }
      });
  }

  async deleteFeeHead(fh: FeeHead): Promise<void> {
    const confirmed = await this.toast.confirm({
      title: `Delete "${fh.name}"?`,
      message: 'This will remove the fee head. If it is referenced by existing fee rules, it will be deactivated instead of deleted.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      danger: true,
      icon: 'danger',
    });
    if (!confirmed) return;

    this.feeHeadService.deleteFeeHead(fh.id!).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.feeHeads = this.feeHeads.filter(h => h.id !== fh.id);
        this.cdr.markForCheck();
        this.toast.success('Deleted', `Fee head "${fh.name}" removed.`);
      },
      error: (err) => {
        this.logger.error('Error deleting fee head:', err);
        this.toast.error('Error', 'Failed to delete fee head.');
      }
    });
  }

  frequencyLabel(freq: string): string {
    const labels: Record<string, string> = {
      MONTHLY: 'Monthly', QUARTERLY: 'Quarterly',
      SEMI_ANNUAL: 'Semi-Annual', ANNUAL: 'Annual', ONE_TIME: 'One-Time',
    };
    return labels[freq] ?? freq;
  }

  dueMonthsForFrequency(frequency: string): string {
    switch (frequency) {
      case 'MONTHLY':     return '[1,2,3,4,5,6,7,8,9,10,11,12]';
      case 'QUARTERLY':   return '[1,4,7,10]';
      case 'SEMI_ANNUAL': return '[1,7]';
      case 'ANNUAL':      return '[1]';
      case 'ONE_TIME':    return '[1]';
      default:            return '[1,2,3,4,5,6,7,8,9,10,11,12]';
    }
  }

  onNewFeeHeadFrequencyChange(frequency: string): void {
    this.newFeeHead.frequency = frequency as FeeHead['frequency'];
    this.newFeeHead.dueMonths = this.dueMonthsForFrequency(frequency);
  }

  onEditFeeHeadFrequencyChange(frequency: string): void {
    this.editFeeHeadForm.frequency = frequency as FeeHead['frequency'];
    this.editFeeHeadForm.dueMonths = this.dueMonthsForFrequency(frequency);
  }

  private defaultFeeHead(): Partial<FeeHead> {
    return {
      name: '',
      code: '',
      frequency: 'MONTHLY',
      dueMonths: '[1,2,3,4,5,6,7,8,9,10,11,12]',
      optional: false,
      refundable: false,
      displayOrder: this.feeHeads?.length ?? 0,
      active: true,
    };
  }

  // ── Helpers ──────────────────────────────────────────────────────
  canEdit(): boolean {
    return this.authStateService.getUserRole() === 'ADMIN';
  }

  getGridValue(cls: string, feeHeadId: number): number {
    return this.feeGrid[cls]?.[feeHeadId] ?? 0;
  }

  hasData(): boolean {
    return this.sessions.length > 0 && this.currentSession !== null;
  }

  trackBySession(_index: number, session: AcademicSession): number { return session.id; }
  trackByIndex(index: number): number { return index; }
  trackByFeeHead(_index: number, fh: FeeHead): number { return fh.id!; }
}
