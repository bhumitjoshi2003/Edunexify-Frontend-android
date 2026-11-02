import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { NgIf } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

/**
 * The one page title block for authenticated pages.
 *
 *  - `plain` (default): title + subtitle on the page canvas, no banner. Used by every module page.
 *  - `hero`: the single restrained navy banner reserved for a role's home / dashboard page.
 *
 * Content projection:
 *  - default slot   → actions on the right (buttons, a date, …)
 *  - `[phMeta]`     → chips / badges under the title
 *
 * Purely presentational: it renders the inputs it is given and owns no data or navigation.
 */
@Component({
  selector: 'app-page-header',
  standalone: true,
  imports: [NgIf, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="ph" [class.ph-hero]="variant === 'hero'">
      <div class="ph-main">
        <span class="ph-icon" *ngIf="icon" aria-hidden="true"><mat-icon>{{ icon }}</mat-icon></span>
        <div class="ph-text">
          <p class="ph-eyebrow" *ngIf="eyebrow">{{ eyebrow }}</p>
          <h1 class="ph-title">{{ title }}</h1>
          <p class="ph-sub" *ngIf="subtitle">{{ subtitle }}</p>
          <div class="ph-meta"><ng-content select="[phMeta]"></ng-content></div>
        </div>
      </div>
      <div class="ph-actions"><ng-content></ng-content></div>
    </header>
  `,
  styles: [`
    :host { display: block; margin: 0 0 24px; }
    .ph { display: flex; align-items: center; justify-content: space-between; gap: 16px 24px; flex-wrap: wrap; }
    .ph-main { display: flex; align-items: center; gap: 14px; min-width: 0; flex: 1 1 320px; }
    .ph-icon {
      display: inline-grid; place-items: center; flex-shrink: 0; width: 44px; height: 44px; border-radius: 12px;
      background: var(--edu-teal-tint); color: var(--edu-teal-dark); border: 1px solid var(--edu-teal-tint-border);
    }
    .ph-icon mat-icon { font-size: 22px; width: 22px; height: 22px; }
    .ph-text { min-width: 0; }
    .ph-eyebrow { margin: 0 0 4px; font: 500 var(--edu-text-sm)/1.3 var(--edu-font); color: var(--edu-text-muted); }
    .ph-title {
      margin: 0; font: 800 var(--edu-text-xl)/1.2 var(--edu-font); letter-spacing: -0.025em;
      color: var(--edu-text); overflow-wrap: anywhere;
    }
    .ph-sub { margin: 4px 0 0; font: 400 var(--edu-text-base)/1.5 var(--edu-font); color: var(--edu-text-muted); }
    .ph-meta:empty { display: none; }
    .ph-meta { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 8px; }
    .ph-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .ph-actions:empty { display: none; }

    /* Hero: one navy banner for role home pages */
    .ph-hero {
      padding: var(--edu-hero-padding); border-radius: var(--edu-hero-radius);
      background: var(--edu-hero-bg); color: #fff; box-shadow: var(--edu-shadow-md);
    }
    .ph-hero .ph-title { color: #fff; font-size: var(--edu-hero-title-size); font-weight: var(--edu-hero-title-weight); }
    .ph-hero .ph-eyebrow { color: rgba(255, 255, 255, 0.72); }
    .ph-hero .ph-sub { color: rgba(255, 255, 255, 0.78); }
    .ph-hero .ph-icon { background: var(--edu-hero-icon-bg); border-color: rgba(255, 255, 255, 0.18); color: #fff; }

    @media (max-width: 600px) {
      :host { margin-bottom: 18px; }
      .ph-title { font-size: 1.3rem; }
      .ph-hero { padding: 20px 18px; }
      .ph-actions { width: 100%; }
    }
  `],
})
export class PageHeaderComponent {
  @Input({ required: true }) title = '';
  @Input() subtitle = '';
  @Input() eyebrow = '';
  /** Material icon name shown in a tinted tile beside the title. */
  @Input() icon = '';
  @Input() variant: 'plain' | 'hero' = 'plain';
}
