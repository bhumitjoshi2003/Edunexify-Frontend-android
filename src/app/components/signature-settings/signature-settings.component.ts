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
    <main class="signature-page">
      <header class="signature-hero">
        <div>
          <span class="eyebrow">REPORT CARDS</span>
          <h1>My Signature</h1>
        </div>
        <span class="hero-mark" aria-hidden="true">✍</span>
      </header>

      <section class="signature-card" aria-labelledby="signature-heading">
        <div class="card-heading">
          <div>
            <h2 id="signature-heading">Saved signature</h2>
            <p>Your current signature for future approvals</p>
          </div>
          <span class="status" *ngIf="!loading && !loadFailed" [class.status-empty]="!profile?.saved">
            {{ profile?.saved ? 'Saved' : 'Not added' }}
          </span>
        </div>
        <p *ngIf="loading" role="status" class="state-message">Loading your signature…</p>
        <p *ngIf="error" role="alert" class="error">{{ error }}</p>
        <button type="button" *ngIf="loadFailed" (click)="load()" [disabled]="loading">Retry loading</button>
        <p *ngIf="success" role="status" class="success">{{ success }}</p>

        <div class="signature-content" *ngIf="!loading && !loadFailed">
          <div class="signature-frame">
            <img *ngIf="profile?.imageBase64; else noSignature" [src]="'data:image/png;base64,' + profile!.imageBase64" alt="Your saved handwritten signature"/>
            <ng-template #noSignature><p class="empty-signature">No signature saved yet</p></ng-template>
          </div>
          <div class="signature-actions">
            <span class="field-label">SIGNATURE DETAILS</span>
            <p class="updated" *ngIf="profile?.updatedAt">Updated {{ profile!.updatedAt | date:'mediumDate' }}</p>
            <p class="updated" *ngIf="!profile?.updatedAt">Add a signature to begin</p>
            <button type="button" class="primary" (click)="draw()" [disabled]="saving || editorOpen">
              {{ profile?.saved ? 'Replace signature' : 'Draw signature' }}
            </button>
          </div>
        </div>

        <section *ngIf="draft" class="preview" aria-label="New signature preview">
          <h3>New signature preview</h3>
          <img [src]="'data:image/png;base64,' + draft" alt="New signature awaiting save"/>
          <p>Saving will replace your signature for future approvals. Earlier approved documents remain unchanged.</p>
          <div class="actions">
            <button type="button" (click)="discard()" [disabled]="saving">Discard</button>
            <button type="button" class="primary" (click)="save()" [disabled]="saving">{{ saving ? 'Saving…' : 'Save signature' }}</button>
          </div>
        </section>
      </section>
      <p class="notice"><span aria-hidden="true">ⓘ</span> Saving a signature does not approve a report card. Approval is a separate step.</p>
    </main>
  `,
  styles: [`
    :host{display:block}
    .signature-page{color:var(--edu-text,#1e293b);padding:0 0 24px;font-family:Inter,"Segoe UI",sans-serif}
    .signature-page *{box-sizing:border-box}
    .signature-hero{display:flex;align-items:center;justify-content:space-between;gap:22px;min-height:112px;padding:24px 28px;position:relative;overflow:hidden;border-radius:22px;background:radial-gradient(circle at 87% 5%,rgba(255,255,255,.18) 0 74px,transparent 75px),linear-gradient(118deg,#123b46,#087e88 58%,#11aaa8);color:#fff;box-shadow:0 16px 35px rgba(15,118,110,.16)}
    .eyebrow{display:block;font-size:.68rem;font-weight:800;letter-spacing:1.4px;color:#b8ede7;margin-bottom:5px}
    .signature-hero h1{font-size:clamp(1.4rem,2.3vw,1.65rem);letter-spacing:-.5px;line-height:1.2;margin:0;font-weight:800}
    .hero-mark{display:grid;place-items:center;width:52px;height:52px;flex:none;border-radius:16px;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.13);font-size:1.65rem}
    .signature-card{margin-top:18px;background:#fff;border:1px solid #e3eaf1;border-radius:20px;padding:22px 24px;box-shadow:0 10px 26px rgba(28,54,80,.055)}
    .card-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-bottom:16px;border-bottom:1px solid #e9edf2}
    .card-heading h2{font-size:1.12rem;font-weight:750;margin:0 0 4px;color:#1b293f}
    .card-heading p{margin:0;color:#718198;font-size:.84rem}
    .status{border:1px solid #bcebd9;background:#e7f9f1;color:#087b57;border-radius:999px;padding:6px 12px;font-size:.76rem;font-weight:700;white-space:nowrap}
    .status-empty{background:#f3f6fa;border-color:#e0e7ef;color:#63758d}
    .signature-content{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(200px,.8fr);align-items:center;gap:28px;padding-top:20px}
    .signature-frame{min-height:160px;border:1px dashed #c8d6e4;border-radius:14px;background:#f9fbfd;display:grid;place-items:center;overflow:hidden;padding:14px}
    .signature-frame img{display:block;width:100%;max-width:540px;height:140px;object-fit:contain}
    .empty-signature{margin:0;font-size:.9rem;color:#7b8ca2}
    .signature-actions{display:flex;flex-direction:column;align-items:flex-start;gap:11px}
    .field-label{font-size:.68rem;font-weight:800;letter-spacing:1px;color:#708198}
    .updated{color:#344860;margin:0;font-size:.9rem}
    button{min-height:42px;border:1px solid #cbd8e6;border-radius:10px;padding:10px 16px;background:#fff;color:#23425e;font-weight:650;cursor:pointer}
    button:hover:not(:disabled){background:#f3f7fa}
    button:disabled{opacity:.55;cursor:default}
    button.primary{background:#193e62;border-color:#193e62;color:#fff}
    button.primary:hover:not(:disabled){background:#12506e}
    .notice{display:flex;align-items:flex-start;gap:9px;background:#eff9f7;border:1px solid #d4eee7;border-radius:12px;color:#296d69;padding:13px 16px;font-size:.85rem;line-height:1.4;margin:16px 0 0}
    .notice span{font-size:1.1rem;line-height:1}
    .preview{margin-top:20px;padding:18px;background:#f7fafc;border:1px solid #d9e5ef;border-radius:14px}
    .preview h3{font-size:1rem;margin:0 0 12px}
    .preview img{display:block;width:100%;max-width:540px;height:140px;object-fit:contain;border:1px solid #d5e1ec;background:white;border-radius:10px}
    .preview p{color:#64748b;font-size:.84rem;line-height:1.5}
    .actions{display:flex;gap:10px;flex-wrap:wrap}
    .state-message{color:#6a7c91}
    .error{color:#b42318}
    .success{color:#087443}
    @media(max-width:680px){
      .signature-page{padding:0 0 20px}
      .signature-hero{padding:20px 18px;border-radius:18px}
      .hero-mark{width:40px;height:40px;font-size:1.35rem}
      .signature-card{padding:18px 16px;border-radius:17px;margin-top:14px}
      .signature-content{grid-template-columns:1fr;gap:16px}
      .signature-frame{min-height:140px}
      .signature-frame img{height:120px}
      .signature-actions{gap:8px}
      .signature-actions .primary{width:100%}
      .notice{margin-top:12px}
    }
    @media(max-width:380px){.hero-mark{display:none}}
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
