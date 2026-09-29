import { AfterViewInit, Component, ElementRef, Inject, SecurityContext, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ConfirmDialogData } from '../../services/toast.service';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatButtonModule],
  templateUrl: './confirm-dialog.component.html',
  styleUrl: './confirm-dialog.component.css',
})
export class ConfirmDialogComponent implements AfterViewInit {
  sanitizedHtml: SafeHtml | null = null;
  confirmInput = '';
  reasonText = '';

  @ViewChild('cancelBtn') cancelBtnRef?: ElementRef<HTMLButtonElement>;

  constructor(
    public ref: MatDialogRef<ConfirmDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ConfirmDialogData,
    private sanitizer: DomSanitizer,
  ) {
    if (data.html) {
      this.sanitizedHtml = this.sanitizer.sanitize(SecurityContext.HTML, data.html) ?? '';
    }
    this.ref.keydownEvents().subscribe(event => {
      if (event.key === 'Escape') this.ref.close(false);
    });
  }

  ngAfterViewInit(): void {
    // Focus cancel button by default (safer choice)
    setTimeout(() => this.cancelBtnRef?.nativeElement?.focus(), 100);
  }

  get confirmDisabled(): boolean {
    if (this.data.reasonInput?.required && !this.reasonText.trim()) return true;
    return !!this.data.requiredInput && this.confirmInput !== this.data.requiredInput;
  }

  get iconName(): string {
    const map: Record<string, string> = {
      warning: 'warning_amber',
      danger:  'delete_forever',
      question:'help_outline',
      info:    'info_outline',
      success: 'check_circle_outline',
    };
    return map[this.data.icon ?? 'warning'] ?? 'warning_amber';
  }

  get iconClass(): string {
    if (this.data.danger) return 'icon-danger';
    const map: Record<string, string> = {
      warning:  'icon-warning',
      danger:   'icon-danger',
      question: 'icon-question',
      info:     'icon-info',
      success:  'icon-success',
    };
    return map[this.data.icon ?? 'warning'] ?? 'icon-warning';
  }

  cancel():  void { this.ref.close(false); }
  /** With a reason field the dialog closes with the (trimmed) reason text, '' when left empty. */
  confirm(): void { this.ref.close(this.data.reasonInput ? this.reasonText.trim() : true); }
}
