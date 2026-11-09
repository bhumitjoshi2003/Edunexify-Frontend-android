import { AuthStateService } from '../../auth/auth-state.service';
import { feeSchoolKey, feeRuleWrite, latestFeeRule } from '../../utils/fee-editor.util';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, forkJoin } from 'rxjs';
import { FeeHeadService } from '../../services/fee-head.service';
import { FeeRuleService } from '../../services/fee-rule.service';
import { AcademicSessionService } from '../../services/academic-session.service';
import { SchoolService } from '../../services/school.service';
import { FeeHead } from '../../interfaces/fee-head';
import { FeeStructureRule } from '../../interfaces/fee-rule';
import { AcademicSession } from '../../interfaces/academic-session';
import { ToastService } from '../../services/toast.service';
import { LoggerService } from '../../services/logger.service';
import { schoolDateKey } from '../../utils/school-date.util';

@Component({
  selector: 'app-fee-rule-config',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './fee-rule-config.component.html',
  styleUrl: './fee-rule-config.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeeRuleConfigComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private ruleRequest$ = new Subject<void>();
  private generation = 0;
  private destroyed = false;
  private loaded: { school: string; session: AcademicSession; cls: string; generation: number } | null = null;
  private history: FeeStructureRule[] = [];
  rulesError = '';
  effectiveDate = '';
  timezone = 'Asia/Kolkata';
  get schoolToday(): string { return schoolDateKey(new Date(), this.timezone); }
  canSave(): boolean { return !!this.loaded && !this.rulesLoading && !this.saving && !this.rulesError && this.matches(this.loaded); }
  private matches(c: NonNullable<FeeRuleConfigComponent['loaded']>): boolean {
    return !this.destroyed && c.school === feeSchoolKey(this.authState) && c.session.id === this.selectedSessionId && c.cls === this.selectedClass && c.generation === this.generation;
  }

  sessions: AcademicSession[] = [];
  classes: string[] = [];
  feeHeads: FeeHead[] = [];
  selectedSessionId: number | null = null;
  selectedClass = '';
  rules: FeeStructureRule[] = [];

  isLoading = false;
  rulesLoading = false;
  saving = false;
  editing = false;

  constructor(
    private authState: AuthStateService,
    private feeHeadService: FeeHeadService,
    private feeRuleService: FeeRuleService,
    private sessionService: AcademicSessionService,
    private schoolService: SchoolService,
    private toast: ToastService,
    private logger: LoggerService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    const initialSchool = feeSchoolKey(this.authState);
    if (typeof this.schoolService.getSettings === 'function') this.schoolService.getSettings().pipe(takeUntil(this.destroy$)).subscribe({next: s => { this.timezone = s.timezone || this.timezone; }, error: () => {} });
    this.isLoading = true;
    forkJoin({
      sessions: this.sessionService.getAllSessions(),
      classes: this.schoolService.getClasses(),
      feeHeads: this.feeHeadService.getActiveFeeHeads(),
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: ({ sessions, classes, feeHeads }) => {
        if (this.destroyed || initialSchool !== feeSchoolKey(this.authState)) return;
        this.sessions = sessions;
        this.classes = classes;
        this.feeHeads = feeHeads;
        const current = sessions.find(s => s.current);
        if (current) this.selectedSessionId = current.id;
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: (e) => {
        if (this.destroyed || initialSchool !== feeSchoolKey(this.authState)) return;
        this.rulesError = 'Could not load fee editor setup. Please retry.';
        this.logger.error('Failed to load config data', e);
        this.toast.error('Error', 'Failed to load data.');
        this.isLoading = false;
        this.cdr.markForCheck();
      }
    });
  }

  ngOnDestroy(): void {
    this.destroyed = true; this.generation++; this.ruleRequest$.next();
    this.destroy$.next();
    this.destroy$.complete();
  }

  retryLoad(): void { if (!this.sessions.length || !this.feeHeads.length) { this.rulesError = ''; this.ngOnInit(); } else this.loadRules(); }

  onFilterChange(): void {
    if (this.saving) { if (this.loaded) { this.selectedSessionId = this.loaded.session.id; this.selectedClass = this.loaded.cls; } return; }
    this.loadRules();
  }

  loadRules(): void {
    if (this.saving || this.destroyed) return;
    this.ruleRequest$.next(); const generation = ++this.generation;
    this.rules = []; this.history = []; this.loaded = null; this.rulesError = ''; this.rulesLoading = false; this.editing = false; this.effectiveDate = '';
    const session = this.sessions.find(s => s.id === this.selectedSessionId);
    if (!session || !this.selectedClass) { this.cdr.markForCheck(); return; }
    const context = { school: feeSchoolKey(this.authState), session: { ...session }, cls: this.selectedClass, generation };
    this.rulesLoading = true; this.cdr.markForCheck();
    this.feeRuleService.getRulesBySessionAndClass(context.session.id, context.cls)
      .pipe(takeUntil(this.ruleRequest$), takeUntil(this.destroy$)).subscribe({
        next: history => {
          if (!this.matches(context)) return;
          this.history = history.map(r => ({ ...r }));
          this.rules = this.feeHeads.map(fh => ({ ...(latestFeeRule(history, fh.id!, context.cls) ?? {
            feeHeadId: fh.id!, feeHeadName: fh.name, feeHeadCode: fh.code, academicSessionId: context.session.id,
            className: context.cls, amount: 0, effectiveFrom: context.session.startDate,
          }) }));
          this.loaded = context; this.rulesLoading = false; this.cdr.markForCheck();
        },
        error: () => { if (!this.matches(context)) return; this.rulesError = 'Could not load fee rules. Please retry.'; this.rulesLoading = false; this.cdr.markForCheck(); }
      });
  }

  startEditing(): void { if (this.canSave()) { this.editing = true; this.cdr.markForCheck(); } }
  cancelEditing(): void { if (!this.saving) this.loadRules(); }
  saveRules(): void {
    if (!this.canSave() || !this.loaded) return;
    const context = this.loaded;
    let payload: FeeStructureRule[];
    try { payload = feeRuleWrite(this.rules, this.history, context.session, context.cls, this.effectiveDate, this.schoolToday); }
    catch (error) { this.toast.error('Effective date / amount', (error as Error).message); return; }
    this.saving = true; this.cdr.markForCheck();
    this.feeRuleService.saveRulesForClass(context.session.id, context.cls, payload).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => { this.saving = false; if (!this.matches(context)) return; this.editing = false; this.toast.success('Saved', 'Fee rules saved.'); this.loadRules(); },
      error: e => { this.saving = false; if (!this.matches(context)) return; this.toast.error('Error', typeof e?.error === 'string' ? e.error : e?.error?.message || 'Could not save fee rules.'); this.cdr.markForCheck(); }
    });
  }

  loadedSessionEnd(): string { return this.loaded?.session.endDate ?? ''; }

  formatAmount(paise: number): string {
    return (paise / 100).toFixed(2);
  }

  getFeeHeadName(feeHeadId: number): string {
    return this.feeHeads.find(f => f.id === feeHeadId)?.name ?? '';
  }

  totalForClass(): number {
    return this.rules.reduce((sum, r) => sum + (r.amount || 0), 0);
  }
}
