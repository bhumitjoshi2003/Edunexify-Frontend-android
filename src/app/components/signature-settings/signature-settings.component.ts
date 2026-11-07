import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { MatDialog } from '@angular/material/dialog';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { SignaturePadDialogComponent } from './signature-pad-dialog.component';

interface SignatureProfile { saved: boolean; imageBase64: string | null; updatedAt: string | null }

@Component({
  standalone: true,
  selector: 'app-signature-settings',
  imports: [CommonModule],
  template: `
    <main class="page">
      <header><p>REPORT CARD SIGNING</p><h1>My signature</h1><p>Your private handwritten signature for explicit report-card approvals.</p></header>
      <section class="panel" aria-labelledby="signature-heading">
        <h2 id="signature-heading">Saved signature</h2>
        <p *ngIf="loading" role="status">Loading your signature…</p>
        <p *ngIf="error" role="alert" class="error">{{ error }}</p>
        <button type="button" *ngIf="loadFailed" (click)="load()" [disabled]="loading">Retry loading</button>
        <p *ngIf="success" role="status" class="success">{{ success }}</p>
        <ng-container *ngIf="!loading && !loadFailed">
          <img *ngIf="profile?.imageBase64; else noSignature" [src]="'data:image/png;base64,' + profile!.imageBase64" alt="Your saved handwritten signature"/>
          <ng-template #noSignature><p>No signature has been saved yet.</p></ng-template>
          <p *ngIf="profile?.updatedAt">Last updated {{ profile!.updatedAt | date:'medium' }}</p>
          <button type="button" (click)="draw()" [disabled]="saving || editorOpen">{{ profile?.saved ? 'Draw replacement signature' : 'Draw signature' }}</button>
        </ng-container>
        <section *ngIf="draft" class="preview" aria-label="New signature preview">
          <h3>Preview your new signature</h3><img [src]="'data:image/png;base64,' + draft" alt="New signature awaiting save"/>
          <p>Saving replaces your current signature for future approvals. Earlier signature versions and issued documents remain unchanged.</p>
          <div class="actions">
            <button type="button" (click)="discard()" [disabled]="saving">Discard draft</button>
            <button type="button" class="primary" (click)="save()" [disabled]="saving">{{ saving ? 'Saving…' : 'Save signature' }}</button>
          </div>
        </section>
        <p class="notice">Saving a signature does not approve or sign a report card. Each approval requires its own confirmation.</p>
      </section>
    </main>
  `,
  styles: [`
    .page{padding:20px;max-width:1050px;margin:auto;color:#23344c}
    header{background:#17375e;color:white;border-radius:16px;padding:24px}header h1{margin:8px 0;font-size:26px}header p{margin:0;line-height:1.5}
    .panel{margin-top:20px;background:white;border:1px solid #dce5ef;border-radius:16px;padding:24px}
    h2{font-size:20px}p{line-height:1.5}img{display:block;width:min(100%,440px);height:140px;object-fit:contain;border:1px solid #cbd7e5;border-radius:8px;background:#fff}
    button{min-height:44px;border:1px solid #a4b5ca;border-radius:8px;padding:10px 15px;background:white;color:#244163;cursor:pointer}
    button:disabled{opacity:.5;cursor:default}.primary{background:#174a80;color:white}.preview{margin-top:20px;padding:16px;border:2px solid #5c86b7;border-radius:10px}
    .actions{display:flex;gap:12px;flex-wrap:wrap}.notice{font-size:13px;color:#536780;margin-top:24px}.error{color:#b42318}.success{color:#087443}
    @media(max-width:600px){.page{padding:12px}.panel,header{padding:16px}.preview{padding:12px}}
  `]
})
export class SignatureSettingsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private destroyed = false;
  profile: SignatureProfile | null = null;
  draft: string | null = null;
  loading = false;
  loadFailed = false;
  saving = false;
  editorOpen = false;
  error = '';
  success = '';
  constructor(private http: HttpClient, private dialog: MatDialog, private cdr: ChangeDetectorRef) {}
  ngOnInit(): void { this.load(); }
  load(): void {
    if (this.loading || this.saving) return;
    this.loading = true;this.error = '';this.loadFailed = false;
    this.http.get<SignatureProfile>(`${environment.apiUrl}/signatures/me`).pipe(takeUntil(this.destroy$)).subscribe({
      next: profile => { this.profile = profile;this.loading = false;this.cdr.markForCheck(); },
      error: () => { this.loading = false;this.loadFailed = true;this.error = 'Could not load your saved signature. Retry before replacing it.';this.cdr.markForCheck(); }
    });
  }
  draw(): void {
    if (this.editorOpen || this.saving || this.loading || this.loadFailed) return;
    this.editorOpen = true;this.success = '';
    const editor = this.dialog.open(SignaturePadDialogComponent, {
      width: '1100px', maxWidth: '96vw', maxHeight: '96dvh', autoFocus: 'first-tabbable',
      restoreFocus: true, ariaLabel: 'Draw handwritten signature', closeOnNavigation: true
    });
    editor.afterClosed().pipe(takeUntil(this.destroy$)).subscribe(image => {
      this.editorOpen = false;if (image) this.draft = image;this.cdr.markForCheck();
    });
    this.destroy$.pipe(takeUntil(editor.afterClosed())).subscribe(() => editor.close());
  }
  discard(): void { if (!this.saving) this.draft = null; }
  save(): void {
    if (!this.draft || this.saving || this.destroyed) return;
    this.saving = true;this.error = '';this.success = '';
    this.http.put<SignatureProfile>(`${environment.apiUrl}/signatures/me`, {imageBase64: this.draft})
      .pipe(takeUntil(this.destroy$)).subscribe({
        next: profile => {
          this.profile = profile;this.draft = null;this.saving = false;
          this.success = 'Signature saved. Future approvals can use this version.';this.cdr.markForCheck();
        },
        error: response => {
          this.saving = false;this.error = typeof response?.error?.message === 'string' ? response.error.message : 'Could not save your signature. Your draft is ready to retry.';
          this.cdr.markForCheck();
        }
      });
  }
  ngOnDestroy(): void { this.destroyed = true;this.destroy$.next();this.destroy$.complete(); }
}
