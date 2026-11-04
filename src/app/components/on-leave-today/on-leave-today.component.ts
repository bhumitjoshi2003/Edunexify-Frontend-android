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
      <div class="olt-accent"></div>

      <div class="olt-head">
        <div class="olt-title-wrap">
          <div class="olt-title-icon"><mat-icon>event_busy</mat-icon></div>
          <div>
            <p class="olt-eyebrow">Today's availability</p>
            <h2 id="olt-title">On Leave Today</h2>
          </div>
        </div>
        <div class="olt-date" *ngIf="data">
          <mat-icon>calendar_today</mat-icon>
          <span>{{ data.date | date:'EEE, d MMM' }}</span>
        </div>
      </div>

      <div class="olt-loading" *ngIf="loading" aria-busy="true" aria-label="Loading today's leave information">
        <span class="olt-sk olt-sk-avatar"></span>
        <div class="olt-sk-copy">
          <span class="olt-sk olt-sk-line-lg"></span>
          <span class="olt-sk olt-sk-line-sm"></span>
        </div>
        <span class="olt-sk olt-sk-pill"></span>
      </div>

      <div class="olt-muted olt-state" *ngIf="!loading && failed">
        <div class="olt-state-icon"><mat-icon>cloud_off</mat-icon></div>
        <div>
          <strong>Leave information is unavailable</strong>
          <span>We couldn't load today's approved leaves.</span>
        </div>
        <button type="button" class="olt-retry" (click)="load()">Retry</button>
      </div>

      <ng-container *ngIf="!loading && !failed && data">
        <div class="olt-muted olt-state olt-state--success" *ngIf="!data.staff.length && !data.students.length">
          <div class="olt-state-icon"><mat-icon>task_alt</mat-icon></div>
          <div>
            <strong>Everyone is available today</strong>
            <span>No approved staff or student leave for today.</span>
          </div>
        </div>

        <a class="olt-cover" *ngIf="data.periodsNeedingSubstitute > 0" routerLink="/dashboard/teacher-substitutions">
          <div class="olt-cover-icon"><mat-icon>swap_horiz</mat-icon></div>
          <div class="olt-cover-copy">
            <strong>Substitution needed</strong>
            <span>{{ data.periodsNeedingSubstitute }} period{{ data.periodsNeedingSubstitute === 1 ? '' : 's' }} still need cover</span>
          </div>
          <mat-icon class="olt-arrow">arrow_forward</mat-icon>
        </a>

        <div class="olt-group" *ngIf="data.staff.length">
          <div class="olt-group-head">
            <h3>Staff</h3>
            <span>{{ data.staff.length }} on leave</span>
          </div>
          <ul>
            <li *ngFor="let t of data.staff; trackBy: trackByLeave">
              <div class="olt-person-avatar olt-person-avatar--staff">{{ t.teacherName.charAt(0).toUpperCase() }}</div>
              <div class="olt-main">
                <strong>{{ t.teacherName }}</strong>
                <span class="olt-sub">
                  <mat-icon>date_range</mat-icon>
                  {{ t.startDate | date:'d MMM' }}<ng-container *ngIf="t.endDate !== t.startDate"> – {{ t.endDate | date:'d MMM' }}</ng-container>
                </span>
                <span class="olt-reason" *ngIf="t.reason">{{ t.reason }}</span>
              </div>
              <a class="olt-pill olt-pill--warning" *ngIf="t.periodsNeedingSubstitute > 0" routerLink="/dashboard/teacher-substitutions"
                 [attr.aria-label]="t.periodsNeedingSubstitute + ' periods need substitution for ' + t.teacherName">
                <mat-icon>warning_amber</mat-icon>
                {{ t.periodsNeedingSubstitute }} need cover
              </a>
              <span class="olt-pill olt-ok" *ngIf="t.periodsToday > 0 && t.periodsNeedingSubstitute === 0">
                <mat-icon>verified</mat-icon>
                Covered
              </span>
            </li>
          </ul>
        </div>

        <div class="olt-group" *ngIf="data.students.length">
          <div class="olt-group-head">
            <h3>Students</h3>
            <span>{{ data.students.length }} on leave</span>
          </div>
          <ul>
            <li *ngFor="let s of data.students; trackBy: trackByLeave">
              <div class="olt-person-avatar olt-person-avatar--student">{{ s.studentName.charAt(0).toUpperCase() }}</div>
              <div class="olt-main">
                <strong>{{ s.studentName }}</strong>
                <span class="olt-sub">
                  <mat-icon>school</mat-icon>
                  Class {{ s.className }}<ng-container *ngIf="s.sectionName">-{{ s.sectionName }}</ng-container>
                  <span class="olt-id">· {{ s.studentId }}</span>
                </span>
              </div>
            </li>
          </ul>
        </div>
      </ng-container>
    </section>
  `,
  styles: [`
    .olt-card {
      position: relative;
      overflow: hidden;
      background: linear-gradient(180deg, #ffffff 0%, #fbfdff 100%);
      border: 1px solid #e8eef7;
      border-radius: 20px;
      padding: 18px 20px;
      box-shadow: 0 8px 24px rgba(15, 23, 42, 0.07);
      margin-bottom: 16px;
    }
    .olt-accent {
      position: absolute;
      inset: 0 auto 0 0;
      width: 4px;
      background: linear-gradient(180deg, #4338ca, #14b8a6);
    }
    .olt-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      margin-bottom: 14px;
    }
    .olt-title-wrap { display: flex; align-items: center; gap: 11px; min-width: 0; }
    .olt-title-icon {
      width: 40px; height: 40px; border-radius: 12px;
      display: grid; place-items: center; flex-shrink: 0;
      color: #4338ca;
      background: linear-gradient(135deg, #eef2ff, #e0e7ff);
      border: 1px solid #dbe3ff;
    }
    .olt-title-icon mat-icon { font-size: 21px; width: 21px; height: 21px; }
    .olt-eyebrow {
      margin: 0 0 2px;
      color: #818cf8;
      font-size: 0.66rem;
      font-weight: 800;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    .olt-head h2 { margin: 0; font-size: 1.05rem; font-weight: 800; color: #0f172a; }
    .olt-date {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 7px 10px; border-radius: 10px;
      color: #64748b; background: #f8fafc; border: 1px solid #eef2f7;
      font-size: 0.74rem; font-weight: 700; white-space: nowrap;
    }
    .olt-date mat-icon { font-size: 15px; width: 15px; height: 15px; color: #6366f1; }

    .olt-group + .olt-group { margin-top: 12px; padding-top: 12px; border-top: 1px solid #eef2f7; }
    .olt-group-head {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
      margin: 0 0 7px;
    }
    .olt-group-head h3 {
      margin: 0; color: #475569; font-size: 0.72rem; font-weight: 800;
      letter-spacing: .06em; text-transform: uppercase;
    }
    .olt-group-head span { color: #94a3b8; font-size: 0.7rem; font-weight: 700; }
    .olt-group ul { list-style: none; margin: 0; padding: 0; }
    .olt-group li {
      display: flex; align-items: center; gap: 12px;
      min-height: 58px; padding: 9px 10px; border-radius: 13px;
      transition: background .15s ease;
    }
    .olt-group li + li { border-top: 1px solid #f1f5f9; border-radius: 0; }
    .olt-group li:hover { background: #f8fafc; }
    .olt-person-avatar {
      width: 40px; height: 40px; border-radius: 12px;
      display: grid; place-items: center; flex: 0 0 40px;
      font-size: .88rem; font-weight: 800;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.6);
    }
    .olt-person-avatar--staff { background: #eef2ff; color: #4338ca; }
    .olt-person-avatar--student { background: #ecfeff; color: #0f766e; }
    .olt-main { display: flex; flex: 1; flex-direction: column; min-width: 0; gap: 3px; }
    .olt-main strong { font-size: 0.88rem; color: #1e293b; overflow-wrap: anywhere; }
    .olt-sub {
      display: flex; align-items: center; gap: 4px;
      font-size: 0.72rem; color: #64748b; overflow-wrap: anywhere;
    }
    .olt-sub mat-icon { font-size: 13px; width: 13px; height: 13px; color: #94a3b8; }
    .olt-id { color: #94a3b8; }
    .olt-reason {
      display: block; max-width: 720px;
      color: #64748b; font-size: .72rem; line-height: 1.35;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }

    .olt-pill {
      display: inline-flex; align-items: center; gap: 5px;
      flex-shrink: 0; padding: 5px 10px; border-radius: 999px;
      font-size: 0.69rem; font-weight: 800; text-decoration: none; white-space: nowrap;
    }
    .olt-pill mat-icon { font-size: 14px; width: 14px; height: 14px; }
    .olt-pill--warning { background: #fff7ed; color: #c2410c; border: 1px solid #fed7aa; }
    .olt-ok { background: #ecfdf5; color: #15803d; border: 1px solid #bbf7d0; }

    .olt-cover {
      display: flex; align-items: center; gap: 10px;
      padding: 10px 12px; border-radius: 13px;
      background: linear-gradient(90deg, #fff7ed, #fffbeb);
      border: 1px solid #fed7aa;
      color: #9a3412; text-decoration: none; margin-bottom: 12px;
    }
    .olt-cover-icon {
      width: 34px; height: 34px; border-radius: 10px;
      display: grid; place-items: center; background: #ffedd5; color: #ea580c;
    }
    .olt-cover-icon mat-icon { font-size: 19px; width: 19px; height: 19px; }
    .olt-cover-copy { display: flex; flex: 1; flex-direction: column; min-width: 0; }
    .olt-cover-copy strong { font-size: .78rem; }
    .olt-cover-copy span { font-size: .7rem; color: #b45309; font-weight: 600; }
    .olt-cover .olt-arrow { margin-left: auto; font-size: 18px; width: 18px; height: 18px; }

    .olt-muted { color: #64748b; font-size: 0.82rem; }
    .olt-state {
      display: flex; align-items: center; gap: 10px;
      min-height: 54px; padding: 10px 12px; border-radius: 13px;
      background: #f8fafc; border: 1px solid #eef2f7;
    }
    .olt-state--success { background: #f0fdf4; border-color: #dcfce7; }
    .olt-state-icon {
      width: 34px; height: 34px; border-radius: 10px;
      display: grid; place-items: center; flex-shrink: 0;
      background: #eef2ff; color: #6366f1;
    }
    .olt-state--success .olt-state-icon { background: #dcfce7; color: #16a34a; }
    .olt-state-icon mat-icon { font-size: 19px; width: 19px; height: 19px; }
    .olt-state > div:nth-child(2) { display: flex; flex: 1; flex-direction: column; min-width: 0; }
    .olt-state strong { color: #334155; font-size: .78rem; }
    .olt-state span { font-size: .72rem; }
    .olt-retry {
      border: 1px solid #cbd5e1; background: #fff; color: #334155;
      border-radius: 9px; padding: 6px 11px; font-weight: 800; cursor: pointer;
    }

    .olt-loading { display: flex; align-items: center; gap: 12px; min-height: 58px; padding: 9px 10px; }
    .olt-sk {
      display: block; overflow: hidden; position: relative;
      background: #e9eef5;
    }
    .olt-sk::after {
      content: ''; position: absolute; inset: 0; transform: translateX(-100%);
      background: linear-gradient(90deg, transparent, rgba(255,255,255,.8), transparent);
      animation: olt-shimmer 1.2s ease-in-out infinite;
    }
    .olt-sk-avatar { width: 40px; height: 40px; border-radius: 12px; flex: 0 0 40px; }
    .olt-sk-copy { display: flex; flex: 1; flex-direction: column; gap: 7px; }
    .olt-sk-line-lg { width: 42%; height: 10px; border-radius: 999px; }
    .olt-sk-line-sm { width: 62%; height: 8px; border-radius: 999px; }
    .olt-sk-pill { width: 76px; height: 24px; border-radius: 999px; }
    @keyframes olt-shimmer { to { transform: translateX(100%); } }

    @media (max-width: 600px) {
      .olt-card { padding: 15px 14px; }
      .olt-head { align-items: flex-start; }
      .olt-date { padding: 6px 8px; font-size: .68rem; }
      .olt-group li { align-items: flex-start; flex-wrap: wrap; }
      .olt-main { min-width: calc(100% - 54px); }
      .olt-pill { margin-left: 52px; }
      .olt-reason { white-space: normal; }
      .olt-id { display: none; }
    }
    @media (prefers-reduced-motion: reduce) {
      .olt-sk::after { animation: none; }
    }
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
