import { ChangeDetectionStrategy, ChangeDetectorRef, Component, HostListener, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription, takeUntil } from 'rxjs';
import { Rc2Context, Rc2ContextComponent } from '../rc2-context.component';
import { RemarkSaveRow, RemarksPage, ReportCardV2Service } from '../../../services/report-card-v2.service';
import { ToastService } from '../../../services/toast.service';

interface EditRow {
  studentId: string; studentName: string; sectionName: string | null; locked: boolean;
  teacher: string; principal: string; grades: Record<string, string>;
  original: { teacher: string; principal: string; grades: Record<string, string> };
}

/**
 * Report Card V2 — Remarks (ADMIN any class; TEACHER own class/section, enforced by the server):
 * class teacher's remark, co-scholastic grades and (ADMIN only) the principal's remark.
 */
@Component({
  selector: 'app-rc2-remarks',
  standalone: true,
  imports: [CommonModule, FormsModule, Rc2ContextComponent],
  templateUrl: './rc2-remarks.component.html',
  styleUrls: ['../rc2-shared.css', './rc2-remarks.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Rc2RemarksComponent implements OnDestroy {
  page: RemarksPage | null = null;
  rows: EditRow[] = [];
  state: 'idle' | 'loading' | 'loaded' | 'error' = 'idle';
  saving = false;
  private ctx: Rc2Context | null = null;
  private loadSub?: Subscription;
  private destroy$ = new Subject<void>();

  constructor(private api: ReportCardV2Service, private toast: ToastService, private cdr: ChangeDetectorRef) {}

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  @HostListener('window:beforeunload', ['$event'])
  warnBeforeLeaving(event: BeforeUnloadEvent): void {
    if (this.dirtyCount > 0) event.preventDefault();
  }

  get dirtyCount(): number { return this.rows.filter(r => this.isDirty(r)).length; }

  onContext(ctx: Rc2Context): void {
    this.ctx = ctx;
    this.load();
  }

  load(): void {
    this.loadSub?.unsubscribe();
    this.page = null;
    this.rows = [];
    if (!this.ctx?.setup) { this.state = 'idle'; this.cdr.markForCheck(); return; }
    this.state = 'loading';
    this.cdr.markForCheck();
    this.loadSub = this.api.getRemarks(this.ctx.setup.id, this.ctx.sectionId).pipe(takeUntil(this.destroy$)).subscribe({
      next: page => {
        this.page = page;
        this.rows = page.students.map(s => {
          const grades: Record<string, string> = {};
          page.activities.forEach(a => grades[a.id] = s.grades?.[a.id] ?? '');
          return {
            studentId: s.studentId, studentName: s.studentName, sectionName: s.sectionName, locked: !!s.locked,
            teacher: s.teacherRemark ?? '', principal: s.principalRemark ?? '', grades,
            original: { teacher: s.teacherRemark ?? '', principal: s.principalRemark ?? '', grades: { ...grades } },
          };
        });
        this.state = 'loaded';
        this.cdr.markForCheck();
      },
      error: e => {
        this.state = 'error';
        this.toast.error('Could not load remarks', e?.error?.message || 'Please try again.');
        this.cdr.markForCheck();
      },
    });
  }

  isDirty(r: EditRow): boolean {
    return r.teacher !== r.original.teacher || r.principal !== r.original.principal
      || Object.keys(r.grades).some(k => r.grades[k] !== r.original.grades[k]);
  }

  save(): void {
    if (!this.page || this.saving) return;
    const canPrincipal = this.page.canEditPrincipal;
    const changes: RemarkSaveRow[] = this.rows.filter(r => this.isDirty(r)).map(r => {
      const grades: Record<string, string> = {};
      Object.keys(r.grades).forEach(k => { if (r.grades[k] !== r.original.grades[k]) grades[k] = r.grades[k]; });
      return {
        studentId: r.studentId,
        teacherRemark: r.teacher !== r.original.teacher ? r.teacher : null,
        // A teacher never sends the principal's remark (the server refuses it anyway).
        principalRemark: canPrincipal && r.principal !== r.original.principal ? r.principal : null,
        grades,
      };
    });
    if (changes.length === 0) return;
    this.saving = true;
    this.api.saveRemarks(this.page.setupId, changes).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.saving = false;
        this.rows.forEach(r => r.original = { teacher: r.teacher, principal: r.principal, grades: { ...r.grades } });
        this.toast.success('Saved', `${changes.length} student${changes.length === 1 ? '' : 's'} updated.`);
        this.cdr.markForCheck();
      },
      error: e => {
        this.saving = false;
        this.toast.error('Nothing was saved', e?.error?.message || 'Please try again.');
        this.cdr.markForCheck();
      },
    });
  }

  trackByStudent(_: number, r: EditRow): string { return r.studentId; }
}
