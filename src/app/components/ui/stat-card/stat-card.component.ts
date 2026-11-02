import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { NgIf } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

export type StatTone = 'brand' | 'info' | 'success' | 'warning' | 'danger' | 'neutral';

/**
 * Compact KPI tile: tinted icon, label, then a large tabular value.
 *
 * Content projection:
 *  - default slot  → the value (callers keep their own pipes / formatting)
 *  - `[scFoot]`    → optional footer line (a note or status badge)
 *
 * `tone` only tints the icon tile — the number itself stays in ink so a row of cards scans calmly.
 */
@Component({
  selector: 'app-stat-card',
  standalone: true,
  imports: [NgIf, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sc" [attr.data-tone]="tone">
      <span class="sc-icon" *ngIf="icon" aria-hidden="true"><mat-icon>{{ icon }}</mat-icon></span>
      <div class="sc-body">
        <span class="sc-label">{{ label }}</span>
        <span class="sc-value"><ng-content></ng-content></span>
        <span class="sc-foot"><ng-content select="[scFoot]"></ng-content></span>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; min-width: 0; }
    .sc {
      --sc-bg: var(--edu-teal-tint); --sc-fg: var(--edu-teal-dark); --sc-bd: var(--edu-teal-tint-border);
      display: flex; align-items: flex-start; gap: 12px; height: 100%; padding: 14px 16px;
      background: var(--edu-card-bg); border: 1px solid var(--edu-border); border-radius: var(--edu-card-radius);
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05), 0 6px 16px -10px rgba(15, 23, 42, 0.14);
    }
    .sc[data-tone='info']    { --sc-bg: var(--edu-info-bg);    --sc-fg: var(--edu-info-ink);    --sc-bd: var(--edu-info-border); }
    .sc[data-tone='success'] { --sc-bg: var(--edu-success-bg); --sc-fg: var(--edu-success-ink); --sc-bd: var(--edu-success-border); }
    .sc[data-tone='warning'] { --sc-bg: var(--edu-warning-bg); --sc-fg: var(--edu-warning-ink); --sc-bd: var(--edu-warning-border); }
    .sc[data-tone='danger']  { --sc-bg: var(--edu-danger-bg);  --sc-fg: var(--edu-danger-ink);  --sc-bd: var(--edu-danger-border); }
    .sc[data-tone='neutral'] { --sc-bg: #f1f5f9; --sc-fg: var(--edu-text-sec); --sc-bd: var(--edu-border); }
    .sc-icon {
      display: grid; place-items: center; flex-shrink: 0; width: 38px; height: 38px; border-radius: 10px;
      background: var(--sc-bg); color: var(--sc-fg); border: 1px solid var(--sc-bd);
    }
    .sc-icon mat-icon { font-size: 20px; width: 20px; height: 20px; }
    .sc-body { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1; }
    .sc-label {
      font: 600 var(--edu-text-xs)/1.3 var(--edu-font); letter-spacing: 0.04em; text-transform: uppercase;
      color: var(--edu-text-muted);
    }
    .sc-value {
      font: 800 var(--edu-text-2xl)/1.1 var(--edu-font); letter-spacing: -0.03em; color: var(--edu-text);
      font-variant-numeric: tabular-nums; overflow-wrap: anywhere;
    }
    .sc-foot { font: 500 var(--edu-text-xs)/1.4 var(--edu-font); color: var(--edu-text-muted); }
    .sc-foot:empty { display: none; }
    @media (max-width: 600px) {
      .sc { padding: 14px; gap: 10px; }
      .sc-icon { width: 36px; height: 36px; }
      .sc-value { font-size: 1.5rem; }
    }
  `],
})
export class StatCardComponent {
  @Input({ required: true }) label = '';
  /** Material icon name. */
  @Input() icon = '';
  @Input() tone: StatTone = 'brand';
}
