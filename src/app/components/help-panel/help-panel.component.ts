import { ChangeDetectionStrategy, Component, Inject, ViewEncapsulation, inject } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { Observable } from 'rxjs';
import { HELP_TOPICS } from '../../help/help-content';
import { HelpPanelData, HelpService, ResolvedHelp } from '../../help/help.service';

/**
 * The help panel for one page: what it does, what to set up first, how to do the common tasks,
 * common problems, links the viewer may open, and Help & Support. A dialog, so Close, Escape and
 * Android's back button return to the page. Right-side panel on wide screens, full screen on
 * phones (see HelpService.open).
 * Shared by the web and Android clients — keep the two copies identical.
 */
@Component({
  selector: 'app-help-panel',
  standalone: true,
  imports: [AsyncPipe, MatDialogModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  styles: [`
    .edx-help-dialog { --mdc-dialog-container-shape: 0; --mat-dialog-container-shape: 0; max-height: 100dvh; }
    .edx-help-dialog--side { --mdc-dialog-container-shape: 16px 0 0 16px; --mat-dialog-container-shape: 16px 0 0 16px; }
    .edx-help-dialog--side .mat-mdc-dialog-surface { border-radius: 16px 0 0 16px; }
    .edx-help-dialog--phone .mat-mdc-dialog-surface { border-radius: 0; }

    .hp { display: flex; flex-direction: column; height: 100dvh; background: var(--edu-bg-light, #f8fafc); color: var(--edu-text, #1e293b); font-size: .9rem; }
    .hp-head { display: flex; align-items: center; gap: 10px; padding: 14px 14px 12px 18px; background: #fff; border-bottom: 1px solid var(--edu-border, #e2e8f0); }
    .hp-title { flex: 1; min-width: 0; }
    .hp-kicker { margin: 0; font-size: .7rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--edu-teal-dark, #0f766e); }
    .hp-title h2 { margin: 2px 0 0; font-size: 1.1rem; font-weight: 800; color: var(--edu-navy, #0f172a); }
    .hp-close { display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; flex: 0 0 40px; border: 1px solid #dce5ec; border-radius: 11px; background: #fff; color: var(--edu-blue, #1e3a5f); cursor: pointer; }
    .hp-close:hover { background: #eaf8f6; border-color: #9dd4cc; }
    .hp-close:focus-visible, .hp-link:focus-visible { outline: 2px solid var(--edu-teal-mid, #0d9488); outline-offset: 2px; }
    .hp-body { flex: 1; min-height: 0; overflow-y: auto; padding: 14px 18px 20px; }
    .hp-sec { margin: 0 0 16px; }
    .hp-sec h3 { margin: 0 0 6px; font-size: .74rem; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; color: var(--edu-text-sec, #64748b); }
    .hp-sec p { margin: 0 0 6px; line-height: 1.5; }
    .hp-list { margin: 0; padding-left: 18px; line-height: 1.5; }
    .hp-list li { margin-bottom: 4px; }
    .hp-card { background: #fff; border: 1px solid var(--edu-border, #e2e8f0); border-radius: 12px; padding: 10px 12px; margin-bottom: 8px; }
    .hp-card h4 { margin: 0 0 6px; font-size: .88rem; font-weight: 700; color: var(--edu-navy, #0f172a); }
    .hp-card ol { margin: 0; padding-left: 18px; line-height: 1.5; }
    .hp-problem { margin: 0 0 2px; font-weight: 700; }
    .hp-fix { margin: 0; color: var(--edu-text-sec, #64748b); line-height: 1.45; }
    .hp-note { display: flex; gap: 8px; align-items: flex-start; padding: 10px 12px; margin-bottom: 14px; border-radius: 12px; background: #fff7ed; border: 1px solid #fed7aa; color: #9a3412; line-height: 1.45; }
    .hp-note.info { background: #f0fdfa; border-color: #99f6e4; color: #115e59; }
    .hp-note mat-icon { flex: 0 0 20px; width: 20px; height: 20px; font-size: 20px; }
    .hp-links { display: flex; flex-direction: column; gap: 6px; }
    .hp-link { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; padding: 10px 12px; border: 1px solid var(--edu-border, #e2e8f0); border-radius: 11px; background: #fff; color: var(--edu-blue, #1e3a5f); font: inherit; font-weight: 600; text-align: left; cursor: pointer; }
    .hp-link:hover { background: #f0fdfa; border-color: #99f6e4; }
    .hp-link mat-icon { width: 18px; height: 18px; font-size: 18px; color: var(--edu-text-muted, #94a3b8); }
    .hp-foot { padding: 12px 18px calc(12px + env(safe-area-inset-bottom, 0px)); background: #fff; border-top: 1px solid var(--edu-border, #e2e8f0); }
    .hp-foot h3 { margin: 0 0 8px; font-size: .74rem; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; color: var(--edu-text-sec, #64748b); }
    .hp-foot .hp-links { flex-direction: row; flex-wrap: wrap; }
    .hp-foot .hp-link { width: auto; flex: 1 1 160px; }
    .hp-loading { padding: 24px 18px; color: var(--edu-text-sec, #64748b); }
    @media (max-width: 600px) {
      .hp-head { padding-top: calc(12px + env(safe-area-inset-top, 0px)); }
    }
  `],
  template: `
    <div class="hp">
      <div class="hp-head">
        <div class="hp-title">
          <p class="hp-kicker">Help</p>
          <h2 id="edx-help-title">{{ title }}</h2>
        </div>
        <button type="button" class="hp-close" mat-dialog-close aria-label="Close help" title="Close">
          <mat-icon aria-hidden="true">close</mat-icon>
        </button>
      </div>

      @if (help$ | async; as h) {
        <div class="hp-body">
          @if (h.unavailable) {
            <div class="hp-note" role="note"><mat-icon aria-hidden="true">info</mat-icon>
              <span>{{ h.title }} is not part of your school's current plan. Please ask your school admin.</span></div>
          }
          @if (h.about.length) {
            <section class="hp-sec" aria-labelledby="hp-about">
              <h3 id="hp-about">What this is</h3>
              @for (line of h.about; track line.text) { <p>{{ line.text }}</p> }
            </section>
          }
          @if (h.prerequisites.length) {
            <section class="hp-sec" aria-labelledby="hp-before">
              <h3 id="hp-before">Before you start</h3>
              <ul class="hp-list">@for (line of h.prerequisites; track line.text) { <li>{{ line.text }}</li> }</ul>
            </section>
          }
          @if (h.workflows.length) {
            <section class="hp-sec" aria-labelledby="hp-how">
              <h3 id="hp-how">How to</h3>
              @for (w of h.workflows; track w.title) {
                <div class="hp-card">
                  <h4>{{ w.title }}</h4>
                  <ol>@for (step of w.steps; track step) { <li>{{ step }}</li> }</ol>
                </div>
              }
            </section>
          }
          @if (h.problems.length) {
            <section class="hp-sec" aria-labelledby="hp-problems">
              <h3 id="hp-problems">If something isn't working</h3>
              @for (p of h.problems; track p.problem + p.solution) {
                <div class="hp-card">
                  <p class="hp-problem">{{ p.problem }}</p>
                  <p class="hp-fix">{{ p.solution }}</p>
                </div>
              }
            </section>
          }
          @if (h.parentNote) {
            <div class="hp-note info" role="note"><mat-icon aria-hidden="true">family_restroom</mat-icon>
              <span>Choose your child in the parent portal first. The pages you can open depend on what the school allows for that child.</span></div>
          }
          @if (h.links.length) {
            <section class="hp-sec" aria-labelledby="hp-links">
              <h3 id="hp-links">Related pages</h3>
              <div class="hp-links">
                @for (link of h.links; track link.path) {
                  <button type="button" class="hp-link" (click)="go(link.path)">{{ link.label }}<mat-icon aria-hidden="true">chevron_right</mat-icon></button>
                }
              </div>
            </section>
          }
        </div>
        @if (h.support.length) {
          <div class="hp-foot">
            <h3>Still need help?</h3>
            <div class="hp-links">
              @for (link of h.support; track link.path) {
                <button type="button" class="hp-link" (click)="go(link.path)">{{ link.label }}<mat-icon aria-hidden="true">chevron_right</mat-icon></button>
              }
            </div>
          </div>
        }
      } @else {
        <div class="hp-loading" aria-live="polite">Loading help…</div>
      }
    </div>
  `,
})
export class HelpPanelComponent {
  private readonly help = inject(HelpService);
  private readonly dialogRef = inject(MatDialogRef<HelpPanelComponent>);
  readonly help$: Observable<ResolvedHelp>;
  readonly title: string;

  constructor(@Inject(MAT_DIALOG_DATA) data: HelpPanelData) {
    this.help$ = this.help.resolve(data.topicId, data.currentPage ?? null);
    this.title = HELP_TOPICS[data.topicId]?.title ?? 'Help';
  }

  /** Closes the panel, then opens the page (the dialog never stays over the new page). */
  go(path: string): void {
    this.dialogRef.close();
    this.help.go(path);
  }
}
