import { Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { ConfirmDialogComponent } from '../components/confirm-dialog/confirm-dialog.component';
import { SelectMonthDialogComponent } from '../components/select-month-dialog/select-month-dialog.component';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration: number;
}

export interface ConfirmDialogData {
  title: string;
  /** Plain-text message */
  message?: string;
  /** HTML message — renders rich content; takes priority over message */
  html?: string;
  confirmText?: string;
  /** Omit or leave empty to show only the confirm button (alert mode) */
  cancelText?: string;
  /** Red confirm button for destructive actions */
  danger?: boolean;
  icon?: 'warning' | 'question' | 'info' | 'success' | 'danger';
  /** When set, user must type this exact string to enable the confirm button (e.g. "DELETE") */
  requiredInput?: string;
  /** Shows a free-text reason field; use {@link ToastService.confirmWithReason} to read it. */
  reasonInput?: { label: string; placeholder?: string; required?: boolean; maxLength?: number };
}

export interface SelectMonthDialogData {
  title: string;
  options: { value: number; label: string }[];
  confirmText?: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts$ = new BehaviorSubject<Toast[]>([]);

  constructor(private dialog: MatDialog) {}

  private add(type: ToastType, title: string, message?: string, duration?: number): void {
    const d = duration ?? ((type === 'error' || type === 'warning') ? 5000 : 3500);
    const toast: Toast = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type,
      title,
      message,
      duration: d,
    };
    this.toasts$.next([...this.toasts$.value, toast]);
  }

  dismiss(id: string): void {
    this.toasts$.next(this.toasts$.value.filter(t => t.id !== id));
  }

  success(title: string, message?: string): void { this.add('success', title, message); }
  error(title: string, message?: string): void   { this.add('error',   title, message); }
  warning(title: string, message?: string): void { this.add('warning', title, message); }
  info(title: string, message?: string): void    { this.add('info',    title, message); }

  /**
   * Open a confirmation / alert dialog.
   * Returns true when the user clicks the confirm button.
   * If cancelText is omitted the dialog acts as a simple alert (one button only).
   */
  confirm(data: ConfirmDialogData): Promise<boolean> {
    return firstValueFrom(
      this.dialog.open(ConfirmDialogComponent, {
        data,
        maxWidth: '440px',
        width: '92vw',
        panelClass: 'edu-dialog',
        disableClose: true,
      }).afterClosed()
    ).then(r => !!r);
  }

  /** Confirm dialog with a reason field. Resolves to the reason ('' if left empty) or null if cancelled. */
  confirmWithReason(data: ConfirmDialogData & { reasonInput: NonNullable<ConfirmDialogData['reasonInput']> }): Promise<string | null> {
    return firstValueFrom(
      this.dialog.open(ConfirmDialogComponent, {
        data,
        maxWidth: '440px',
        width: '92vw',
        panelClass: 'edu-dialog',
        disableClose: true,
      }).afterClosed()
    ).then(r => (r === undefined || r === null || r === false) ? null : (r === true ? '' : String(r)));
  }

  /** Open a month-picker dialog. Returns the selected month number, or null if cancelled. */
  selectMonth(data: SelectMonthDialogData): Promise<number | null> {
    return firstValueFrom(
      this.dialog.open(SelectMonthDialogComponent, {
        data,
        maxWidth: '380px',
        width: '92vw',
        panelClass: 'edu-dialog',
      }).afterClosed()
    ).then(r => (r !== undefined && r !== null && r !== false) ? r : null);
  }
}
