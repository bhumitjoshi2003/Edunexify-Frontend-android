import { ChangeDetectorRef, Component, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

/** Private handwritten signature; publication approvals are a separate step. */
@Component({
  standalone: true,
  selector: 'app-signature-settings',
  imports: [CommonModule],
  template: `
    <main class="page">
      <header><div class="badge-icon" aria-hidden="true">✍️</div><div>
        <p class="eyebrow">REPORT CARD SIGNING</p><h1>My Signature</h1>
        <p>Draw your signature once. You can update it later; issued documents never change.</p>
      </div></header>
      <section class="panel">
        <h2>Handwritten signature</h2>
        <p class="hint">Use your finger, stylus, or mouse. On a phone, rotate to landscape for a wider signing area.</p>
        <div *ngIf="loading" role="status">Loading your saved signature…</div>
        <div class="error" *ngIf="error" role="alert">{{ error }}</div>
        <div class="success" *ngIf="success" role="status">{{ success }}</div>
        <div *ngIf="savedImage" class="saved"><p>Currently saved:</p>
          <img [src]="'data:image/png;base64,' + savedImage" alt="Your saved handwritten signature"/>
        </div>
        <div class="canvas-wrap" [class.expanded]="expanded">
          <div class="canvas-top"><span>Sign within the white box</span>
            <button type="button" (click)="toggleExpanded()" [attr.aria-label]="expanded ? 'Exit wide signing mode' : 'Open wide signing mode'">
              {{ expanded ? 'Exit wide mode' : 'Wide mode' }}</button>
          </div>
          <canvas #pad width="1000" height="300" aria-label="Signature drawing area"
            (pointerdown)="begin($event)" (pointermove)="move($event)"
            (pointerup)="end()" (pointercancel)="end()" (lostpointercapture)="end()"></canvas>
          <div class="actions">
            <button type="button" (click)="clear()">Clear</button>
            <button type="button" class="primary" [disabled]="!hasInk || saving" (click)="save()">{{ saving ? 'Saving…' : 'Save signature' }}</button>
          </div>
        </div>
        <p class="notice">Saving a signature does not automatically approve or sign any report card.
          Approval must be explicitly confirmed for each publication.</p>
      </section>
    </main>
  `,
  styles: [`
    .page{padding:20px;max-width:1050px;margin:auto;color:#23344c}
    header{background:#17375e;color:white;border-radius:17px;padding:26px;display:flex;gap:16px;align-items:center}
    header h1{font-size:26px;margin:4px 0 5px}header p{margin:0;color:#d9e5f5}
    .eyebrow{font-size:11px;letter-spacing:.14em}.badge-icon{font-size:28px;background:#ffffff25;padding:13px;border-radius:12px}
    .panel{margin-top:20px;background:white;border-radius:16px;border:1px solid #dce5ef;padding:24px}
    h2{margin:0;font-size:20px}.hint,.notice{color:#5c6f87;line-height:1.5}.notice{font-size:13px;margin-top:18px}
    .saved img{max-width:320px;width:100%;max-height:100px;object-fit:contain;border:1px solid #e1e7ef;border-radius:9px}
    .saved p{font-size:13px;color:#61738a}.canvas-wrap{margin-top:16px;border:1px solid #bac9db;border-radius:13px;padding:12px;background:#f6f9fd}
    .canvas-top{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:8px;color:#526783;font-size:13px}
    canvas{display:block;width:100%;height:auto;aspect-ratio:10/3;touch-action:none;background:white;border:1px dashed #9db0c6;border-radius:9px;cursor:crosshair}
    button{border:1px solid #b8c9df;border-radius:8px;padding:9px 15px;background:white;color:#244163;font-weight:600;cursor:pointer}
    button:disabled{opacity:.5;cursor:not-allowed}.actions{display:flex;justify-content:flex-end;gap:10px;margin-top:12px}
    button.primary{background:#174a80;color:#fff;border-color:#174a80}
    .error{color:#b42318;margin:12px 0}.success{color:#087443;margin:12px 0}
    .expanded{position:fixed;z-index:10000;inset:0;background:#edf4fc;border-radius:0;display:flex;flex-direction:column;padding:12px}
    .expanded canvas{flex:1;height:calc(100% - 100px);width:100%;object-fit:fill;aspect-ratio:auto}
    .expanded .actions{flex-shrink:0}
    @media(max-width:600px){.page{padding:12px}.panel{padding:15px}header{padding:18px}header h1{font-size:22px}}
    @media(max-width:700px) and (orientation:portrait){.expanded{width:100dvh;height:100dvw;inset:auto;top:0;left:100dvw;transform-origin:top left;transform:rotate(90deg)}}
  `]
})
export class SignatureSettingsComponent {
  @ViewChild('pad') pad!: ElementRef<HTMLCanvasElement>;
  loading = true;
  saving = false;
  savedImage: string | null = null;
  error = '';
  success = '';
  hasInk = false;
  expanded = false;
  private drawing = false;
  private last: { x: number; y: number } | null = null;

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {
    this.http.get<{ saved: boolean; imageBase64: string | null }>(`${environment.apiUrl}/signatures/me`).subscribe({
      next: response => { this.savedImage = response.imageBase64; this.loading = false; this.cdr.markForCheck(); },
      error: () => { this.loading = false; this.error = 'Could not load your signature. Please retry later.'; this.cdr.markForCheck(); }
    });
  }

  private context(): CanvasRenderingContext2D | null { return this.pad?.nativeElement.getContext('2d') ?? null; }
  private point(e: PointerEvent): { x: number; y: number } {
    const canvas = this.pad.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const rotated = this.expanded && window.matchMedia('(max-width:700px) and (orientation:portrait)').matches;
    if (rotated) {
      return { x: (e.clientY - rect.top) * canvas.width / rect.height,
               y: (rect.right - e.clientX) * canvas.height / rect.width };
    }
    return { x: (e.clientX - rect.left) * canvas.width / rect.width,
             y: (e.clientY - rect.top) * canvas.height / rect.height };
  }
  begin(e: PointerEvent): void {
    if (e.button !== 0) return;
    const canvas = this.pad.nativeElement;
    canvas.setPointerCapture(e.pointerId);
    this.drawing = true;
    this.last = this.point(e);
    e.preventDefault();
  }
  move(e: PointerEvent): void {
    if (!this.drawing || !this.last) return;
    const ctx = this.context();
    if (!ctx) return;
    const next = this.point(e);
    ctx.strokeStyle = '#182a42';
    ctx.lineWidth = 4.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(this.last.x, this.last.y);
    ctx.lineTo(next.x, next.y);
    ctx.stroke();
    this.last = next;
    this.hasInk = true;
    e.preventDefault();
  }
  end(): void { this.drawing = false; this.last = null; }
  clear(): void {
    const canvas = this.pad.nativeElement;
    this.context()?.clearRect(0, 0, canvas.width, canvas.height);
    this.hasInk = false;
    this.success = '';
  }
  toggleExpanded(): void { this.expanded = !this.expanded; this.end(); }
  save(): void {
    if (!this.hasInk || this.saving) return;
    this.error = ''; this.success = ''; this.saving = true;
    const imageBase64 = this.pad.nativeElement.toDataURL('image/png').split(',')[1];
    this.http.put<{ imageBase64: string }>(`${environment.apiUrl}/signatures/me`, { imageBase64 }).subscribe({
      next: response => {
        this.savedImage = response.imageBase64; this.saving = false;
        this.success = 'Signature saved securely. Existing issued cards remain unchanged.';
        this.expanded = false; this.cdr.markForCheck();
      },
      error: response => {
        this.saving = false;
        this.error = response?.error?.message || 'Could not save your signature. Please try again.';
        this.cdr.markForCheck();
      }
    });
  }
}
