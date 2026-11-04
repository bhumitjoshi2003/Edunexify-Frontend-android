import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { MatIconModule } from '@angular/material/icon';
import { Subject, takeUntil } from 'rxjs';
import {
  ACCOUNT_DELETION_STATUS_LABELS,
  AccountDeletionRequest,
  isOpenDeletionStatus,
} from '../../interfaces/account-deletion-request';
import { AccountDeletionService } from '../../services/account-deletion.service';
import { ToastService } from '../../services/toast.service';
import { LoggerService } from '../../services/logger.service';
import { PRIVACY_POLICY_URL, openExternalUrl } from '../../utils/legal-links';

/**
 * Lets any signed-in school user ask for their account to be deleted. Submitting records a
 * request for Edunexify to review — it deletes nothing by itself (see the backend's
 * AccountDeletionRequestService and docs/operations/account-deletion.md).
 */
@Component({
  selector: 'app-account-deletion-request',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './account-deletion-request.component.html',
  styleUrl: './account-deletion-request.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountDeletionRequestComponent implements OnInit, OnDestroy {
  readonly statusLabels = ACCOUNT_DELETION_STATUS_LABELS;

  loading = true;
  loadFailed = false;
  request: AccountDeletionRequest | null = null;
  reason = '';
  confirmed = false;
  submitting = false;

  private destroy$ = new Subject<void>();

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

  get isOpen(): boolean {
    return !!this.request && isOpenDeletionStatus(this.request.status);
  }

  /** A rejected request leaves the user free to ask again; an open or completed one does not. */
  get canSubmit(): boolean {
    return !this.request || this.request.status === 'REJECTED';
  }

  load(): void {
    this.loading = true;
    this.loadFailed = false;
    this.cdr.markForCheck();
    this.deletionService.mine().pipe(takeUntil(this.destroy$)).subscribe({
      next: request => {
        this.request = request;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: err => {
        this.logger.error('Failed to load account deletion request', err);
        this.loading = false;
        this.loadFailed = true;
        this.cdr.markForCheck();
      },
    });
  }

  submit(): void {
    if (!this.confirmed || this.submitting || !this.canSubmit) return;
    this.submitting = true;
    this.cdr.markForCheck();
    this.deletionService.submit(this.reason).pipe(takeUntil(this.destroy$)).subscribe({
      next: request => {
        this.request = request;
        this.submitting = false;
        this.confirmed = false;
        this.reason = '';
        this.toast.success('Request received', `Your reference is ${request.reference}.`);
        this.cdr.markForCheck();
      },
      error: (err: HttpErrorResponse) => {
        this.submitting = false;
        this.toast.error('Request not sent', err?.status === 429
          ? 'Too many requests. Please try again later.'
          : 'We could not send your request. Check your connection and try again.');
        this.cdr.markForCheck();
      },
    });
  }

  openPrivacyPolicy(): void {
    openExternalUrl(PRIVACY_POLICY_URL);
  }
}
