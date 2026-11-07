import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpParams } from '@angular/common/http';
import { AuthStateService } from '../../auth/auth-state.service';
import { environment } from '../../../environments/environment';

interface ApprovalItem {
  setupId: number; setupName: string; className: string;
  sectionId: number | null; sectionName: string | null; status: string; stale: boolean;
}
interface ApprovalState { status: string; stale: boolean; returnReason: string | null; }

@Component({
  standalone: true,
  selector: 'app-report-card-approvals',
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="page">
      <header><span class="hero-icon">✅</span><div><h1>Report Card Approvals</h1>
        <p>Teacher review → Principal approval → Admin publication</p></div></header>
      <section class="notice">Approvals apply only to report-card setups enabled by the school Admin.
        If marks, remarks, or report-card content change after approval, both approvals must be renewed.
        You must save your handwritten signature under <strong>My Signature</strong> before approving.</section>
      <div *ngIf="error" class="error" role="alert">{{ error }}</div>
      <div *ngIf="message" class="message" role="status">{{ message }}</div>
      <div *ngIf="loading" class="notice" role="status">Loading approval queue…</div>
      <section *ngIf="!loading && items.length === 0" class="empty">
        No report-card approval workflows are enabled yet.
        <span *ngIf="role === 'ADMIN'">Enable one from Published Report Cards after choosing a report-card setup.</span>
      </section>
      <section class="cards" *ngIf="!loading">
        <article *ngFor="let item of items; trackBy: track" class="card">
          <div class="head"><div><h2>{{ item.setupName }}</h2>
            <p>Class {{ item.className }} · {{ item.sectionName || 'No section' }}</p></div>
            <span class="status" [class.ok]="item.status === 'PRINCIPAL_APPROVED'" [class.warning]="item.stale">
              {{ label(item) }}</span></div>
          <p class="hint" *ngIf="item.status === 'RETURNED'">Returned for correction. The teacher must review and approve again.</p>
          <p class="hint" *ngIf="item.stale">The underlying report card changed after approval. Fresh reviews are required.</p>
          <div class="actions">
            <button *ngIf="role === 'TEACHER'" [disabled]="busy !== null" (click)="act(item, 'teacher-approve')">
              Approve as Class Teacher</button>
            <button *ngIf="role === 'PRINCIPAL'" [disabled]="busy !== null || item.status !== 'TEACHER_APPROVED'"
              (click)="act(item, 'principal-approve')">Approve &amp; Sign</button>
            <button *ngIf="role === 'PRINCIPAL'" class="secondary" [disabled]="busy !== null || item.status !== 'TEACHER_APPROVED'"
              (click)="startReturn(item)">Return for correction</button>
            <span *ngIf="role === 'ADMIN' && item.status === 'PRINCIPAL_APPROVED'" class="hint">Approved and ready for publication.</span>
          </div>
          <div *ngIf="returning === key(item)" class="return-form">
            <label>Reason for correction (required)</label>
            <textarea [(ngModel)]="reason" maxlength="500" rows="3"></textarea>
            <button [disabled]="busy !== null || !reason.trim()" (click)="act(item, 'return')">Confirm return</button>
            <button class="secondary" (click)="returning = null">Cancel</button>
          </div>
        </article>
      </section>
      <button class="refresh" type="button" (click)="load()" [disabled]="loading || busy !== null">Refresh queue</button>
    </main>
  `,
  styles: [`
    .page{max-width:1200px;margin:auto;padding:18px;color:#20334b}
    header{background:linear-gradient(110deg,#102f55,#205f8c);color:white;padding:26px;border-radius:16px;display:flex;gap:16px;align-items:center}
    header h1{font-size:26px;margin:0 0 5px}header p{color:#d3e7fa;margin:0}
    .hero-icon{font-size:29px;background:#ffffff25;padding:13px;border-radius:11px}
    .notice,.empty,.card{background:white;border:1px solid #dce5f0;padding:20px;border-radius:13px;margin-top:16px}
    .notice{line-height:1.5;color:#536881}.empty{color:#66788e}.empty span{display:block;margin-top:8px}
    .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:16px;margin-top:18px}
    .card{margin:0}.head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
    h2{font-size:18px;margin:0 0 5px}.head p{color:#687a90;font-size:13px;margin:0}
    .status{font-size:12px;background:#ecf1fa;padding:6px 9px;border-radius:30px;font-weight:700;white-space:nowrap}
    .status.ok{background:#d9f9e5;color:#08783d}.status.warning{background:#fff1d6;color:#945700}
    .hint{font-size:13px;color:#65788d}.actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px}
    button{border:1px solid #1e4f80;border-radius:8px;background:#1e4f80;color:white;padding:10px 14px;cursor:pointer;font-weight:600}
    button.secondary,.refresh{background:white;color:#204e7a}button:disabled{opacity:.5;cursor:not-allowed}
    .return-form{margin-top:12px}.return-form label{display:block;margin-bottom:5px;font-size:13px}
    textarea{width:100%;border:1px solid #bbcada;border-radius:8px;padding:8px;box-sizing:border-box}
    .return-form button{margin:8px 8px 0 0}.refresh{margin-top:18px}
    .error{color:#b42318;padding:12px}.message{color:#087443;padding:12px}
    @media(max-width:600px){.page{padding:10px}header{padding:20px}header h1{font-size:21px}}
  `]
})
export class ReportCardApprovalsComponent implements OnInit {
  items: ApprovalItem[] = [];
  role: string;
  loading = false; busy: string | null = null;
  error = ''; message = ''; returning: string | null = null; reason = '';

  constructor(private http: HttpClient, auth: AuthStateService, private cdr: ChangeDetectorRef) {
    this.role = auth.getUserRole();
  }
  ngOnInit(): void { this.load(); }
  key(item: ApprovalItem): string { return item.setupId + ':' + (item.sectionId ?? 'all'); }
  track = (_: number, item: ApprovalItem) => this.key(item);
  label(item: ApprovalItem): string {
    return ({ PENDING_TEACHER: 'Awaiting Teacher', TEACHER_APPROVED: 'Awaiting Principal',
      PRINCIPAL_APPROVED: 'Approved', RETURNED: 'Returned', STALE: 'Needs Re-review' } as Record<string,string>)[item.status] || item.status;
  }
  load(): void {
    this.loading = true; this.error = ''; this.cdr.markForCheck();
    this.http.get<ApprovalItem[]>(`${environment.apiUrl}/report-card-approvals/queue`).subscribe({
      next: items => { this.items = items; this.loading = false; this.cdr.markForCheck(); },
      error: () => { this.loading = false; this.error = 'Could not load the approval queue.'; this.cdr.markForCheck(); }
    });
  }
  startReturn(item: ApprovalItem): void { this.returning = this.key(item); this.reason = ''; }
  act(item: ApprovalItem, action: 'teacher-approve' | 'principal-approve' | 'return'): void {
    if (this.busy) return;
    this.busy = this.key(item); this.error = ''; this.message = '';
    const params = item.sectionId == null ? new HttpParams() : new HttpParams().set('sectionId', String(item.sectionId));
    const url = `${environment.apiUrl}/report-card-approvals/setups/${item.setupId}/${action}`;
    this.http.post<ApprovalState>(url, action === 'return' ? { reason: this.reason.trim() } : {}, { params }).subscribe({
      next: () => { this.busy = null; this.returning = null; this.message = 'Review recorded. The next reviewer can now continue.'; this.load(); },
      error: response => { this.busy = null; this.error = response?.error?.message || 'Could not record this action.'; this.cdr.markForCheck(); }
    });
  }
}
