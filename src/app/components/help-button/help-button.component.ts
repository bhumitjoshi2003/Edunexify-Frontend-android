import { ChangeDetectionStrategy, Component, Injector, Input, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { HELP_TOPICS, HelpTopicId } from '../../help/help-content';
import { HelpService } from '../../help/help.service';

/**
 * The compact "?" button in a page header that opens that page's help. It sits inline in the
 * header title and takes its colour from the title, so it fits light and dark headers alike and
 * does not make the header taller. Nothing opens by itself.
 * Shared by the web and Android clients — keep the two copies identical.
 */
@Component({
  selector: 'app-help-button',
  standalone: true,
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host { display: inline-flex; vertical-align: middle; margin: -6px 0 -6px 8px; }
    .hb { position: relative; display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; padding: 0;
      border-radius: 50%; border: 1px solid rgba(127, 127, 127, .4); background: rgba(127, 127, 127, .14); /* WebViews without color-mix() */
      border: 1px solid color-mix(in srgb, currentColor 38%, transparent);
      background: color-mix(in srgb, currentColor 12%, transparent); color: inherit; cursor: pointer;
      opacity: .9; transition: background-color .15s ease, opacity .15s ease; }
    .hb:hover { opacity: 1; background: color-mix(in srgb, currentColor 22%, transparent); }
    .hb:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; opacity: 1; }
    /* A light glyph inside the 28px circle, in proportion with the title text. The ::before keeps a
       40px touch area (Android) without changing the header's layout. */
    .hb::before { content: ''; position: absolute; inset: -6px; border-radius: 50%; }
    .hb:active { background: color-mix(in srgb, currentColor 30%, transparent); }
    .hb mat-icon { width: 15px; height: 15px; font-size: 15px; line-height: 15px; }
    @media (prefers-reduced-motion: reduce) { .hb { transition: none; } }
    @media print { :host { display: none; } }
  `],
  template: `
    <button type="button" class="hb" (click)="open()" [attr.aria-label]="label" [title]="label" aria-haspopup="dialog">
      <mat-icon aria-hidden="true">question_mark</mat-icon>
    </button>
  `,
})
export class HelpButtonComponent {
  @Input({ required: true }) topic!: HelpTopicId;
  // Resolved on click, not on creation: a page header never depends on the help machinery
  // (HTTP, dialog, router) just to render.
  private readonly injector = inject(Injector);

  get label(): string { return `Help: ${HELP_TOPICS[this.topic]?.title ?? 'this page'}`; }

  open(): void { this.injector.get(HelpService).open(this.topic); }
}
