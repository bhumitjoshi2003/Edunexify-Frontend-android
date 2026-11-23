import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Injector, Input, OnChanges, OnDestroy, Output, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { Subscription } from 'rxjs';
import { Guidance, GuidanceAction, GuidanceKind } from '../../guidance/guidance';
import { HelpService } from '../../help/help.service';

const ICONS: Record<GuidanceKind, string> = {
  'empty': 'inbox',
  'prerequisite': 'checklist',
  'load-error': 'cloud_off',
  'no-permission': 'lock',
  'plan': 'workspace_premium',
  'unpublished': 'schedule',
  'no-match': 'filter_alt_off',
};

/**
 * A compact, inline page state: icon, what happened, what to do next. "Open …" actions appear only
 * if the viewer may open that page now (HelpService.allowedLinks — role, workspace, plan feature,
 * Principal permission); otherwise the fallback says whom to ask. Load errors offer Retry and
 * no-match offers Clear filters, both handled by the page.
 * Shared by the web and Android clients — keep the two copies identical.
 */
@Component({
  selector: 'app-guidance',
  standalone: true,
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host { display: block; }
    .gd { display: flex; gap: 10px; align-items: flex-start; padding: 12px 14px; border-radius: 12px;
      border: 1px solid var(--edu-border, #e2e8f0); background: #fff; color: var(--edu-text, #1e293b); text-align: left; }
    .gd-icon { flex: 0 0 22px; width: 22px; height: 22px; font-size: 22px; color: var(--edu-text-muted, #94a3b8); }
    .gd-body { flex: 1; min-width: 0; }
    .gd-title { margin: 1px 0 2px; font-size: .9rem; font-weight: 700; color: var(--edu-navy, #0f172a); }
    .gd-msg { margin: 0; font-size: .82rem; line-height: 1.45; color: var(--edu-text-sec, #64748b); }
    .gd-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
    .gd-btn { display: inline-flex; align-items: center; gap: 4px; padding: 6px 12px; border-radius: 10px;
      border: 1px solid #cbd5e1; background: #fff; font: inherit; font-size: .8rem; font-weight: 700;
      color: var(--edu-teal-dark, #0f766e); cursor: pointer; }
    .gd-btn:hover { background: #f0fdfa; border-color: #99f6e4; }
    .gd-btn:focus-visible { outline: 2px solid var(--edu-teal-mid, #0d9488); outline-offset: 2px; }
    .gd-btn mat-icon { width: 16px; height: 16px; font-size: 16px; }
    .gd--prerequisite { background: #fffbeb; border-color: #fde68a; }
    .gd--prerequisite .gd-icon { color: #b45309; }
    .gd--load-error { background: #fef2f2; border-color: #fecaca; }
    .gd--load-error .gd-icon { color: #b91c1c; }
    .gd--no-permission .gd-icon, .gd--plan .gd-icon { color: #6d28d9; }
    .gd--unpublished .gd-icon { color: var(--edu-teal-dark, #0f766e); }
  `],
  template: `
    @if (guidance) {
      <div class="gd gd--{{ guidance.kind }}" [attr.role]="guidance.kind === 'load-error' ? 'alert' : 'status'"
           [attr.data-guidance]="guidance.kind">
        <mat-icon class="gd-icon" aria-hidden="true">{{ icon }}</mat-icon>
        <div class="gd-body">
          <p class="gd-title">{{ guidance.title }}</p>
          @if (guidance.message) { <p class="gd-msg">{{ guidance.message }}</p> }
          @if (fallback) { <p class="gd-msg gd-fallback">{{ fallback }}</p> }
          @if (actions.length || guidance.kind === 'load-error' || (guidance.kind === 'no-match' && canClear)) {
            <div class="gd-actions">
              @if (guidance.kind === 'load-error') {
                <button type="button" class="gd-btn" (click)="retry.emit()"><mat-icon aria-hidden="true">refresh</mat-icon>Retry</button>
              }
              @if (guidance.kind === 'no-match' && canClear) {
                <button type="button" class="gd-btn" (click)="clearFilters.emit()"><mat-icon aria-hidden="true">filter_alt_off</mat-icon>Clear filters</button>
              }
              @for (a of actions; track a.path) {
                <button type="button" class="gd-btn" (click)="open(a)">{{ a.label }}<mat-icon aria-hidden="true">chevron_right</mat-icon></button>
              }
            </div>
          }
        </div>
      </div>
    }
  `,
})
export class GuidanceComponent implements OnChanges, OnDestroy {
  @Input() guidance: Guidance | null = null;
  /** Show "Clear filters" on a no-match state (the page clears its own filters). */
  @Input() canClear = true;
  @Output() readonly retry = new EventEmitter<void>();
  @Output() readonly clearFilters = new EventEmitter<void>();

  actions: GuidanceAction[] = [];
  fallback: string | null = null;

  private readonly injector = inject(Injector);
  private readonly cdr = inject(ChangeDetectorRef);
  private sub?: Subscription;

  get icon(): string { return this.guidance ? ICONS[this.guidance.kind] : ''; }

  ngOnChanges(): void {
    this.sub?.unsubscribe();
    this.actions = [];
    const g = this.guidance;
    if (!g) { this.fallback = null; return; }
    const help = this.helpService();
    const audience = help?.audience() ?? null;
    this.fallback = this.fallbackText(g, audience);
    if (!help || !g.actions?.length) return;
    this.sub = help.allowedLinks(g.actions).subscribe(allowed => {
      this.actions = allowed;
      // An allowed action replaces the "ask someone" text: the viewer can fix it themselves.
      if (allowed.length) this.fallback = null;
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void { this.sub?.unsubscribe(); }

  open(action: GuidanceAction): void { this.helpService()?.go(action.path, action.queryParams); }

  private fallbackText(g: Guidance, audience: string | null): string | null {
    if (!g.fallback) return null;
    return (audience ? g.fallback[audience as keyof typeof g.fallback] : undefined) ?? g.fallback.default ?? null;
  }

  /** Resolved on use: a page state renders even where the help machinery is not available. */
  private helpService(): HelpService | null {
    try { return this.injector.get(HelpService); } catch { return null; }
  }
}
