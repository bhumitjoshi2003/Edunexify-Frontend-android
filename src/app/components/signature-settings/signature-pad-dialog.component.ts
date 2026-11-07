import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';

export interface SignaturePoint { x: number; y: number }
export type SignatureStroke = SignaturePoint[];

/** Vector strokes survive resize/orientation changes; only the final PNG leaves this dialog. */
@Component({
  standalone: true,
  selector: 'app-signature-pad-dialog',
  imports: [CommonModule, MatDialogModule],
  template: `
    <h2 mat-dialog-title>Draw your signature</h2>
    <mat-dialog-content>
      <p id="signing-help">Use one finger, a stylus or mouse. Rotate your phone for more space. Your strokes stay in place.</p>
      <canvas #pad aria-label="Signature drawing area" aria-describedby="signing-help"
        (pointerdown)="begin($event)" (pointermove)="move($event)"
        (pointerup)="end($event)" (pointercancel)="end($event)" (lostpointercapture)="end($event)"></canvas>
      <p *ngIf="error" role="alert">{{ error }}</p>
      <p class="notice">Saving your signature does not approve a report card.</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button type="button" (click)="undo()" [disabled]="!strokes.length">Undo stroke</button>
      <button type="button" (click)="clear()" [disabled]="!strokes.length">Clear</button>
      <button type="button" mat-dialog-close>Cancel</button>
      <button type="button" class="primary" (click)="use()" [disabled]="!strokes.length">Preview signature</button>
    </mat-dialog-actions>
  `,
  styles: [`
    :host{display:flex;flex-direction:column;min-height:0;color:#23344c}
    mat-dialog-content{max-height:none;overflow:auto}p{line-height:1.5;font-size:14px}
    canvas{display:block;box-sizing:border-box;width:100%;height:clamp(180px,40dvh,360px);background:#fff;border:2px dashed #879cb5;border-radius:8px;touch-action:none;cursor:crosshair}
    mat-dialog-actions{gap:8px;flex-wrap:wrap;padding:12px 20px}
    button{min-height:44px;border:1px solid #a4b5ca;border-radius:8px;padding:8px 12px;background:white;color:#244163;cursor:pointer}
    button:disabled{opacity:.45;cursor:default}.primary{background:#174a80;color:white}.notice{font-size:12px;color:#536780}
    @media(max-height:500px){canvas{height:42dvh}p{margin:4px 0}h2{padding:8px 24px}mat-dialog-actions{padding:6px 20px}}
  `]
})
export class SignaturePadDialogComponent implements AfterViewInit, OnDestroy {
  @ViewChild('pad') pad!: ElementRef<HTMLCanvasElement>;
  strokes: SignatureStroke[] = [];
  error = '';
  private activePointer: number | null = null;
  private observer?: ResizeObserver;
  constructor(private dialog: MatDialogRef<SignaturePadDialogComponent, string>) {}
  ngAfterViewInit(): void {
    this.observer = new ResizeObserver(() => this.render());
    this.observer.observe(this.pad.nativeElement);
    this.render();
  }
  ngOnDestroy(): void { this.observer?.disconnect(); this.activePointer = null; }
  private point(e: PointerEvent): SignaturePoint {
    const rect = this.pad.nativeElement.getBoundingClientRect();
    const scale = Math.min(rect.width / 1000, rect.height / 300);
    return { x: Math.max(0, Math.min(1, (e.clientX - rect.left - (rect.width - 1000 * scale) / 2) / (1000 * scale))),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top - (rect.height - 300 * scale) / 2) / (300 * scale))) };
  }
  begin(e: PointerEvent): void {
    if (this.activePointer !== null || e.button !== 0 || !e.isPrimary) return;
    this.activePointer = e.pointerId;
    this.pad.nativeElement.setPointerCapture(e.pointerId);
    this.strokes.push([this.point(e)]); this.error = ''; e.preventDefault(); this.render();
  }
  move(e: PointerEvent): void {
    if (e.pointerId !== this.activePointer) return;
    if (this.strokes.reduce((n, stroke) => n + stroke.length, 0) >= 20000) return;
    this.strokes[this.strokes.length - 1].push(this.point(e)); e.preventDefault(); this.render();
  }
  end(e: PointerEvent): void {
    if (e.pointerId !== this.activePointer) return;
    this.activePointer = null;
    if (this.pad.nativeElement.hasPointerCapture(e.pointerId)) this.pad.nativeElement.releasePointerCapture(e.pointerId);
  }
  undo(): void { this.activePointer = null; this.strokes.pop(); this.render(); }
  clear(): void { this.activePointer = null; this.strokes = []; this.error = ''; this.render(); }
  private draw(canvas: HTMLCanvasElement): void {
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const scale = Math.min(canvas.width / 1000, canvas.height / 300);
    ctx.save();ctx.translate((canvas.width - 1000 * scale) / 2, (canvas.height - 300 * scale) / 2);ctx.scale(scale, scale);
    ctx.strokeStyle = '#182a42';ctx.lineWidth = 4.5;ctx.lineCap = 'round';ctx.lineJoin = 'round';
    for (const stroke of this.strokes) {
      if (stroke.length < 2) continue;
      ctx.beginPath();ctx.moveTo(stroke[0].x * 1000, stroke[0].y * 300);
      for (const p of stroke.slice(1)) ctx.lineTo(p.x * 1000, p.y * 300);
      ctx.stroke();
    }
    ctx.restore();
  }
  private render(): void {
    const canvas = this.pad?.nativeElement;if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * ratio));canvas.height = Math.max(1, Math.round(rect.height * ratio));
    this.draw(canvas);
  }
  use(): void {
    const points = this.strokes.filter(s => s.length > 1).flat();
    const bounds = points.reduce((b, p) => ({minX: Math.min(b.minX, p.x), maxX: Math.max(b.maxX, p.x), minY: Math.min(b.minY, p.y), maxY: Math.max(b.maxY, p.y)}), {minX: 1, maxX: 0, minY: 1, maxY: 0});
    if (points.length < 3 || bounds.maxX - bounds.minX < .025 || bounds.maxY - bounds.minY < .01) {
      this.error = 'Draw a visible signature before continuing.';return;
    }
    const canvas = document.createElement('canvas');canvas.width = 1000;canvas.height = 300;this.draw(canvas);
    this.dialog.close(canvas.toDataURL('image/png').split(',')[1]);
  }
}
