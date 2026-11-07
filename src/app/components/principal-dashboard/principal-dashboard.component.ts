import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

interface ClassAttendance {
  className: string; students: number; attendanceRate: number; workingDays: number;
}
interface PrincipalOverview {
  totalStudents: number;
  totalTeachers: number;
  todayAttendanceRate: number;
  pendingStudentLeaves: number;
  pendingTeacherLeaves: number;
  publishedReportCards: number;
  awaitingTeacherReview: number;
  awaitingPrincipalReview: number;
  readyForPublication: number;
  returnedForCorrection: number;
  classAttendance: ClassAttendance[];
}

/** School-scoped academic operations; financial administration remains Admin-only. */
@Component({
  selector: 'app-principal-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="principal-page">
      <header class="hero">
        <div class="hero-icon" aria-hidden="true">🎓</div>
        <div class="hero-text">
          <p class="eyebrow">ACADEMIC LEADERSHIP</p>
          <h1>Principal Dashboard</h1>
          <p>Attendance, school performance and approvals at a glance</p>
        </div>
        <button type="button" class="refresh" (click)="load()" [disabled]="loading">Refresh</button>
      </header>

      <div *ngIf="loading" class="skeleton-grid" role="status" aria-label="Loading principal overview">
        <div class="skeleton" *ngFor="let x of [1,2,3,4]"></div>
      </div>
      <div *ngIf="error" class="notice error" role="alert">
        {{ error }} <button type="button" (click)="load()">Try again</button>
      </div>

      <ng-container *ngIf="!loading && overview as data">
        <section class="summary" aria-label="School overview">
          <article class="metric"><span>Active students</span><strong>{{ data.totalStudents }}</strong><small>Currently enrolled</small></article>
          <article class="metric"><span>Active teachers</span><strong>{{ data.totalTeachers }}</strong><small>Teaching staff</small></article>
          <article class="metric"><span>Today's attendance</span><strong>{{ data.todayAttendanceRate | number:'1.0-1' }}%</strong><small>Recorded student attendance</small></article>
          <article class="metric"><span>Pending leave requests</span><strong>{{ data.pendingStudentLeaves + data.pendingTeacherLeaves }}</strong>
            <small>{{ data.pendingStudentLeaves }} student · {{ data.pendingTeacherLeaves }} teacher</small></article>
        </section>

        <section class="panel" aria-labelledby="approval-title">
          <div class="panel-heading">
            <div><p class="eyebrow">ACTION CENTER</p><h2 id="approval-title">Report card approvals</h2>
              <p>Saved workflow states. Review the queue for changes requiring fresh signatures.</p></div>
            <a routerLink="/dashboard/report-card-approvals" class="primary-link">Open approval queue</a>
          </div>
          <div class="pipeline">
            <div><span>Awaiting class teacher</span><strong>{{ data.awaitingTeacherReview }}</strong></div>
            <div><span>Awaiting Principal</span><strong>{{ data.awaitingPrincipalReview }}</strong></div>
            <div><span>Approved for publication</span><strong>{{ data.readyForPublication }}</strong></div>
            <div><span>Returned for correction</span><strong>{{ data.returnedForCorrection }}</strong></div>
          </div>
          <p class="footnote">{{ data.publishedReportCards }} active issued report cards across the school.</p>
          <a routerLink="/dashboard/my-signature" class="inline-link">Manage my signature</a>
        </section>

        <section class="panel" aria-labelledby="classes-title">
          <div class="panel-heading">
            <div><p class="eyebrow">ACADEMIC MONITORING</p><h2 id="classes-title">Class-wise attendance</h2>
              <p>Current month · school attendance records</p></div>
          </div>
          <div *ngIf="!data.classAttendance?.length" class="notice">No class attendance data is available yet.</div>
          <div class="table-scroll" *ngIf="data.classAttendance?.length">
            <table>
              <thead><tr><th scope="col">Class</th><th scope="col">Students</th>
                <th scope="col">Working days</th><th scope="col">Attendance</th></tr></thead>
              <tbody>
                <tr *ngFor="let cls of data.classAttendance">
                  <th scope="row">Class {{ cls.className }}</th>
                  <td>{{ cls.students }}</td><td>{{ cls.workingDays }}</td>
                  <td><span *ngIf="cls.workingDays; else noAttendance" class="rate"
                            [class.low]="cls.attendanceRate < 75">
                    {{ cls.attendanceRate | number:'1.0-1' }}%</span>
                    <ng-template #noAttendance><span class="muted">Not recorded</span></ng-template>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </ng-container>
    </main>
  `,
  styles: [`
    .principal-page{padding:18px;max-width:1400px;margin:0 auto;color:#20314b}
    .hero{background:#17345a;color:white;border-radius:17px;padding:24px;display:flex;align-items:center;gap:16px}
    .hero-icon{font-size:30px;background:#ffffff22;border-radius:11px;padding:13px}
    .hero-text{flex:1}.hero h1{font-size:27px;margin:2px 0 5px}.hero p{margin:0;color:#dbe8f6}
    .eyebrow{font-size:11px;letter-spacing:.12em;font-weight:700}
    .hero .eyebrow{color:#b6d6f4}.refresh{border:1px solid #ffffff88;background:transparent;color:white;border-radius:9px;padding:10px 16px;cursor:pointer}
    .summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:15px;margin-top:18px}
    .metric,.panel,.notice{background:#fff;border:1px solid #e0e7f0;border-radius:14px;padding:20px;box-shadow:0 4px 15px #1535540b}
    .metric span{display:block;color:#63768b;font-weight:600}.metric strong{font-size:29px;display:block;margin:8px 0}
    .metric small,.footnote,.panel-heading p,.muted{color:#63768b}
    .panel{margin-top:18px}.panel-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px}
    .panel-heading h2{margin:4px 0 6px;font-size:21px}.panel-heading p{margin:0;font-size:13px}
    .pipeline{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
    .pipeline>div{border:1px solid #e2e9f2;background:#f8fafd;border-radius:11px;padding:15px}
    .pipeline span{font-size:13px;color:#526880;display:block;min-height:35px}
    .pipeline strong{font-size:26px;display:block;margin-top:8px}
    .primary-link{background:#173e69;color:#fff;text-decoration:none;padding:11px 15px;border-radius:9px;font-weight:700;white-space:nowrap}
    .inline-link{color:#155e90;font-weight:700}.footnote{font-size:13px;margin-top:16px}
    .table-scroll{overflow-x:auto}table{width:100%;border-collapse:collapse;text-align:left}
    th,td{padding:12px;border-bottom:1px solid #e9edf4}thead th{font-size:12px;text-transform:uppercase;color:#667b93}
    tbody th{font-weight:650}.rate{color:#08794e;font-weight:700}.rate.low{color:#b54834}
    .notice{margin-top:18px}.error{color:#a72126}.notice button{margin-left:12px;padding:7px 12px;cursor:pointer}
    .skeleton-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:15px;margin-top:18px}
    .skeleton{height:120px;border-radius:14px;background:linear-gradient(90deg,#e8eef5,#f7f9fc,#e8eef5);background-size:200% 100%;animation:shimmer 1.5s infinite}
    @keyframes shimmer{to{background-position-x:-200%}}
    @media(max-width:950px){.summary,.pipeline,.skeleton-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:580px){.principal-page{padding:12px}.hero{padding:16px;flex-wrap:wrap}.hero h1{font-size:22px}
      .summary,.pipeline,.skeleton-grid{gap:9px}.metric,.panel{padding:14px}
      .metric strong{font-size:24px}.panel-heading{align-items:stretch;flex-direction:column}.primary-link{text-align:center}
      .pipeline span{min-height:55px}.pipeline strong{font-size:23px}}
  `]
})
export class PrincipalDashboardComponent implements OnInit {
  overview: PrincipalOverview | null = null;
  loading = false;
  error = '';
  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}
  ngOnInit(): void { this.load(); }
  load(): void {
    this.loading = true; this.error = ''; this.overview = null; this.cdr.markForCheck();
    this.http.get<PrincipalOverview>(`${environment.apiUrl}/principal/overview`).subscribe({
      next: data => { this.overview = data; this.loading = false; this.cdr.markForCheck(); },
      error: () => { this.error = 'Academic overview could not be loaded.'; this.loading = false; this.cdr.markForCheck(); }
    });
  }
}
