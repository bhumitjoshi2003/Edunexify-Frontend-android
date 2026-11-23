import { ChangeDetectionStrategy, Component, Inject, ViewEncapsulation, inject } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { Observable, catchError, from, of } from 'rxjs';
import { HELP_TOPICS } from '../../help/help-content';
import { HelpPanelData, HelpService, ResolvedHelp } from '../../help/help.service';
import { GettingStartedService } from '../../onboarding/getting-started.service';

/**
 * The help panel for one page: what it does, what to set up first, how to do the common tasks,
 * common problems, links the viewer may open, and Help & Support. A dialog, so Close, Escape and
 * Android's back button return to the page. Right-side panel on wide screens, full screen on
 * phones (see HelpService.open). When the viewer hid their getting-started guide, it offers to show
 * it again (progress kept).
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

    /* Shell: Edunexify tokens (styles.css) with fallbacks; same palette, radii and type scale as the app. */
    .hp { display: flex; flex-direction: column; height: 100dvh; background: var(--edu-bg-light, #f8fafc);
      color: var(--edu-text, #1e293b); font-size: var(--edu-text-base, .88rem); line-height: 1.55; }
    .hp-head { display: flex; align-items: center; gap: 12px; padding: 14px 14px 14px 18px; background: #fff;
      border-bottom: 1px solid var(--edu-border, #e2e8f0); }
    .hp-mark { display: grid; place-items: center; width: 36px; height: 36px; flex: 0 0 36px; border-radius: 10px;
      color: var(--edu-teal-dark, #0f766e); background: #e9f6f4; }
    .hp-mark mat-icon { width: 20px; height: 20px; font-size: 20px; }
    .hp-title { flex: 1; min-width: 0; }
    .hp-kicker { margin: 0; font-size: .68rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--edu-teal-dark, #0f766e); }
    .hp-title h2 { margin: 1px 0 0; font-size: 1.05rem; font-weight: 800; line-height: 1.3; color: var(--edu-navy, #0f172a); }
    .hp-close { display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; flex: 0 0 40px;
      border: 1px solid var(--edu-border, #e2e8f0); border-radius: 11px; background: #fff; color: var(--edu-blue, #1e3a5f); cursor: pointer; }
    .hp-close:hover { background: #eaf8f6; border-color: #9dd4cc; }
    .hp-close:focus-visible, .hp-link:focus-visible { outline: 2px solid var(--edu-teal-mid, #0d9488); outline-offset: 2px; }

    .hp-body { flex: 1; min-height: 0; overflow-y: auto; padding: 16px 16px 24px; display: flex; flex-direction: column; gap: 12px; }
    .hp-body > * { max-width: 68ch; }
    .hp-sec { margin: 0; padding: 14px 16px; background: #fff; border: 1px solid var(--edu-border, #e2e8f0);
      border-radius: var(--edu-radius-md, 12px); }
    .hp-sec-head { display: flex; align-items: center; gap: 8px; margin: 0 0 8px; }
    .hp-sec-head mat-icon { width: 18px; height: 18px; font-size: 18px; flex: 0 0 18px; color: var(--edu-teal-dark, #0f766e); }
    .hp-sec h3 { margin: 0; font-size: .9rem; font-weight: 700; color: var(--edu-navy, #0f172a); }
    .hp-sec p { margin: 0 0 6px; }
    .hp-sec p:last-child { margin-bottom: 0; }

    /* "What this is": the page's introduction. */
    .hp-intro { background: transparent; border: 0; padding: 2px 2px 0; }
    .hp-intro p:first-of-type { font-size: .95rem; color: var(--edu-text, #1e293b); }
    .hp-intro p + p { color: var(--edu-text-sec, #64748b); }

    /* "Before you start": a checklist. */
    .hp-checks { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
    .hp-checks li { position: relative; padding-left: 24px; }
    .hp-checks li::before { content: ''; position: absolute; left: 3px; top: .5em; width: 9px; height: 5px;
      border-left: 2px solid var(--edu-teal-mid, #0d9488); border-bottom: 2px solid var(--edu-teal-mid, #0d9488); transform: rotate(-45deg); }

    /* "How to": each task is a card with numbered steps. */
    .hp-card { padding: 12px 0 0; margin-top: 12px; border-top: 1px solid var(--edu-border, #e2e8f0); }
    .hp-sec-head + .hp-card { margin-top: 0; padding-top: 0; border-top: 0; }
    .hp-card h4 { margin: 0 0 8px; font-size: .86rem; font-weight: 700; color: var(--edu-blue, #1e3a5f); }
    .hp-card ol { list-style: none; counter-reset: hp-step; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
    .hp-card ol li { counter-increment: hp-step; position: relative; padding-left: 30px; min-height: 22px; }
    .hp-card ol li::before { content: counter(hp-step); position: absolute; left: 0; top: 0; display: grid; place-items: center;
      width: 22px; height: 22px; border-radius: 50%; font-size: .72rem; font-weight: 700; color: var(--edu-teal-dark, #0f766e); background: #e9f6f4; }

    /* "If something isn't working": the message people see, then what to do. */
    .hp-problem-item { padding: 10px 12px; margin-top: 8px; border-radius: 10px; background: #fffaf2; border: 1px solid #fde7c2; border-left: 3px solid #f59e0b; }
    .hp-sec-head + .hp-problem-item { margin-top: 0; }
    .hp-problem { margin: 0 0 4px; font-weight: 700; color: #7c4a03; }
    .hp-fix { margin: 0; color: var(--edu-text, #1e293b); }

    /* Notes: plan (warning) and permission/child (information). */
    .hp-note { display: flex; gap: 10px; align-items: flex-start; padding: 11px 13px; border-radius: var(--edu-radius-md, 12px);
      background: #fff7ed; border: 1px solid #fed7aa; color: #9a3412; }
    .hp-note.info { background: #f0fdfa; border-color: #99f6e4; color: #115e59; }
    .hp-note mat-icon { flex: 0 0 20px; width: 20px; height: 20px; font-size: 20px; }

    .hp-links { display: flex; flex-direction: column; gap: 6px; }
    .hp-link { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; min-height: 44px; padding: 10px 12px;
      border: 1px solid var(--edu-border, #e2e8f0); border-radius: 11px; background: #fff; color: var(--edu-blue, #1e3a5f);
      font: inherit; font-weight: 600; text-align: left; cursor: pointer; transition: background-color .15s ease, border-color .15s ease; }
    .hp-link:hover { background: #f0fdfa; border-color: #99f6e4; }
    .hp-link mat-icon { width: 18px; height: 18px; font-size: 18px; flex: 0 0 18px; color: var(--edu-text-muted, #94a3b8); }
    .hp-sec .hp-link { background: var(--edu-bg-light, #f8fafc); }

    .hp-foot { padding: 12px 16px calc(12px + env(safe-area-inset-bottom, 0px)); background: #fff; border-top: 1px solid var(--edu-border, #e2e8f0); }
    .hp-foot h3 { margin: 0 0 8px; font-size: .72rem; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--edu-text-sec, #64748b); }
    .hp-foot .hp-links { flex-direction: row; flex-wrap: wrap; }
    .hp-foot .hp-link { width: auto; flex: 1 1 160px; }
    .hp-vh { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
    .hp-loading { padding: 24px 18px; color: var(--edu-text-sec, #64748b); }
    @media (max-width: 600px) {
      .hp-head { padding-top: calc(12px + env(safe-area-inset-top, 0px)); }
      .hp-body { padding: 14px 12px 20px; }
      .hp-sec { padding: 13px 14px; }
    }
    @media (prefers-reduced-motion: reduce) { .hp-link { transition: none; } }
  `],
  template: `
    <div class="hp">
      <div class="hp-head">
        <span class="hp-mark" aria-hidden="true"><mat-icon>help_outline</mat-icon></span>
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
            <section class="hp-sec hp-intro" aria-labelledby="hp-about">
              <h3 id="hp-about" class="hp-vh">What this is</h3>
              @for (line of h.about; track line.text) { <p>{{ line.text }}</p> }
            </section>
          }
          @if (h.principalNote) {
            <div class="hp-note info" role="note"><mat-icon aria-hidden="true">verified_user</mat-icon>
              <span>Some of these steps need a permission your school gives the Principal. Only pages you can open are linked below.</span></div>
          }
          @if (h.parentNote) {
            <div class="hp-note info" role="note"><mat-icon aria-hidden="true">family_restroom</mat-icon>
              <span>Choose your child in the parent portal first. The pages you can open depend on what the school allows for that child.</span></div>
          }
          @if (h.prerequisites.length) {
            <section class="hp-sec" aria-labelledby="hp-before">
              <div class="hp-sec-head"><mat-icon aria-hidden="true">checklist</mat-icon><h3 id="hp-before">Before you start</h3></div>
              <ul class="hp-list hp-checks">@for (line of h.prerequisites; track line.text) { <li>{{ line.text }}</li> }</ul>
            </section>
          }
          @if (h.workflows.length) {
            <section class="hp-sec" aria-labelledby="hp-how">
              <div class="hp-sec-head"><mat-icon aria-hidden="true">menu_book</mat-icon><h3 id="hp-how">How to</h3></div>
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
              <div class="hp-sec-head"><mat-icon aria-hidden="true">build_circle</mat-icon><h3 id="hp-problems">If something isn't working</h3></div>
              @for (p of h.problems; track p.problem + p.solution) {
                <div class="hp-problem-item">
                  <p class="hp-problem">{{ p.problem }}</p>
                  <p class="hp-fix">{{ p.solution }}</p>
                </div>
              }
            </section>
          }
          @if (h.links.length) {
            <section class="hp-sec" aria-labelledby="hp-links">
              <div class="hp-sec-head"><mat-icon aria-hidden="true">link</mat-icon><h3 id="hp-links">Related pages</h3></div>
              <div class="hp-links">
                @for (link of h.links; track link.path) {
                  <button type="button" class="hp-link" (click)="go(link.path)">{{ link.label }}<mat-icon aria-hidden="true">chevron_right</mat-icon></button>
                }
              </div>
            </section>
          }
          @if (guideHidden$ | async) {
            <section class="hp-sec" aria-labelledby="hp-guide">
              <div class="hp-sec-head"><mat-icon aria-hidden="true">route</mat-icon><h3 id="hp-guide">Getting started</h3></div>
              <div class="hp-links">
                <button type="button" class="hp-link" (click)="showGuide()">Show getting-started guide<mat-icon aria-hidden="true">chevron_right</mat-icon></button>
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
  private readonly guides = inject(GettingStartedService);
  private readonly router = inject(Router);
  readonly help$: Observable<ResolvedHelp>;
  /** The viewer hid their getting-started guide (it can be shown again). */
  readonly guideHidden$: Observable<boolean> = from(this.guides.isHidden()).pipe(catchError(() => of(false)));
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

  /** Shows the hidden getting-started guide again on its home page (progress kept). */
  async showGuide(): Promise<void> {
    const home = await this.guides.restore();
    this.dialogRef.close();
    if (home) await this.router.navigateByUrl(home);
  }
}
