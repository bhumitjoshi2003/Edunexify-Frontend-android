import { CommonModule } from '@angular/common';
import { SupportScreenshotViewerComponent } from '../support-screenshot-viewer/support-screenshot-viewer.component';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import {
  SupportTicketDetail,
  SupportTicketSummary,
  supportCategoryLabel,
  supportStatusLabel,
} from '../../interfaces/support-ticket';
import { SupportTicketService } from '../../services/support-ticket.service';
import { LoggerService } from '../../services/logger.service';

@Component({
  selector: 'app-my-support-requests',
  standalone: true,
  imports: [CommonModule, MatIconModule, RouterLink, SupportScreenshotViewerComponent],
  templateUrl: './my-support-requests.component.html',
  styleUrl: './my-support-requests.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MySupportRequestsComponent implements OnInit, OnDestroy {
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
  readonly categoryLabel = supportCategoryLabel;
  readonly statusLabel = supportStatusLabel;

  tickets: SupportTicketSummary[] = [];
  loading = true;
  failed = false;
  currentPage = 0;
  totalPages = 0;

  expandedId: number | null = null;
  detail: SupportTicketDetail | null = null;
  detailLoading = false;

  constructor(
    private supportTicketService: SupportTicketService,
    private logger: LoggerService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void { this.load(); }

  load(page: number = 0): void {
    this.loading = true;
    this.failed = false;
    this.supportTicketService.myTickets(page).pipe(takeUntil(this.destroy$)).subscribe({
      next: result => {
        this.tickets = result.content;
        this.currentPage = result.number;
        this.totalPages = result.totalPages;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: error => {
        this.logger.error('My support requests load failed:', error);
        this.loading = false;
        this.failed = true;
        this.cdr.markForCheck();
      },
    });
  }

  toggleDetail(ticket: SupportTicketSummary): void {
    if (this.expandedId === ticket.id) {
      this.expandedId = null;
      this.detail = null;
      return;
    }
    this.expandedId = ticket.id;
    this.detail = null;
    this.detailLoading = true;
    this.supportTicketService.myTicketDetail(ticket.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: detail => {
        this.detail = detail;
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

  prevPage(): void { if (this.currentPage > 0) this.load(this.currentPage - 1); }
  nextPage(): void { if (this.currentPage < this.totalPages - 1) this.load(this.currentPage + 1); }

  statusClass(status: string): string { return 'msr-status--' + status.toLowerCase(); }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
