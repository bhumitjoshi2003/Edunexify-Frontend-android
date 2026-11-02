import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { Subject, takeUntil } from 'rxjs';
import { LeaveService, OnLeaveToday } from '../../services/leave.service';

/**
 * Admin dashboard card: students and staff on APPROVED leave today, and how many of the staff's
 * periods still need a substitute (with a link to Teacher Substitution — nothing is auto-assigned).
 */
@Component({
  selector: 'app-on-leave-today',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="olt-card" aria-labelledby="olt-title">
      <div class="olt-head">
        <h2 id="olt-title">On Leave Today</h2>
        <span class="olt-date" *ngIf="data">{{ data.date | date:'EEE, d MMM' }}</span>
      </div>

      <div class="olt-muted" *ngIf="loading" aria-busy="true">Loading…</div>

      <div class="olt-muted" *ngIf="!loading && failed">
        <mat-icon>cloud_off</mat-icon><span>Couldn't load who is on leave today.</span>
        <button type="button" class="olt-retry" (click)="load()">Retry</button>
      </div>

      <ng-container *ngIf="!loading && !failed && data">
        <div class="olt-muted" *ngIf="!data.staff.length && !data.students.length">
          <mat-icon>task_alt</mat-icon><span>No one is on approved leave today.</span>
        </div>

        <a class="olt-cover" *ngIf="data.periodsNeedingSubstitute > 0" routerLink="/dashboard/teacher-substitutions">
          <mat-icon>swap_horiz</mat-icon>
          <span>{{ data.periodsNeedingSubstitute }} period{{ data.periodsNeedingSubstitute === 1 ? '' : 's' }} need substitution</span>
          <mat-icon class="olt-arrow">arrow_forward</mat-icon>
        </a>

        <div class="olt-group" *ngIf="data.staff.length">
          <h3>Staff ({{ data.staff.length }})</h3>
          <ul>
            <li *ngFor="let t of data.staff; trackBy: trackByLeave">
              <div class="olt-main">
                <strong>{{ t.teacherName }}</strong>
                <span class="olt-sub">{{ t.startDate | date:'d MMM' }}<ng-container *ngIf="t.endDate !== t.startDate"> – {{ t.endDate | date:'d MMM' }}</ng-container><ng-container *ngIf="t.reason"> · {{ t.reason }}</ng-container></span>
              </div>
              <a class="olt-pill" *ngIf="t.periodsNeedingSubstitute > 0" routerLink="/dashboard/teacher-substitutions"
                 [attr.aria-label]="t.periodsNeedingSubstitute + ' periods need substitution for ' + t.teacherName">
                {{ t.periodsNeedingSubstitute }} period{{ t.periodsNeedingSubstitute === 1 ? '' : 's' }} need cover
              </a>
              <span class="olt-pill olt-ok" *ngIf="t.periodsToday > 0 && t.periodsNeedingSubstitute === 0">Covered</span>
            </li>
          </ul>
        </div>

        <div class="olt-group" *ngIf="data.students.length">
          <h3>Students ({{ data.students.length }})</h3>
          <ul>
            <li *ngFor="let s of data.students; trackBy: trackByLeave">
              <div class="olt-main">
                <strong>{{ s.studentName }}</strong>
                <span class="olt-sub">{{ s.studentId }} · Class {{ s.className }}<ng-container *ngIf="s.sectionName">-{{ s.sectionName }}</ng-container></span>
              </div>
            </li>
          </ul>
        </div>
      </ng-container>
    </section>
  `,
  styles: [`
    .olt-card { background: var(--edu-card-bg); border: 1px solid var(--edu-border); border-radius: var(--edu-card-radius); padding: 18px 20px; box-shadow: var(--edu-shadow-xs); margin-bottom: 20px; }
    .olt-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
    .olt-head h2 { margin: 0; font: 700 var(--edu-text-md)/1.3 var(--edu-font); letter-spacing: -0.01em; color: var(--edu-text); }
    .olt-date { font-size: var(--edu-text-sm); color: var(--edu-text-muted); }
    .olt-muted { display: flex; align-items: center; gap: 8px; color: var(--edu-text-muted); font-size: var(--edu-text-base); flex-wrap: wrap; }
    .olt-muted mat-icon { font-size: 20px; width: 20px; height: 20px; }
    .olt-retry { border: 1px solid var(--edu-border-strong); background: #fff; border-radius: 8px; min-height: 32px; padding: 0 12px; font: 600 var(--edu-text-sm)/1 var(--edu-font); cursor: pointer; }
    /* Actionable but quiet: neutral surface, the warning colour lives only in the icon. */
    .olt-cover { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 10px; background: var(--edu-bg-light);
                 border: 1px solid var(--edu-border); color: var(--edu-text-sec); font-weight: 600; font-size: var(--edu-text-sm); text-decoration: none; margin-bottom: 8px;
                 transition: border-color 120ms, background 120ms; }
    .olt-cover mat-icon { font-size: 18px; width: 18px; height: 18px; color: var(--edu-warning-ink); }
    .olt-cover:hover { border-color: var(--edu-border-strong); background: #fff; }
    .olt-cover .olt-arrow { margin-left: auto; color: var(--edu-text-faint); }
    .olt-group h3 { margin: 12px 0 6px; font-size: var(--edu-text-xs); font-weight: 600; color: var(--edu-text-muted); text-transform: uppercase; letter-spacing: 0.06em; }
    .olt-group ul { list-style: none; margin: 0; padding: 0; }
    .olt-group li { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 0; border-bottom: 1px solid #eef2f6; }
    .olt-group li:last-child { border-bottom: none; }
    .olt-main { display: flex; flex-direction: column; min-width: 0; }
    .olt-main strong { font-size: var(--edu-text-base); font-weight: 600; color: var(--edu-text); overflow-wrap: anywhere; }
    .olt-sub { font-size: var(--edu-text-xs); color: var(--edu-text-muted); overflow-wrap: anywhere; }
    .olt-pill { flex-shrink: 0; height: 22px; display: inline-flex; align-items: center; padding: 0 9px; border-radius: 999px; font-size: var(--edu-text-xs); font-weight: 600; background: var(--edu-warning-bg); border: 1px solid var(--edu-warning-border); color: var(--edu-warning-ink); text-decoration: none; white-space: nowrap; }
    .olt-ok { background: var(--edu-success-bg); border-color: var(--edu-success-border); color: var(--edu-success-ink); }
    @media (max-width: 480px) { .olt-card { padding: 14px; } .olt-group li { align-items: flex-start; flex-direction: column; } }
  `],
})
export class OnLeaveTodayComponent implements OnInit, OnDestroy {
  data: OnLeaveToday | null = null;
  loading = false;
  failed = false;
  private destroy$ = new Subject<void>();

  constructor(private leaveService: LeaveService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void { this.load(); }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(): void {
    this.loading = true;
    this.failed = false;
    this.cdr.markForCheck();
    this.leaveService.getOnLeaveToday().pipe(takeUntil(this.destroy$)).subscribe({
      next: (d) => { this.data = d; this.loading = false; this.cdr.markForCheck(); },
      error: () => { this.loading = false; this.failed = true; this.cdr.markForCheck(); },
    });
  }

  trackByLeave(_: number, x: { leaveId: number }): number { return x.leaveId; }
}
