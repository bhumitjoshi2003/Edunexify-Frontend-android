import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

interface PrincipalOverview {
  totalStudents: number;
  totalTeachers: number;
  todayAttendanceRate: number;
  pendingStudentLeaves: number;
  pendingTeacherLeaves: number;
}

/** Read-only academic overview. Approvals are enabled in a separate, audited rollout. */
@Component({
  selector: 'app-principal-dashboard',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="principal-page">
      <header class="principal-hero">
        <div class="principal-icon" aria-hidden="true">🎓</div>
        <div><p class="eyebrow">ACADEMIC LEADERSHIP</p><h1>Principal Dashboard</h1>
          <p>School-wide academic overview</p></div>
      </header>
      <div *ngIf="loading" class="principal-message" role="status">Loading academic overview…</div>
      <div *ngIf="error" class="principal-message" role="alert">
        {{ error }} <button type="button" (click)="load()">Retry</button>
      </div>
      <div class="principal-grid" *ngIf="!loading && overview as data">
        <article><p>Active students</p><strong>{{ data.totalStudents }}</strong></article>
        <article><p>Active teachers</p><strong>{{ data.totalTeachers }}</strong></article>
        <article><p>Today's student attendance</p><strong>{{ data.todayAttendanceRate | number:'1.0-1' }}%</strong></article>
        <article><p>Pending leave requests</p><strong>{{ data.pendingStudentLeaves + data.pendingTeacherLeaves }}</strong>
          <small>{{ data.pendingStudentLeaves }} student · {{ data.pendingTeacherLeaves }} teacher</small></article>
      </div>
      <section class="principal-message">
        <h2>Approvals and signatures</h2>
        <p>Report-card signing and consolidated approval workflows are being introduced separately.
           Existing report-card publication permissions have not changed.</p>
      </section>
    </section>
  `,
  styles: [`
    .principal-page{padding:20px;max-width:1250px;margin:0 auto;color:#23334b}
    .principal-hero{background:#17375e;color:white;border-radius:18px;padding:28px;display:flex;align-items:center;gap:18px;margin-bottom:22px}
    .principal-hero h1{font-size:26px;margin:3px 0 5px}.principal-hero p{margin:0;color:#d4e4f7}
    .principal-icon{font-size:34px;background:#ffffff22;padding:13px;border-radius:12px}
    .eyebrow{font-size:11px;letter-spacing:.12em}
    .principal-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:16px}
    .principal-grid article,.principal-message{background:white;border:1px solid #dee6f0;border-radius:15px;padding:22px;box-shadow:0 5px 18px #18315309}
    .principal-grid p{margin:0 0 15px;color:#63758d}.principal-grid strong{font-size:28px}
    .principal-grid small{display:block;margin-top:6px;color:#697a90}
    .principal-message{margin-top:18px}.principal-message h2{font-size:18px;margin-top:0}
    .principal-message button{padding:7px 14px;border:1px solid #aac0d8;border-radius:7px;background:#f6faff;cursor:pointer}
    @media(max-width:600px){.principal-page{padding:12px}.principal-hero{padding:20px}.principal-hero h1{font-size:21px}}
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
