import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { Subject, takeUntil } from 'rxjs';
import { LeaveService, OnLeaveToday } from '../../services/leave.service';

@Component({
  selector: 'app-on-leave-today',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="olt-card" aria-labelledby="olt-title">
      <header class="olt-head">
        <div>
          <h2 id="olt-title">On leave today</h2>
          <p *ngIf="data">{{ data.staff.length }} staff · {{ data.students.length }} student{{ data.students.length === 1 ? '' : 's' }}</p>
        </div>
      </header>

      <div class="olt-loading" *ngIf="loading" aria-busy="true">
        <div class="olt-skeleton-row" *ngFor="let _ of [1,2]">
          <span class="olt-sk olt-sk-avatar"></span>
          <span class="olt-sk olt-sk-copy"></span>
        </div>
      </div>

      <div class="olt-state" *ngIf="!loading && failed">
        <mat-icon>cloud_off</mat-icon>
        <span>Couldn't load leave information.</span>
        <button type="button" (click)="load()">Retry</button>
      </div>

      <ng-container *ngIf="!loading && !failed && data">
        <div class="olt-state olt-state--success" *ngIf="totalOnLeave === 0">
          <mat-icon>task_alt</mat-icon>
          <span>Everyone's in today.</span>
        </div>

        <ul class="olt-list" *ngIf="totalOnLeave > 0">
          <li *ngFor="let t of visibleStaff; trackBy: trackByLeave">
            <div class="olt-avatar">{{ t.teacherName.charAt(0).toUpperCase() }}</div>
            <div class="olt-copy">
              <strong>{{ t.teacherName }}</strong>
              <span>
                Teacher<ng-container *ngIf="t.reason"> · {{ t.reason }}</ng-container>
                <ng-container *ngIf="t.endDate !== data.date"> · until {{ t.endDate | date:'EEE' }}</ng-container>
              </span>
              <a *ngIf="t.periodsNeedingSubstitute > 0"
                 class="olt-warning"
                 routerLink="/dashboard/teacher-substitutions">
                {{ t.periodsNeedingSubstitute }} period{{ t.periodsNeedingSubstitute === 1 ? '' : 's' }} need substitution
              </a>
            </div>
          </li>

          <li *ngFor="let s of visibleStudents; trackBy: trackByLeave">
            <div class="olt-avatar">{{ s.studentName.charAt(0).toUpperCase() }}</div>
            <div class="olt-copy">
              <strong>{{ s.studentName }}</strong>
              <span>
                Class {{ s.className }}<ng-container *ngIf="s.sectionName">-{{ s.sectionName }}</ng-container>
                <ng-container *ngIf="s.reason"> · {{ s.reason }}</ng-container>
              </span>
            </div>
          </li>
        </ul>

        <button class="olt-show-all" type="button" *ngIf="totalOnLeave > collapsedLimit" (click)="expanded = !expanded">
          {{ expanded ? 'Show less' : 'Show all ' + totalOnLeave }}
          <mat-icon>{{ expanded ? 'expand_less' : 'expand_more' }}</mat-icon>
        </button>
      </ng-container>
    </section>
  `,
  styles: [`
    .olt-card {
      margin-bottom: 16px;
      padding: 16px 18px;
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
    }
    .olt-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
    .olt-head h2 { margin:0; color:#0f172a; font-size:1rem; font-weight:800; }
    .olt-head p { margin:3px 0 0; color:#64748b; font-size:.76rem; font-weight:600; }
    .olt-list { list-style:none; margin:0; padding:0; }
    .olt-list li {
      display:flex; align-items:flex-start; gap:10px;
      min-height:52px; padding:10px 0;
    }
    .olt-list li + li { border-top:1px solid #eef2f7; }
    .olt-avatar {
      width:32px; height:32px; flex:0 0 32px;
      display:grid; place-items:center;
      border-radius:10px; background:#f1f5f9; color:#475569;
      font-size:.76rem; font-weight:800;
    }
    .olt-copy { min-width:0; flex:1; display:flex; flex-direction:column; gap:2px; }
    .olt-copy strong { color:#1e293b; font-size:.84rem; font-weight:750; }
    .olt-copy > span {
      color:#64748b; font-size:.74rem; line-height:1.35;
      overflow:hidden; white-space:nowrap; text-overflow:ellipsis;
    }
    .olt-warning {
      width:max-content; max-width:100%;
      margin-top:3px; color:#b45309;
      font-size:.72rem; font-weight:750; text-decoration:none;
    }
    .olt-warning:hover { text-decoration:underline; }
    .olt-state {
      min-height:48px; display:flex; align-items:center; gap:8px;
      color:#64748b; font-size:.78rem;
    }
    .olt-state mat-icon { width:18px; height:18px; font-size:18px; }
    .olt-state--success { color:#15803d; }
    .olt-state button, .olt-show-all {
      margin-left:auto; border:0; background:transparent;
      color:#087e88; font-weight:800; cursor:pointer;
    }
    .olt-show-all {
      width:100%; display:flex; align-items:center; justify-content:center; gap:4px;
      margin:4px 0 0; padding:8px 0; border-top:1px solid #eef2f7;
      font-size:.75rem;
    }
    .olt-show-all mat-icon { width:17px; height:17px; font-size:17px; }
    .olt-loading { padding-top:4px; }
    .olt-skeleton-row { display:flex; align-items:center; gap:10px; min-height:52px; }
    .olt-sk {
      display:block; position:relative; overflow:hidden; background:#e9eef5;
    }
    .olt-sk::after {
      content:''; position:absolute; inset:0; transform:translateX(-100%);
      background:linear-gradient(90deg,transparent,rgba(255,255,255,.8),transparent);
      animation:olt-shimmer 1.2s ease-in-out infinite;
    }
    .olt-sk-avatar { width:32px; height:32px; border-radius:10px; flex:0 0 32px; }
    .olt-sk-copy { width:58%; height:18px; border-radius:999px; }
    @keyframes olt-shimmer { to { transform:translateX(100%); } }
    @media (max-width:600px) {
      .olt-card { padding:14px; }
      .olt-copy > span { white-space:normal; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
    }
    @media (prefers-reduced-motion:reduce) { .olt-sk::after { animation:none; } }
  `],
})
export class OnLeaveTodayComponent implements OnInit, OnDestroy {
  data: OnLeaveToday | null = null;
  loading = false;
  failed = false;
  expanded = false;
  readonly collapsedLimit = 5;
  private destroy$ = new Subject<void>();

  constructor(private leaveService: LeaveService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void { this.load(); }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get totalOnLeave(): number {
    return (this.data?.staff.length ?? 0) + (this.data?.students.length ?? 0);
  }

  get visibleStaff() {
    if (!this.data) return [];
    return this.expanded ? this.data.staff : this.data.staff.slice(0, this.collapsedLimit);
  }

  get visibleStudents() {
    if (!this.data) return [];
    if (this.expanded) return this.data.students;
    const remaining = Math.max(0, this.collapsedLimit - this.data.staff.length);
    return this.data.students.slice(0, remaining);
  }

  load(): void {
    this.loading = true;
    this.failed = false;
    this.cdr.markForCheck();
    this.leaveService.getOnLeaveToday().pipe(takeUntil(this.destroy$)).subscribe({
      next: d => {
        this.data = d;
        this.expanded = false;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.failed = true;
        this.cdr.markForCheck();
      },
    });
  }

  trackByLeave(_: number, x: { leaveId: number }): number { return x.leaveId; }
}
