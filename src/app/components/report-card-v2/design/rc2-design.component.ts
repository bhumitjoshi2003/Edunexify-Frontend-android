import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { Activity, ReportCardDesign, ReportCardV2Service } from '../../../services/report-card-v2.service';
import { ToastService } from '../../../services/toast.service';

/**
 * Report Card V2 — Report Card Design (ADMIN, School Settings): the school's one report-card
 * look and its co-scholastic activity list. Logo, name, address, board, affiliation, school code
 * and header image come from School Settings.
 */
@Component({
  selector: 'app-rc2-design',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './rc2-design.component.html',
  styleUrls: ['../rc2-shared.css', './rc2-design.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Rc2DesignComponent implements OnInit, OnDestroy {
  design: ReportCardDesign | null = null;
  activities: Activity[] = [];
  newActivity = '';
  saving = false;
  loadError = '';
  private destroy$ = new Subject<void>();

  readonly toggles: { key: keyof ReportCardDesign; label: string }[] = [
    { key: 'showPhoto', label: 'Student photo' },
    { key: 'showAttendance', label: 'Attendance' },
    { key: 'showCoScholastic', label: 'Co-scholastic grades' },
    { key: 'showTeacherRemark', label: "Class teacher's remark" },
    { key: 'showPrincipalRemark', label: "Principal's remark" },
    { key: 'showRank', label: 'Rank in section' },
    { key: 'showQr', label: 'Verification QR (on published cards — coming with publishing)' },
    { key: 'showPromotion', label: 'Promotion status (coming later)' },
  ];

  constructor(private api: ReportCardV2Service, private toast: ToastService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.api.getDesign().pipe(takeUntil(this.destroy$)).subscribe({
      next: d => { this.design = d; this.cdr.markForCheck(); },
      error: () => { this.loadError = 'Could not load the report card design.'; this.cdr.markForCheck(); },
    });
    this.loadActivities();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  flag(key: keyof ReportCardDesign): boolean { return !!this.design?.[key]; }
  setFlag(key: keyof ReportCardDesign, value: boolean): void {
    if (this.design) (this.design as unknown as Record<string, unknown>)[key] = value;
  }

  save(): void {
    if (!this.design || this.saving) return;
    this.saving = true;
    this.api.saveDesign(this.design).pipe(takeUntil(this.destroy$)).subscribe({
      next: d => { this.design = d; this.saving = false; this.toast.success('Design saved', 'New report cards use it straight away.'); this.cdr.markForCheck(); },
      error: e => { this.saving = false; this.toast.error('Could not save', e?.error?.message || 'Please try again.'); this.cdr.markForCheck(); },
    });
  }

  private loadActivities(): void {
    this.api.listActivities().pipe(takeUntil(this.destroy$)).subscribe(list => { this.activities = list; this.cdr.markForCheck(); });
  }

  addActivity(): void {
    const name = this.newActivity.trim();
    if (!name) return;
    this.api.createActivity(name).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => { this.newActivity = ''; this.loadActivities(); },
      error: e => this.toast.error('Could not add activity', e?.error?.message || 'Please try again.'),
    });
  }

  rename(a: Activity, name: string): void {
    if (!name.trim() || name.trim() === a.name) return;
    this.api.updateActivity(a.id, { name }).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => this.loadActivities(),
      error: e => { this.toast.error('Could not rename', e?.error?.message || 'Please try again.'); this.loadActivities(); },
    });
  }

  toggleActive(a: Activity): void {
    this.api.updateActivity(a.id, { active: !a.active }).pipe(takeUntil(this.destroy$)).subscribe(() => this.loadActivities());
  }

  move(i: number, delta: number): void {
    const j = i + delta;
    if (j < 0 || j >= this.activities.length) return;
    const ids = this.activities.map(a => a.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    this.api.reorderActivities(ids).pipe(takeUntil(this.destroy$)).subscribe(list => { this.activities = list; this.cdr.markForCheck(); });
  }

  trackById(_: number, a: Activity): number { return a.id; }
}
