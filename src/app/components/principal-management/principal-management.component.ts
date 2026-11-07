import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

interface PrincipalProfile { userId: string; name: string; email: string; active: boolean; }

@Component({
  selector: 'app-principal-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="principal-management">
      <div class="hero"><h1>Principal Account</h1>
        <p>Designate your school's principal. Only one active principal account can be created for a school.</p></div>
      <p *ngIf="loading" role="status">Loading principal details…</p>
      <p *ngIf="error" role="alert" class="error">{{ error }}</p>
      <article *ngIf="profile as p">
        <h2>{{ p.name }}</h2>
        <p><strong>Login ID:</strong> {{ p.userId }}</p>
        <p><strong>Email:</strong> {{ p.email }}</p>
        <p><strong>Status:</strong> {{ p.active ? 'Active' : 'Inactive' }}</p>
        <small>For account recovery, the principal can use Forgot password with their login ID and email.</small>
      </article>
      <form *ngIf="!loading && !profile" (ngSubmit)="create()" class="form">
        <h2>Invite a principal</h2>
        <label for="principal-name">Full name</label>
        <input id="principal-name" name="name" [(ngModel)]="name" required maxlength="120"
               autocomplete="name" [disabled]="saving" />
        <label for="principal-email">Official email</label>
        <input id="principal-email" name="email" [(ngModel)]="email" type="email" required maxlength="255"
               autocomplete="email" [disabled]="saving" />
        <p>A one-time password setup link will be emailed. No password is shared with administrators.</p>
        <button type="submit" [disabled]="saving || !name.trim() || !email.trim()">
          {{ saving ? 'Creating account…' : 'Create Principal Account' }}</button>
      </form>
    </section>
  `,
  styles: [`
    .principal-management{max-width:950px;margin:0 auto;padding:20px;color:#22334b}
    .hero{padding:24px;background:#17375e;color:white;border-radius:16px;margin-bottom:20px}
    .hero h1{margin:0 0 8px}.hero p{margin:0;color:#e0ebf8}
    article,.form{background:white;border:1px solid #dae4ef;border-radius:15px;padding:24px}
    .form{display:flex;flex-direction:column;gap:12px}.form h2{margin:0 0 8px}
    input{border:1px solid #c4d2e2;border-radius:8px;padding:12px;font:inherit}
    button{background:#1b3a63;color:white;border:0;border-radius:9px;padding:13px;cursor:pointer}
    button:disabled{opacity:.6;cursor:default}.error{color:#b91c1c}.form p,small{color:#68788d}
    @media(max-width:600px){.principal-management{padding:12px}}
  `]
})
export class PrincipalManagementComponent implements OnInit {
  profile: PrincipalProfile | null = null;
  name = '';
  email = '';
  loading = true;
  saving = false;
  error = '';
  private readonly endpoint = `${environment.apiUrl}/principals`;

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}
  ngOnInit(): void { this.load(); }
  load(): void {
    this.loading = true; this.error = '';
    this.http.get<PrincipalProfile[]>(this.endpoint).subscribe({
      next: data => { this.profile = data[0] ?? null; this.loading = false; this.cdr.markForCheck(); },
      error: () => { this.error = 'Unable to load principal details. Please retry later.'; this.loading = false; this.cdr.markForCheck(); }
    });
  }
  create(): void {
    if (this.saving || !this.name.trim() || !this.email.trim()) return;
    this.saving = true; this.error = '';
    this.http.post<PrincipalProfile>(this.endpoint, {name: this.name.trim(), email: this.email.trim()}).subscribe({
      next: data => { this.profile = data; this.saving = false; this.cdr.markForCheck(); },
      error: err => {
        this.saving = false;
        this.error = err?.error?.message || 'Could not create the principal account. Please check the details and retry.';
        this.cdr.markForCheck();
      }
    });
  }
}
