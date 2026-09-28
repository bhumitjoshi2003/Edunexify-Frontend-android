import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { Rc2Context, Rc2ContextComponent } from '../rc2-context.component';
import {
  AvailableExam, ReportCardSetup, ReportCardV2Service, ResultMode, SetupRequest,
} from '../../../services/report-card-v2.service';
import { ToastService } from '../../../services/toast.service';

interface TermRow { key: string; name: string; weight: number | null; }
interface ExamRow { examConfigId: number; examName: string; resultStatus: string; termKey: string | null; weight: number | null; }

/** Report Card V2 — Setup (ADMIN): which exams make up each named card of a class and session. */
@Component({
  selector: 'app-rc2-setup',
  standalone: true,
  imports: [CommonModule, FormsModule, Rc2ContextComponent],
  templateUrl: './rc2-setup.component.html',
  styleUrls: ['../rc2-shared.css', './rc2-setup.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Rc2SetupComponent implements OnDestroy {
  @ViewChild(Rc2ContextComponent) contextBar?: Rc2ContextComponent;

  ctx: Rc2Context | null = null;
  available: AvailableExam[] = [];
  editing: { id: number | null } | null = null;
  name = '';
  mode: ResultMode = 'TOTAL';
  terms: TermRow[] = [];
  exams: ExamRow[] = [];
  saving = false;
  error = '';
  private keySeq = 0;
  private destroy$ = new Subject<void>();

  static readonly MAX_EXAMS = 6;

  constructor(private api: ReportCardV2Service, private toast: ToastService, private cdr: ChangeDetectorRef) {}

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get setups(): ReportCardSetup[] { return this.ctx?.setups ?? []; }
  get canCreate(): boolean { return !!this.ctx?.session && !!this.ctx?.schoolClass; }
  get unusedExams(): AvailableExam[] { return this.available.filter(a => !this.exams.some(e => e.examConfigId === a.id)); }
  get maxExams(): number { return Rc2SetupComponent.MAX_EXAMS; }

  onContext(ctx: Rc2Context): void {
    this.ctx = ctx;
    this.editing = null;
    this.available = [];
    if (ctx.session && ctx.schoolClass) {
      this.api.availableExams(ctx.session.id, ctx.schoolClass.id).pipe(takeUntil(this.destroy$)).subscribe(list => {
        this.available = list;
        this.cdr.markForCheck();
      });
    }
    this.cdr.markForCheck();
  }

  startNew(): void {
    this.editing = { id: null };
    this.name = '';
    this.mode = 'TOTAL';
    this.terms = [];
    this.exams = [];
    this.error = '';
  }

  edit(setup: ReportCardSetup): void {
    this.editing = { id: setup.id };
    this.name = setup.name;
    this.mode = setup.resultMode;
    const keys = new Map<number, string>();
    this.terms = setup.terms.map(t => {
      const key = this.newKey();
      keys.set(t.id, key);
      return { key, name: t.name, weight: this.toPercent(t.weight) };
    });
    this.exams = setup.exams.map(e => ({
      examConfigId: e.examConfigId, examName: e.examName, resultStatus: e.resultStatus ?? 'DRAFT',
      termKey: e.termId != null ? keys.get(e.termId) ?? null : null, weight: this.toPercent(e.weight),
    }));
    this.error = '';
  }

  cancel(): void {
    this.editing = null;
    this.error = '';
  }

  addTerm(): void {
    this.terms = [...this.terms, { key: this.newKey(), name: `Term ${this.terms.length + 1}`, weight: null }];
  }

  removeTerm(i: number): void {
    const key = this.terms[i].key;
    this.terms = this.terms.filter((_, idx) => idx !== i);
    this.exams = this.exams.map(e => e.termKey === key ? { ...e, termKey: null } : e);
  }

  addExam(examId: number | null): void {
    const exam = this.available.find(a => a.id === Number(examId));
    if (!exam || this.exams.length >= this.maxExams) return;
    this.exams = [...this.exams, { examConfigId: exam.id, examName: exam.examName, resultStatus: exam.resultStatus, termKey: this.terms[0]?.key ?? null, weight: null }];
  }

  removeExam(i: number): void {
    this.exams = this.exams.filter((_, idx) => idx !== i);
  }

  move(i: number, delta: number): void {
    const j = i + delta;
    if (j < 0 || j >= this.exams.length) return;
    const copy = [...this.exams];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    this.exams = copy;
  }

  save(): void {
    if (!this.ctx?.session || !this.ctx.schoolClass || this.saving) return;
    const weighted = this.mode === 'WEIGHTED';
    const req: SetupRequest = {
      academicSessionId: this.ctx.session.id,
      classId: this.ctx.schoolClass.id,
      name: this.name,
      resultMode: this.mode,
      displayOrder: 0,
      terms: this.terms.map(t => ({ key: t.key, name: t.name, weight: weighted ? this.toFraction(t.weight) : null })),
      exams: this.exams.map(e => ({ examConfigId: e.examConfigId, termKey: e.termKey, weight: weighted ? this.toFraction(e.weight) : null })),
    };
    this.saving = true;
    this.error = '';
    const call = this.editing?.id ? this.api.updateSetup(this.editing.id, req) : this.api.createSetup(req);
    call.pipe(takeUntil(this.destroy$)).subscribe({
      next: saved => {
        this.saving = false;
        this.editing = null;
        this.toast.success('Report card saved', `"${saved.name}" is ready for remarks and preview.`);
        this.contextBar?.reloadSetups();
        this.cdr.markForCheck();
      },
      error: e => {
        this.saving = false;
        this.error = e?.error?.message || 'Could not save the report card.';
        this.cdr.markForCheck();
      },
    });
  }

  async remove(setup: ReportCardSetup): Promise<void> {
    const ok = await this.toast.confirm({
      title: 'Delete report card',
      message: `Delete "${setup.name}"? Exams and marks are not affected. A card that already has remarks cannot be deleted.`,
      confirmText: 'Delete', cancelText: 'Cancel', danger: true,
    });
    if (!ok) return;
    this.api.deleteSetup(setup.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => { this.toast.success('Report card deleted', setup.name); this.contextBar?.reloadSetups(); },
      error: e => this.toast.error('Could not delete', e?.error?.message || 'Please try again.'),
    });
  }

  termName(key: string | null): string {
    return this.terms.find(t => t.key === key)?.name ?? '';
  }

  describe(setup: ReportCardSetup): string {
    return setup.exams.map(e => e.examName + (setup.resultMode === 'WEIGHTED' && e.weight != null ? ` ${this.toPercent(e.weight)}%` : '')).join(' · ');
  }

  trackById(_: number, s: { id: number }): number { return s.id; }
  trackByKey(_: number, t: TermRow): string { return t.key; }
  trackByExam(_: number, e: ExamRow): number { return e.examConfigId; }

  private newKey(): string { return `t${++this.keySeq}`; }
  private toPercent(fraction: number | null): number | null {
    return fraction == null ? null : Math.round(fraction * 10000) / 100;
  }
  private toFraction(percent: number | null): number | null {
    return percent == null || (percent as unknown) === '' ? null : Math.round(Number(percent) * 100) / 10000;
  }
}
