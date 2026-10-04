import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { saveAs } from 'file-saver';
import { ParentBulkImportService } from '../../services/parent-bulk-import.service';
import {
  ParentImportConfirmResponse,
  ParentImportPreviewResponse,
  ParentImportResolutions,
  ParentImportRowPreview,
  RESOLVABLE_STATUSES,
  RowAction,
  RowStatus,
} from '../../interfaces/parent-bulk-import';
import { ToastService } from '../../services/toast.service';
import { LoggerService } from '../../services/logger.service';

type Stage = 'upload' | 'preview' | 'result';

/** One admin decision per ambiguous row, held only in this component until Confirm is
 *  clicked — nothing is sent to the server until then. */
interface RowChoice {
  action: RowAction;
  existingParentId: string;
}

@Component({
  selector: 'app-parent-bulk-import',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './parent-bulk-import.component.html',
  styleUrl: './parent-bulk-import.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ParentBulkImportComponent {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  stage: Stage = 'upload';
  selectedFile: File | null = null;
  isUploading = false;
  isConfirming = false;
  isDownloadingTemplate = false;
  isDownloadingPrefill = false;
  error = '';

  preview: ParentImportPreviewResponse | null = null;
  confirmResult: ParentImportConfirmResponse | null = null;

  /** Row number -> admin's chosen resolution, for CONFLICT_* rows only. */
  choices = new Map<number, RowChoice>();

  constructor(
    private parentBulkImportService: ParentBulkImportService,
    private router: Router,
    private toast: ToastService,
    private logger: LoggerService,
    private cdr: ChangeDetectorRef,
  ) {}

  // ── File selection ───────────────────────────────────────────────

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.acceptFile(input.files?.[0] ?? null, input);
  }

  onDropZoneClick(): void {
    this.fileInput.nativeElement.click();
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.acceptFile(event.dataTransfer?.files[0] ?? null);
  }

  private acceptFile(file: File | null, input?: HTMLInputElement): void {
    if (!file) return;
    if (!file.name.endsWith('.csv')) {
      this.error = 'Only CSV files are accepted.';
      this.selectedFile = null;
      if (input) input.value = '';
    } else if (file.size > 50 * 1024 * 1024) {
      this.error = 'File too large. CSV must be under 50MB.';
      this.selectedFile = null;
      if (input) input.value = '';
    } else {
      this.error = '';
      this.selectedFile = file;
    }
    this.cdr.markForCheck();
  }

  // ── Template / pre-fill downloads ───────────────────────────────────

  downloadTemplate(): void {
    this.isDownloadingTemplate = true;
    this.cdr.markForCheck();
    this.parentBulkImportService.downloadTemplate().subscribe({
      next: (blob) => {
        saveAs(blob, 'parent_import_template.csv');
        this.isDownloadingTemplate = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.logger.error('Failed to download parent import template', err);
        this.isDownloadingTemplate = false;
        this.error = 'Failed to download template. Please try again.';
        this.cdr.markForCheck();
      },
    });
  }

  downloadPrefill(): void {
    this.isDownloadingPrefill = true;
    this.cdr.markForCheck();
    this.parentBulkImportService.downloadPrefill().subscribe({
      next: (blob) => {
        saveAs(blob, 'parent_import_prefill.csv');
        this.isDownloadingPrefill = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.logger.error('Failed to download parent import pre-fill sheet', err);
        this.isDownloadingPrefill = false;
        this.error = 'Failed to download the pre-fill sheet. Please try again.';
        this.cdr.markForCheck();
      },
    });
  }

  // ── Preview ──────────────────────────────────────────────────────

  runPreview(): void {
    if (!this.selectedFile) return;
    this.isUploading = true;
    this.error = '';
    this.cdr.markForCheck();

    this.parentBulkImportService.preview(this.selectedFile).subscribe({
      next: (result) => {
        this.preview = result;
        // Deliberately NOT pre-populated with a "link existing" default: a conflict row is
        // exactly the case the spec says must never be auto-merged, so every row here starts
        // unresolved (choiceFor()'s fallback shows "Skip this row") until the admin actively
        // reviews it and picks something — matching the backend's own safe-by-default
        // behavior when no resolution is supplied for a CONFLICT_* row.
        this.choices = new Map();
        this.stage = 'preview';
        this.isUploading = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.logger.error('Parent bulk import preview failed', err);
        this.error = 'Could not read this file. Please check the format and try again.';
        this.isUploading = false;
        this.cdr.markForCheck();
      },
    });
  }

  isResolvable(row: ParentImportRowPreview): boolean {
    return RESOLVABLE_STATUSES.includes(row.status);
  }

  choiceFor(row: ParentImportRowPreview): RowChoice {
    return this.choices.get(row.row) ?? { action: 'SKIP', existingParentId: '' };
  }

  setAction(row: ParentImportRowPreview, action: RowAction): void {
    const current = this.choiceFor(row);
    // Switching to "Link to existing" pre-fills the ID field with the account this row
    // actually matched on phone/email, since re-typing an ID the admin can already see in
    // the dropdown label would be pure friction — still fully editable if they want a
    // different parent instead, and never overwrites something already typed.
    const existingParentId = action === 'LINK_EXISTING' && !current.existingParentId
      ? (row.matchedParentId ?? '')
      : current.existingParentId;
    this.choices.set(row.row, { action, existingParentId });
    this.cdr.markForCheck();
  }

  setExistingParentId(row: ParentImportRowPreview, value: string): void {
    const current = this.choiceFor(row);
    this.choices.set(row.row, { ...current, existingParentId: value });
    this.cdr.markForCheck();
  }

  get resolvableRows(): ParentImportRowPreview[] {
    return this.preview?.rows.filter((r) => this.isResolvable(r)) ?? [];
  }

  get autoImportRows(): ParentImportRowPreview[] {
    return this.preview?.rows.filter((r) => r.status === 'VALID_NEW_PARENT' || r.status === 'VALID_EXISTING_PARENT_MATCH') ?? [];
  }

  get blockedRows(): ParentImportRowPreview[] {
    return this.preview?.rows.filter((r) =>
      ['INVALID_STUDENT_ID', 'STUDENT_EXITED', 'MISSING_REQUIRED_FIELD', 'DUPLICATE_ROW_IN_FILE', 'ALREADY_LINKED'].includes(r.status)
    ) ?? [];
  }

  statusLabel(status: RowStatus): string {
    const labels: Record<RowStatus, string> = {
      VALID_NEW_PARENT: 'New parent',
      VALID_EXISTING_PARENT_MATCH: 'Matches existing parent',
      CONFLICT_PHONE_MATCH_EMAIL_DIFFERS: 'Phone matches, email differs',
      CONFLICT_EMAIL_MATCH_PHONE_DIFFERS: 'Email matches, phone differs',
      INVALID_STUDENT_ID: 'Invalid Student ID',
      STUDENT_EXITED: 'Student has left the school',
      MISSING_REQUIRED_FIELD: 'Missing required field',
      DUPLICATE_ROW_IN_FILE: 'Duplicate row in file',
      ALREADY_LINKED: 'Already linked',
      RESTORABLE: 'Ended link — can be restored',
    };
    return labels[status];
  }

  outcomeLabel(outcome: string): string {
    const labels: Record<string, string> = {
      created: 'Linked', restored: 'Restored', already_linked: 'Already linked', restorable: 'Ended link — not restored',
    };
    return labels[outcome] ?? outcome;
  }

  // ── Confirm ──────────────────────────────────────────────────────

  confirmImport(): void {
    if (!this.selectedFile || !this.preview) return;
    this.isConfirming = true;
    this.cdr.markForCheck();

    const resolutions: ParentImportResolutions = {};
    for (const [row, choice] of this.choices.entries()) {
      resolutions[String(row)] = {
        action: choice.action,
        existingParentId: choice.action === 'LINK_EXISTING' ? (choice.existingParentId || null) : null,
      };
    }

    this.parentBulkImportService.confirm(this.selectedFile, resolutions).subscribe({
      next: (result) => {
        this.confirmResult = result;
        this.stage = 'result';
        this.isConfirming = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.logger.error('Parent bulk import confirm failed', err);
        this.error = 'Import failed. Please try again.';
        this.isConfirming = false;
        this.cdr.markForCheck();
      },
    });
  }

  backToUpload(): void {
    // Clears the previously selected file too — the button is labeled "Choose a Different
    // File", so leaving the old one still selected (drop-zone showing it as ready) would
    // contradict what the button says it does.
    this.stage = 'upload';
    this.selectedFile = null;
    this.preview = null;
    this.confirmResult = null;
    this.choices = new Map();
    this.error = '';
    if (this.fileInput) this.fileInput.nativeElement.value = '';
    this.cdr.markForCheck();
  }

  reset(): void {
    this.stage = 'upload';
    this.selectedFile = null;
    this.preview = null;
    this.confirmResult = null;
    this.choices = new Map();
    this.error = '';
    if (this.fileInput) this.fileInput.nativeElement.value = '';
    this.cdr.markForCheck();
  }

  goToParentPortal(): void {
    this.router.navigate(['/dashboard/parent-portal']);
  }

  trackByRow(_: number, row: ParentImportRowPreview): number { return row.row; }
}
