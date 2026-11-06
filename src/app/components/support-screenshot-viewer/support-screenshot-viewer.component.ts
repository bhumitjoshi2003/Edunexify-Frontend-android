import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, HostListener, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/** Full-screen, keyboard-accessible screenshot viewer shared by reporters and administrators. */
@Component({
  selector: 'app-support-screenshot-viewer',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ssv-backdrop" role="dialog" aria-modal="true" aria-label="Screenshot viewer"
      (click)="closed.emit()" (wheel)="onWheel($event)">
      <div class="ssv-toolbar" (click)="$event.stopPropagation()">
        <span class="ssv-counter">Screenshot {{ index + 1 }} of {{ urls.length }}</span>
        <div class="ssv-actions">
          <button type="button" (click)="zoomOut()" [disabled]="zoom <= 1" aria-label="Zoom out" title="Zoom out"><mat-icon>remove</mat-icon></button>
          <span class="ssv-zoom">{{ zoom * 100 | number:'1.0-0' }}%</span>
          <button type="button" (click)="zoomIn()" [disabled]="zoom >= 4" aria-label="Zoom in" title="Zoom in"><mat-icon>add</mat-icon></button>
          <button type="button" (click)="resetZoom()" aria-label="Fit screenshot to screen" title="Fit to screen"><mat-icon>fit_screen</mat-icon></button>
          <button type="button" (click)="closed.emit()" aria-label="Close screenshot viewer" title="Close"><mat-icon>close</mat-icon></button>
        </div>
      </div>
      <div class="ssv-stage" (click)="$event.stopPropagation()">
        <button *ngIf="urls.length > 1" type="button" class="ssv-arrow" (click)="previous()" aria-label="Previous screenshot"><mat-icon>chevron_left</mat-icon></button>
        <div class="ssv-scroll" aria-label="Enlarged screenshot; scroll to inspect when zoomed">
          <img [src]="urls[index]" [alt]="'Screenshot ' + (index + 1) + ' of ' + urls.length"
            [style.width]="zoom > 1 ? (zoom * 100) + '%' : 'auto'"
            [style.max-height]="zoom > 1 ? 'none' : '76vh'" />
        </div>
        <button *ngIf="urls.length > 1" type="button" class="ssv-arrow" (click)="next()" aria-label="Next screenshot"><mat-icon>chevron_right</mat-icon></button>
      </div>
      <p class="ssv-hint">Use + / − to zoom. Swipe or scroll to inspect enlarged images.</p>
    </div>
  `,
  styles: [`
    :host { position: fixed; inset: 0; z-index: 4000; }
    .ssv-backdrop { position: fixed; inset: 0; display: flex; flex-direction: column; color: #fff; background: rgba(8, 15, 31, .96); }
    .ssv-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 18px; flex-wrap: wrap; }
    .ssv-counter { font-weight: 700; font-size: .9rem; }
    .ssv-actions { display: flex; align-items: center; gap: 5px; }
    .ssv-actions button, .ssv-arrow { background: rgba(255,255,255,.13); color: #fff; border: 1px solid rgba(255,255,255,.18); cursor: pointer; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; }
    .ssv-actions button:disabled { opacity: .35; cursor: not-allowed; }
    button:focus-visible { outline: 3px solid #93c5fd; outline-offset: 2px; }
    .ssv-zoom { min-width: 48px; text-align: center; font-size: .82rem; }
    .ssv-stage { flex: 1; display: flex; align-items: center; min-height: 0; gap: 8px; padding: 8px; }
    .ssv-scroll { flex: 1; min-width: 0; min-height: 0; height: 100%; overflow: auto; display: block; text-align: center; overscroll-behavior: contain; }
    .ssv-scroll img { display: block; width: auto; max-width: 100%; height: auto; margin: auto; object-fit: contain; }
    .ssv-arrow { flex: 0 0 40px; }
    .ssv-hint { text-align: center; color: #cbd5e1; font-size: .75rem; padding: 0 12px 12px; margin: 0; }
    @media(max-width: 600px) { .ssv-toolbar { padding: 8px; } .ssv-actions { gap: 2px; } .ssv-actions button { width: 36px; height: 36px; } .ssv-stage { padding: 2px; gap: 2px; } .ssv-arrow { flex-basis: 30px; width: 30px; } .ssv-hint { font-size: .68rem; } }
  `],
})
export class SupportScreenshotViewerComponent implements OnInit, OnDestroy {
  @Input({ required: true }) urls: string[] = [];
  @Input() index = 0;
  @Output() closed = new EventEmitter<void>();
  zoom = 1;
  private priorBodyOverflow = '';

  ngOnInit(): void {
    this.priorBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }

  ngOnDestroy(): void { document.body.style.overflow = this.priorBodyOverflow; }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') { event.preventDefault(); this.closed.emit(); }
    if (event.key === 'ArrowLeft' && this.urls.length > 1) { event.preventDefault(); this.previous(); }
    if (event.key === 'ArrowRight' && this.urls.length > 1) { event.preventDefault(); this.next(); }
  }

  onWheel(event: WheelEvent): void {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    if (event.deltaY < 0) this.zoomIn(); else this.zoomOut();
  }

  zoomIn(): void { this.zoom = Math.min(4, Math.round((this.zoom + .25) * 100) / 100); }
  zoomOut(): void { this.zoom = Math.max(1, Math.round((this.zoom - .25) * 100) / 100); }
  resetZoom(): void { this.zoom = 1; }
  previous(): void { this.index = (this.index + this.urls.length - 1) % this.urls.length; this.resetZoom(); }
  next(): void { this.index = (this.index + 1) % this.urls.length; this.resetZoom(); }
}
