import { CommonModule } from '@angular/common';
import { SupportScreenshotViewerComponent } from '../support-screenshot-viewer/support-screenshot-viewer.component';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import {
  SUPPORT_TICKET_CATEGORIES,
  SupportTicketCategory,
  SupportTicketDetail,
  SupportTicketStatus,
  SupportTicketSummary,
  supportCategoryLabel,
  supportStatusLabel,
} from '../../interfaces/support-ticket';
import { SupportTicketService } from '../../services/support-ticket.service';
import { SchoolService, SchoolSettings } from '../../services/school.service';
import { ToastService } from '../../services/toast.service';
import { LoggerService } from '../../services/logger.service';

@Component({
  selector: 'app-super-admin-support-queue',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, RouterLink, SupportScreenshotViewerComponent],
  templateUrl: './super-admin-support-queue.component.html',
  styleUrl: './super-admin-support-queue.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuperAdminSupportQueueComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  screenshotUrls: string[] = [];
  screenshotIndex: number | null = null;

  openScreenshot(urls: string[], index: number): void {
    this.screenshotUrls = urls;
    this.screenshotIndex = index;
    this.cdr.markForCheck();
  }

  closeScreenshot(): void {
    this.screenshotIndex = null;
    this.cdr.markForCheck();
  }
  readonly categories = SUPPORT_TICKET_CATEGORIES;
  readonly statuses: SupportTicketStatus[] = ['OPEN', 'IN_PROGRESS', 'RESOLVED'];
  readonly categoryLabel = supportCategoryLabel;
  readonly statusLabel = supportStatusLabel;

  schools: SchoolSettings[] = [];
  filterStatus: SupportTicketStatus | '' = '';
  filterCategory: SupportTicketCategory | '' = '';
  filterSchoolId: number | '' = '';

  tickets: SupportTicketSummary[] = [];
  loading = true;
  failed = false;
  currentPage = 0;
  totalPages = 0;

  selectedId: number | null = null;
  detail: SupportTicketDetail | null = null;
  detailLoading = false;
  statusDraft: SupportTicketStatus = 'OPEN';
  internalNoteDraft = '';
  saving = false;

  constructor(
    private supportTicketService: SupportTicketService,
    private schoolService: SchoolService,
    private toast: ToastService,
    private logger: LoggerService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.schoolService.listAllSchools().pipe(takeUntil(this.destroy$)).subscribe({
      next: schools => { this.schools = schools; this.cdr.markForCheck(); },
      error: error => this.logger.error('Schools load failed (support queue school filter):', error),
    });
    this.load();
  }

  load(page: number = 0): void {
    this.loading = true;
    this.failed = false;
    this.supportTicketService.allTickets(
      page, 20,
      this.filterStatus || null, this.filterCategory || null, this.filterSchoolId || null,
    ).pipe(takeUntil(this.destroy$)).subscribe({
      next: result => {
        this.tickets = result.content;
        this.currentPage = result.number;
        this.totalPages = result.totalPages;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: error => {
        this.logger.error('Support queue load failed:', error);
        this.loading = false;
        this.failed = true;
        this.cdr.markForCheck();
      },
    });
  }

  applyFilters(): void { this.load(0); }

  prevPage(): void { if (this.currentPage > 0) this.load(this.currentPage - 1); }
  nextPage(): void { if (this.currentPage < this.totalPages - 1) this.load(this.currentPage + 1); }

  openTicket(ticket: SupportTicketSummary): void {
    this.selectedId = ticket.id;
    this.detail = null;
    this.detailLoading = true;
    this.cdr.markForCheck();
    this.supportTicketService.adminTicketDetail(ticket.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: detail => {
        this.detail = detail;
        this.statusDraft = detail.status;
        this.internalNoteDraft = detail.internalNote ?? '';
        this.detailLoading = false;
        this.cdr.markForCheck();
      },
      error: error => {
        this.logger.error('Support ticket detail load failed:', error);
        this.detailLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  closeDetail(): void {
    this.selectedId = null;
    this.detail = null;
  }

  saveStatus(): void {
    if (!this.detail) return;
    this.saving = true;
    this.supportTicketService.updateStatus(this.detail.id, {
      status: this.statusDraft,
      internalNote: this.internalNoteDraft.trim() || null,
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: updated => {
        this.saving = false;
        this.detail = updated;
        this.toast.success('Ticket updated', `${updated.ticketNumber} is now ${this.statusLabel(updated.status)}.`);
        const row = this.tickets.find(t => t.id === updated.id);
        if (row) { row.status = updated.status; row.updatedAt = updated.updatedAt; }
        this.cdr.markForCheck();
      },
      error: error => {
        this.saving = false;
        this.logger.error('Support ticket status update failed:', error);
        this.toast.error('Unable to update ticket', this.errorMessage(error));
        this.cdr.markForCheck();
      },
    });
  }

  statusClass(status: string): string { return 'saq-status--' + status.toLowerCase(); }

  private errorMessage(error: any): string {
    return error?.error?.detail || error?.error?.message || 'Please try again in a moment.';
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
