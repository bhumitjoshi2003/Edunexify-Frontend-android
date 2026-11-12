import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Inject, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { Observable, Subject, takeUntil } from 'rxjs';
import { ReportCardPdfDeliveryService } from '../../services/report-card-pdf-delivery.service';
import { ToastService } from '../../services/toast.service';

/** Shared by the web and Android clients — keep the two copies identical. */
export interface ReportCardPreviewData {
  studentName: string;
  fileName: string;
  /** The live (unpublished) report-card PDF. */
  pdf: Observable<Blob>;
}

/**
 * Shows a report card inside Edunexify: its pages rendered as images (pdf.js on the web, the
 * native renderer on Android), with zoom and a separate Download. Nothing is downloaded or opened
 * elsewhere unless Download is pressed. A dialog, so Close, Escape and Android's back button all
 * return to the page.
 */
@Component({
  selector: 'app-report-card-preview-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host { display: block; }
    .pv { display: flex; flex-direction: column; height: min(88dvh, 1100px); background: #eef2f5; }
    .pv-head { display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: #fff; border-bottom: 1px solid #e2e8f0; }
    .pv-title { flex: 1; min-width: 0; }
    .pv-title h2 { margin: 0; font-size: 1rem; font-weight: 800; color: #142238; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .pv-title p { margin: 2px 0 0; font-size: .74rem; color: #64748b; }
    .pv-btn { display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; flex: 0 0 40px; border: 1px solid #dce5ec; border-radius: 11px; background: #fff; color: #1a5964; cursor: pointer; }
    .pv-btn:hover:not(:disabled) { background: #eaf8f6; border-color: #9dd4cc; }
    .pv-btn:disabled { opacity: .45; cursor: default; }
    .pv-btn:focus-visible { outline: 2px solid #0d9488; outline-offset: 2px; }
    .pv-btn mat-icon { width: 22px; height: 22px; font-size: 22px; }
    .pv-zoom { display: inline-flex; align-items: center; gap: 2px; }
    .pv-zoom .pv-btn { border: 0; background: transparent; width: 34px; flex-basis: 34px; }
    .pv-zoom span { min-width: 40px; text-align: center; font-size: .73rem; color: #526477; }
    .pv-body { flex: 1; min-height: 0; overflow: auto; }
    .pv-pages { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 14px; }
    .pv-pages img { display: block; max-width: none; height: auto; background: #fff; box-shadow: 0 3px 16px rgba(24, 35, 53, .15); }
    .pv-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; height: 100%; min-height: 220px; padding: 24px; color: #64748b; font-size: .86rem; text-align: center; }
    .pv-state.is-error { color: #9f3b36; }
    .pv-spin { width: 28px; height: 28px; border: 3px solid #cbd5e1; border-top-color: #0f766e; border-radius: 50%; animation: pv-spin .8s linear infinite; }
    @keyframes pv-spin { to { transform: rotate(360deg); } }
    .pv-link { border: 1px solid #cbd5e1; border-radius: 11px; background: #fff; padding: 8px 14px; font: inherit; font-weight: 700; color: #0f766e; cursor: pointer; }
    @media (max-width: 600px) {
      .pv { height: 100dvh; }
      .pv-head { padding-top: calc(10px + env(safe-area-inset-top, 0px)); }
      .pv-zoom { display: none; }
      .pv-pages { padding: 8px; }
    }
    @media (prefers-reduced-motion: reduce) { .pv-spin { animation: none; } }
  `],
  template: `
    <div class="pv" role="region" aria-label="Report card preview">
      <div class="pv-head">
        <button type="button" class="pv-btn" mat-dialog-close aria-label="Back to report card review" title="Back">
          <mat-icon aria-hidden="true">arrow_back</mat-icon>
        </button>
        <div class="pv-title">
          <h2>{{ data.studentName }}</h2>
          <p>Live preview · not a published report card</p>
        </div>
        <div class="pv-zoom" *ngIf="state === 'ready'">
          <button type="button" class="pv-btn" (click)="changeZoom(-0.25)" [disabled]="zoom <= 0.75" aria-label="Zoom out" title="Zoom out"><mat-icon aria-hidden="true">remove</mat-icon></button>
          <span>{{ zoom * 100 | number:'1.0-0' }}%</span>
          <button type="button" class="pv-btn" (click)="changeZoom(0.25)" [disabled]="zoom >= 2.5" aria-label="Zoom in" title="Zoom in"><mat-icon aria-hidden="true">add</mat-icon></button>
        </div>
        <button type="button" class="pv-btn" (click)="download()" [disabled]="!blob || saving" aria-label="Download report card PDF" title="Download PDF">
          <mat-icon aria-hidden="true">download</mat-icon>
        </button>
      </div>
      <div class="pv-body">
        <div class="pv-state" *ngIf="state === 'loading'" aria-live="polite"><span class="pv-spin" aria-hidden="true"></span>Preparing the preview…</div>
        <div class="pv-state is-error" *ngIf="state === 'error'" role="alert">
          {{ error }}
          <button type="button" class="pv-link" *ngIf="blob" (click)="download()">Download PDF instead</button>
        </div>
        <div class="pv-pages" *ngIf="state === 'ready'">
          <img *ngFor="let page of pages; let i = index" [src]="page" [alt]="'Report card page ' + (i + 1)" [style.width.%]="zoom * 100">
        </div>
      </div>
    </div>
  `,
})
export class ReportCardPreviewDialogComponent implements OnInit, OnDestroy {
  state: 'loading' | 'ready' | 'error' = 'loading';
  pages: string[] = [];
  zoom = 1;
  blob: Blob | null = null;
  saving = false;
  error = 'This report card could not be displayed.';
  private destroy$ = new Subject<void>();

  constructor(
    @Inject(MAT_DIALOG_DATA) readonly data: ReportCardPreviewData,
    private dialogRef: MatDialogRef<ReportCardPreviewDialogComponent>,
    private delivery: ReportCardPdfDeliveryService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.data.pdf.pipe(takeUntil(this.destroy$)).subscribe({
      next: async blob => {
        this.blob = blob;
        try {
          const pages = await this.delivery.previewPages(blob, this.data.fileName);
          if (this.destroyed) return;
          this.pages = pages;
          this.state = 'ready';
        } catch {
          if (this.destroyed) return;
          this.state = 'error';
        }
        this.cdr.markForCheck();
      },
      error: err => {
        this.error = err?.error?.message || 'This report card could not be prepared.';
        this.state = 'error';
        this.cdr.markForCheck();
      },
    });
  }

  private get destroyed(): boolean { return this.destroy$.isStopped; }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  changeZoom(step: number): void {
    this.zoom = Math.min(2.5, Math.max(0.75, this.zoom + step));
  }

  async download(): Promise<void> {
    if (!this.blob || this.saving) return;
    this.saving = true;
    try {
      await this.delivery.saveToDevice(this.blob, this.data.fileName);
      if (this.delivery.native) this.toast.success('Report card downloaded', 'Saved to Downloads/Edunexify.');
    } catch {
      this.toast.error('Download failed', 'Please try again.');
    } finally {
      this.saving = false;
      this.cdr.markForCheck();
    }
  }

  close(): void { this.dialogRef.close(); }
}
