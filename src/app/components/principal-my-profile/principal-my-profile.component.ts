import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { Subject, takeUntil } from 'rxjs';
import { PrincipalProfile, PrincipalService } from '../../services/principal.service';

@Component({
  standalone: true,
  selector: 'app-principal-my-profile',
  imports: [CommonModule, MatIconModule],
  template: `
    <main class="profile-page">
      <section *ngIf="loading" class="loading-card" role="status" aria-label="Loading your Principal profile">
        <span class="loading-avatar"></span>
        <div class="loading-lines"><i></i><i></i><i></i></div>
      </section>

      <section *ngIf="!loading && error" class="state-card" role="alert">
        <mat-icon>cloud_off</mat-icon>
        <h2>Couldn't load your profile</h2>
        <p>{{ error }}</p>
        <button type="button" (click)="load()" [disabled]="loading">Try again</button>
      </section>

      <ng-container *ngIf="!loading && !error && profile as p">
        <header class="profile-hero">
          <div class="identity">
            <div class="avatar">
              <img *ngIf="p.photoUrl; else initials" [src]="p.photoUrl" [alt]="p.name"/>
              <ng-template #initials>{{ getInitials(p.name) }}</ng-template>
            </div>
            <div class="identity-copy">
              <div class="badges"><span>PRINCIPAL</span><span class="active" [class.inactive]="!p.active">{{ p.active ? 'Active' : 'Inactive' }}</span></div>
              <h1>{{ p.name }}</h1>
              <p class="hero-meta"><mat-icon>badge</mat-icon><span>{{ p.loginId || p.userId }}</span></p>
              <p class="hero-meta"><mat-icon>mail_outline</mat-icon><span>{{ p.email }}</span></p>
            </div>
          </div>
        </header>
        <div class="profile-grid">
          <section class="detail-card">
            <div class="card-title"><mat-icon>person_outline</mat-icon><div><h2>Personal details</h2><p>Your basic information</p></div></div>
            <dl>
              <div><dt>Full name</dt><dd>{{ p.name }}</dd></div>
              <div><dt>Gender</dt><dd [class.missing]="!p.details?.gender">{{ p.details?.gender || 'Not added' }}</dd></div>
              <div><dt>Date of birth</dt><dd [class.missing]="!p.details?.dob">{{ p.details?.dob ? (p.details?.dob | date:'d MMM yyyy') : 'Not added' }}</dd></div>
            </dl>
          </section>
          <section class="detail-card">
            <div class="card-title"><mat-icon>contact_mail</mat-icon><div><h2>Contact information</h2><p>How your school can reach you</p></div></div>
            <dl>
              <div><dt>Official email</dt><dd>{{ p.email }}</dd></div>
              <div><dt>Mobile</dt><dd [class.missing]="!p.details?.phoneNumber">{{ p.details?.phoneNumber || 'Not added' }}</dd></div>
              <div><dt>Alternate mobile</dt><dd [class.missing]="!p.details?.alternatePhoneNumber">{{ p.details?.alternatePhoneNumber || 'Not added' }}</dd></div>
              <div><dt>Address</dt><dd [class.missing]="!p.details?.address">{{ p.details?.address || 'Not added' }}</dd></div>
              <div><dt>City / state</dt><dd [class.missing]="!p.details?.city && !p.details?.state">{{ location(p) }}</dd></div>
              <div><dt>PIN code</dt><dd [class.missing]="!p.details?.pinCode">{{ p.details?.pinCode || 'Not added' }}</dd></div>
            </dl>
          </section>
          <section class="detail-card">
            <div class="card-title"><mat-icon>school</mat-icon><div><h2>Professional information</h2><p>Qualifications and experience</p></div></div>
            <dl>
              <div><dt>Qualification</dt><dd [class.missing]="!p.details?.qualification">{{ p.details?.qualification || 'Not added' }}</dd></div>
              <div><dt>Specialization</dt><dd [class.missing]="!p.details?.specialization">{{ p.details?.specialization || 'Not added' }}</dd></div>
              <div><dt>Experience</dt><dd [class.missing]="p.details?.experienceYears == null">{{ p.details?.experienceYears != null ? p.details?.experienceYears + ' years' : 'Not added' }}</dd></div>
              <div><dt>Previous institution</dt><dd [class.missing]="!p.details?.previousInstitution">{{ p.details?.previousInstitution || 'Not added' }}</dd></div>
            </dl>
          </section>
          <section class="detail-card">
            <div class="card-title"><mat-icon>work_outline</mat-icon><div><h2>Employment information</h2><p>Current appointment</p></div></div>
            <dl>
              <div><dt>Joining date</dt><dd [class.missing]="!p.details?.joiningDate">{{ p.details?.joiningDate ? (p.details?.joiningDate | date:'d MMM yyyy') : 'Not added' }}</dd></div>
              <div><dt>Employment type</dt><dd [class.missing]="!p.details?.employmentType">{{ employmentType(p.details?.employmentType) }}</dd></div>
              <div><dt>Principal ID</dt><dd class="code">{{ p.loginId || p.userId }}</dd></div>
            </dl>
          </section>
        </div>
        <p class="profile-note"><mat-icon>info_outline</mat-icon>To update your school profile, contact your school administrator.</p>
      </ng-container>
    </main>
  `,
  styles: [`
    :host{display:block}
    .profile-page{color:var(--edu-text,#1e293b);padding:0 0 24px;font-family:Inter,"Segoe UI",sans-serif}
    .profile-page *{box-sizing:border-box}
    .profile-hero{position:relative;overflow:hidden;min-height:142px;display:flex;align-items:center;background:radial-gradient(circle at 92% 0,rgba(255,255,255,.16) 0 86px,transparent 87px),linear-gradient(118deg,#123b46,#087e88 58%,#12aaa7);border-radius:22px;padding:26px 30px;color:white;box-shadow:0 16px 36px rgba(15,118,110,.16)}
    .identity{display:flex;align-items:center;gap:22px;min-width:0}
    .avatar{width:92px;height:92px;border:3px solid rgba(255,255,255,.48);border-radius:24px;background:linear-gradient(135deg,#15939b,#6dd5cf);display:grid;place-items:center;font-size:2rem;font-weight:800;flex:none;overflow:hidden;box-shadow:0 12px 24px rgba(7,43,51,.26)}
    .avatar img{width:100%;height:100%;object-fit:cover}
    .identity-copy{min-width:0}
    .badges{display:flex;flex-wrap:wrap;gap:9px;align-items:center;font-size:.7rem;letter-spacing:.5px;font-weight:800}
    .badges span{padding:5px 10px;border-radius:999px;background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.18)}
    .badges .active{background:#d8f9e9;color:#087756}
    .badges .inactive{background:#fbe4e4;color:#b42318}
    h1{margin:10px 0 10px;line-height:1.15;font-size:clamp(1.55rem,2.7vw,2.2rem);overflow-wrap:anywhere}
    .hero-meta{margin:5px 0;display:flex;gap:8px;align-items:center;color:#d7f0f0;min-width:0;font-size:.85rem;overflow-wrap:anywhere}
    .hero-meta mat-icon{font-size:18px;width:18px;height:18px;flex:none}
    .profile-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;margin-top:18px}
    .detail-card{border-radius:20px;background:white;border:1px solid #e5ebf2;padding:24px;min-width:0;box-shadow:0 10px 32px rgba(30,48,73,.06)}
    .card-title{display:flex;align-items:center;gap:13px;padding-bottom:15px;border-bottom:1px solid #ecf0f4}
    .card-title>mat-icon{display:grid;place-items:center;padding:10px;width:42px;height:42px;font-size:21px;color:#0f766e;border-radius:12px;background:#e7f8f5}
    .card-title h2{font-size:1.04rem;margin:0 0 3px;line-height:1.3}
    .card-title p{font-size:.78rem;color:#718198;margin:0}
    dl{margin:18px 0 0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    dl>div{position:relative;display:flex;min-width:0;min-height:74px;flex-direction:column;justify-content:center;gap:5px;padding:14px 14px 14px 62px;border:1px solid #e8edf3;border-radius:14px;background:#fbfcfd;transition:background .18s,border-color .18s,box-shadow .18s}
    dl>div:hover{background:#fcfefe;border-color:#c8e5e1;box-shadow:0 7px 16px rgba(15,118,110,.055)}
    dl>div::before{content:'person_outline';position:absolute;left:14px;top:50%;transform:translateY(-50%);width:38px;height:38px;display:grid;place-items:center;border-radius:11px;background:#e9f7f5;color:#187e78;font:normal 19px/1 'Material Icons';font-feature-settings:'liga'}
    .detail-card:nth-child(1) dl>div:nth-child(2)::before{content:'wc'}
    .detail-card:nth-child(1) dl>div:nth-child(3)::before{content:'event'}
    .detail-card:nth-child(2) dl>div:nth-child(1)::before{content:'mail_outline'}
    .detail-card:nth-child(2) dl>div:nth-child(2)::before{content:'phone'}
    .detail-card:nth-child(2) dl>div:nth-child(3)::before{content:'phone_in_talk'}
    .detail-card:nth-child(2) dl>div:nth-child(4)::before{content:'place'}
    .detail-card:nth-child(2) dl>div:nth-child(5)::before{content:'location_city'}
    .detail-card:nth-child(2) dl>div:nth-child(6)::before{content:'markunread_mailbox'}
    .detail-card:nth-child(3) dl>div:nth-child(1)::before{content:'school'}
    .detail-card:nth-child(3) dl>div:nth-child(2)::before{content:'menu_book'}
    .detail-card:nth-child(3) dl>div:nth-child(3)::before{content:'work_history'}
    .detail-card:nth-child(3) dl>div:nth-child(4)::before{content:'business'}
    .detail-card:nth-child(4) dl>div:nth-child(1)::before{content:'event_available'}
    .detail-card:nth-child(4) dl>div:nth-child(2)::before{content:'badge'}
    .detail-card:nth-child(4) dl>div:nth-child(3)::before{content:'fingerprint'}
    dt{font-size:.68rem;color:#75869c;font-weight:650}
    dd{font-size:.85rem;font-weight:700;color:#253750;margin:0;overflow-wrap:anywhere}
    dd.missing{color:#9aa9ba;font-style:italic;font-weight:500}
    dd.code{font-family:ui-monospace,monospace;letter-spacing:.4px}
    .profile-note{display:flex;align-items:center;gap:10px;color:#406e75;background:#eaf8f6;border:1px solid #d3ede9;padding:13px 16px;border-radius:13px;margin:18px 0 0;font-size:.83rem}
    .profile-note mat-icon{font-size:19px;width:19px;height:19px;flex:none}
    .loading-card{display:flex;gap:20px;align-items:center;padding:28px;border-radius:20px;background:#f0f6f7;min-height:170px}
    .loading-avatar{width:88px;height:88px;border-radius:20px;background:#dae9eb}
    .loading-lines{flex:1;display:grid;gap:14px;max-width:440px}
    .loading-lines i{height:16px;border-radius:8px;background:#dae9eb}
    .loading-lines i:nth-child(2){width:70%}.loading-lines i:nth-child(3){width:55%}
    .state-card{text-align:center;padding:36px 24px;border:1px solid #e1e9ef;border-radius:20px;background:white}
    .state-card>mat-icon{color:#9aa8b8;font-size:40px;width:40px;height:40px}
    .state-card h2{margin:10px 0}
    .state-card p{color:#65758c}
    button{padding:10px 18px;background:#173e61;border:0;border-radius:10px;color:white;cursor:pointer;font-weight:650}
    @media(max-width:1050px){dl{grid-template-columns:1fr}}
    @media(max-width:800px){.profile-grid{grid-template-columns:1fr}dl{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:600px){
      .profile-page{padding:0 0 20px}
      .profile-hero{border-radius:18px;padding:20px 16px}
      .identity{gap:14px;align-items:flex-start}
      .avatar{width:68px;height:68px;border-radius:17px;font-size:1.5rem}
      h1{font-size:1.4rem;margin:8px 0}
      .hero-meta{font-size:.78rem}
      .detail-card{border-radius:16px;padding:18px 16px}
      .profile-grid{gap:12px;margin-top:13px}
      dl{grid-template-columns:1fr;gap:10px}
      dl>div{min-height:70px;padding:12px 12px 12px 60px}
      .card-title>mat-icon{width:40px;height:40px;font-size:21px;padding:9px}
      .profile-note{align-items:flex-start}
    }
    @media(max-width:380px){.identity{flex-direction:column}.avatar{width:76px;height:76px}}
  `]
})
export class PrincipalMyProfileComponent implements OnInit, OnDestroy {
  profile: PrincipalProfile | null = null;
  loading = true;
  error = '';
  private readonly destroyed$ = new Subject<void>();

  constructor(private readonly principals: PrincipalService, private readonly cdr: ChangeDetectorRef) {}

  ngOnInit(): void { this.load(); }
  ngOnDestroy(): void { this.destroyed$.next(); this.destroyed$.complete(); }

  load(): void {
    this.loading = true;
    this.error = '';
    this.principals.me().pipe(takeUntil(this.destroyed$)).subscribe({
      next: profile => { this.profile = profile; this.loading = false; this.cdr.markForCheck(); },
      error: () => { this.error = 'Please try again in a moment.'; this.loading = false; this.cdr.markForCheck(); }
    });
  }

  getInitials(name: string): string {
    const parts = name.trim().split(/\s+/);
    return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : name.slice(0, 2)).toUpperCase();
  }

  location(p: PrincipalProfile): string {
    return [p.details?.city, p.details?.state].filter(Boolean).join(', ') || 'Not added';
  }

  employmentType(type?: string | null): string {
    if (!type) return 'Not added';
    return type.charAt(0) + type.slice(1).toLowerCase().replace(/_/g, ' ');
  }
}
