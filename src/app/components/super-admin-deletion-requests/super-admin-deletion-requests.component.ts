import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Subject, takeUntil } from 'rxjs';
import {
  ACCOUNT_DELETION_NEXT_STATUS,
  ACCOUNT_DELETION_STATUS_LABELS,
  ACCOUNT_DELETION_STATUSES,
  AccountDeletionAccessCheck,
  AccountDeletionRequestAdminView,
  AccountDeletionRequestStatus,
  isOpenDeletionStatus,
} from '../../interfaces/account-deletion-request';
import { AccountDeletionService } from '../../services/account-deletion.service';
import { ToastService } from '../../services/toast.service';
import { LoggerService } from '../../services/logger.service';

/**
 * SUPER_ADMIN review queue for account deletion requests. A request moves one stage at a time
 * (Received → Identity verified → Awaiting school review → Approved → Processing → Completed), or
 * to Not fulfilled from any open stage. Saving a stage deletes nothing; the only action here is
 * revoking the requester's sessions and push tokens while Processing. Completing is refused by the
 * backend until access is verifiably gone and what was done and kept is recorded
 * (backend docs/operations/account-deletion.md). A closed request is read-only.
 */
@Component({
  selector: 'app-super-admin-deletion-requests',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './super-admin-deletion-requests.component.html',
  styleUrls: ['../super-admin-support-queue/super-admin-support-queue.component.css'],
  styles: [`
    .sadr-access { border: 1.5px solid #e2e8f0; border-radius: 10px; padding: 10px 12px; font-size: 0.82rem; color: #334155; display: flex; flex-direction: column; gap: 4px; }
    .sadr-access.is-clear { border-color: #86efac; background: #f0fdf4; }
    .sadr-access button { align-self: flex-start; margin-top: 6px; border: 0; border-radius: 8px; padding: 7px 14px; background: #dc2626; color: #fff; font-weight: 700; cursor: pointer; }
    .sadr-access button:disabled { opacity: 0.6; cursor: not-allowed; }
    .sadr-confirm { display: flex; gap: 8px; align-items: flex-start; font-size: 0.82rem; color: #334155; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuperAdminDeletionRequestsComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  readonly statuses = ACCOUNT_DELETION_STATUSES;
  readonly statusLabels = ACCOUNT_DELETION_STATUS_LABELS;

  filterStatus: AccountDeletionRequestStatus | '' = 'PENDING';
  requests: AccountDeletionRequestAdminView[] = [];
  loading = true;
  failed = false;
  currentPage = 0;
  totalPages = 0;

  selected: AccountDeletionRequestAdminView | null = null;
  statusDraft: AccountDeletionRequestStatus = 'PENDING';
  userMessageDraft = '';
  internalNoteDraft = '';
  retainedDataDraft = '';
  fulfilmentConfirmed = false;
  saving = false;

  access: AccountDeletionAccessCheck | null = null;
  accessFailed = false;
  revoking = false;

  constructor(
    private deletionService: AccountDeletionService,
    private toast: ToastService,
    private logger: LoggerService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get selectedIsOpen(): boolean {
    return !!this.selected && isOpenDeletionStatus(this.selected.status);
  }

  /** The current stage, the next one, and Not fulfilled — the backend refuses any other move. */
  get allowedStatuses(): AccountDeletionRequestStatus[] {
    if (!this.selected) return [];
    if (!this.selectedIsOpen) return [this.selected.status];
    const next = ACCOUNT_DELETION_NEXT_STATUS[this.selected.status];
    return [this.selected.status, ...(next ? [next] : []), 'REJECTED'];
  }

  /** What the chosen stage still needs before it can be saved; empty when it can be. Mirrors the backend. */
  get missing(): string[] {
    const missing: string[] = [];
    const note = !!this.internalNoteDraft.trim();
    if (this.statusDraft === 'APPROVED' && !note) missing.push('who at the school approved it (internal note)');
    if (this.statusDraft === 'REJECTED') {
      if (!note) missing.push('the reason (internal note)');
      if (!this.userMessageDraft.trim()) missing.push('a message to the requester');
    }
    if (this.statusDraft === 'COMPLETED') {
      if (!note) missing.push('what was deleted or anonymised (internal note)');
      if (!this.retainedDataDraft.trim()) missing.push('what the school keeps');
      if (!this.fulfilmentConfirmed) missing.push('your confirmation');
      if (!this.access?.accessRemoved) missing.push('login inactive, sessions revoked and push tokens removed');
    }
    return missing;
  }

  get canSave(): boolean {
    return this.selectedIsOpen && !this.saving && this.missing.length === 0;
  }

  get canRevoke(): boolean {
    return this.selected?.status === 'PROCESSING' && !this.revoking && this.access?.login !== 'OTHER_SCHOOL';
  }

  load(page = 0): void {
    this.loading = true;
    this.failed = false;
    this.cdr.markForCheck();
    this.deletionService.list(this.filterStatus, page).pipe(takeUntil(this.destroy$)).subscribe({
      next: result => {
        this.requests = result.content;
        this.currentPage = result.number;
        this.totalPages = result.totalPages;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: error => {
        this.logger.error('Account deletion requests load failed:', error);
        this.loading = false;
        this.failed = true;
        this.cdr.markForCheck();
      },
    });
  }

  prevPage(): void { if (this.currentPage > 0) this.load(this.currentPage - 1); }
  nextPage(): void { if (this.currentPage < this.totalPages - 1) this.load(this.currentPage + 1); }

  open(request: AccountDeletionRequestAdminView): void {
    this.selected = request;
    this.statusDraft = request.status;
    this.userMessageDraft = request.userMessage ?? '';
    this.internalNoteDraft = request.internalNote ?? '';
    this.retainedDataDraft = request.retainedData ?? '';
    this.fulfilmentConfirmed = false;
    this.loadAccess();
  }

  loadAccess(): void {
    if (!this.selected) return;
    const id = this.selected.id;
    this.access = null;
    this.accessFailed = false;
    this.deletionService.access(id).pipe(takeUntil(this.destroy$)).subscribe({
      next: access => {
        if (this.selected?.id !== id) return;
        this.access = access;
        this.cdr.markForCheck();
      },
      error: error => {
        this.logger.error('Account deletion access check failed:', error);
        this.accessFailed = true;
        this.cdr.markForCheck();
      },
    });
  }

  async revokeAccess(): Promise<void> {
    if (!this.selected || !this.canRevoke) return;
    const request = this.selected;
    const confirmed = await this.toast.confirm({
      title: 'Revoke access?',
      message: `Signs ${request.userId} out of every device and removes their push notification tokens in this school. `
        + 'It does not deactivate the login or delete any record.',
      icon: 'warning',
      confirmText: 'Revoke access',
      cancelText: 'Cancel',
      danger: true,
    });
    if (!confirmed) return;
    this.revoking = true;
    this.cdr.markForCheck();
    this.deletionService.revokeAccess(request.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: result => {
        this.revoking = false;
        this.access = result.after;
        this.toast.success('Access revoked',
          `${result.sessionsRevoked} session(s) revoked, ${result.pushTokensRemoved} push token(s) removed.`);
        this.cdr.markForCheck();
      },
      error: error => {
        this.revoking = false;
        this.logger.error('Account deletion access revocation failed:', error);
        this.toast.error('Unable to revoke access', error?.error?.message || 'Please try again in a moment.');
        this.cdr.markForCheck();
      },
    });
  }

  close(): void {
    this.selected = null;
  }

  save(): void {
    if (!this.selected || !this.canSave) return;
    this.saving = true;
    this.deletionService.updateStatus(this.selected.id, {
      status: this.statusDraft,
      userMessage: this.userMessageDraft.trim() || null,
      internalNote: this.internalNoteDraft.trim() || null,
      retainedData: this.retainedDataDraft.trim() || null,
      fulfilmentConfirmed: this.statusDraft === 'COMPLETED' && this.fulfilmentConfirmed,
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: updated => {
        this.saving = false;
        this.selected = updated;
        this.statusDraft = updated.status;
        this.fulfilmentConfirmed = false;
        this.requests = this.requests.map(r => r.id === updated.id ? updated : r);
        this.toast.success('Request updated', `${updated.reference} is now ${this.statusLabels[updated.status]}.`);
        this.cdr.markForCheck();
      },
      error: error => {
        this.saving = false;
        this.logger.error('Account deletion request update failed:', error);
        this.toast.error('Unable to update request', error?.error?.message || 'Please try again in a moment.');
        this.cdr.markForCheck();
      },
    });
  }
}
