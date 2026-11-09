import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { SUPPORT_EMAIL } from '../../utils/legal-links';

/**
 * Public /privacy-policy page (no sign-in). The policy text lives only in
 * public/legal/privacy-policy.html, so it can be replaced without touching this component.
 * Keep that file free of HTML comments (the sanitiser strips them and warns), and in step with
 * the code, the Play Data safety form and the backend runbooks (account-deletion.md,
 * gps-retention.md) when behaviour changes.
 */
@Component({
  selector: 'app-privacy-policy-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="lg-page">
      <main class="lg-card">
        <a class="lg-header" routerLink="/home">
          <img src="EdunexifyLogo.png" alt="" class="lg-logo" />
          <span class="lg-brand">Edunexify</span>
        </a>
        <p class="lg-muted" *ngIf="loading">Loading…</p>
        <div *ngIf="!loading && policyHtml" class="lg-policy" [innerHTML]="policyHtml"></div>
        <p *ngIf="!loading && !policyHtml" data-testid="policy-error">
          The privacy policy could not be loaded. Please try again later, or contact
          <a [href]="'mailto:' + supportEmail">{{ supportEmail }}</a>.
        </p>
        <footer class="lg-footer">
          <a routerLink="/account-deletion">Account deletion</a>
          <a routerLink="/home">Edunexify home</a>
        </footer>
      </main>
    </div>
  `,
  styleUrl: './legal-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrivacyPolicyPageComponent implements OnInit, OnDestroy {
  static readonly POLICY_PATH = '/legal/privacy-policy.html';
  readonly supportEmail = SUPPORT_EMAIL;
  loading = true;
  policyHtml: string | null = null;
  private destroy$ = new Subject<void>();

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.http.get(PrivacyPolicyPageComponent.POLICY_PATH, { responseType: 'text' })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: html => { this.policyHtml = html; this.loading = false; this.cdr.markForCheck(); },
        error: () => { this.loading = false; this.cdr.markForCheck(); },
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
