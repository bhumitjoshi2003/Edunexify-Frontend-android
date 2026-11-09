import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Subject, takeUntil } from 'rxjs';
import {
  DELIVERY_CHANNELS,
  DELIVERY_STATUSES,
  DeliveryChannel,
  DeliveryDetail,
  DeliveryRow,
  DeliveryStatus,
  DeliverySummaryRow,
  deliveryChannelLabel,
  deliveryStatusLabel,
  deliveryStatusMeaning,
  eventCodeLabel,
} from '../../interfaces/notification-delivery';
import { NotificationDeliveryService } from '../../services/notification-delivery.service';
import { SchoolService, SchoolSettings } from '../../services/school.service';
import { LoggerService } from '../../services/logger.service';

@Component({
  selector: 'app-notification-delivery-log',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './notification-delivery-log.component.html',
  styleUrl: './notification-delivery-log.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationDeliveryLogComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  readonly pageSize = 25;
  readonly channels = DELIVERY_CHANNELS;
  readonly statuses = DELIVERY_STATUSES;
  readonly statusLabel = deliveryStatusLabel;
  readonly statusMeaning = deliveryStatusMeaning;
  readonly channelLabel = deliveryChannelLabel;
  readonly eventLabel = eventCodeLabel;

  schools: SchoolSettings[] = [];
  eventCodes: string[] = [];

  view: 'summary' | 'details' = 'summary';

  summaryRows: DeliverySummaryRow[] = [];
  summaryLoading = true;
  summaryFailed = false;
  summaryError = '';
  summaryPage = 0;
  summaryHasNext = false;
  filterSearch = '';

  /** Set when the Details view was opened from a summary row: pins it to that notification. */
  drillNotification: { id: number; title: string } | null = null;
  private detailsLoaded = false;

  filterStatus: DeliveryStatus | '' = '';
  filterChannel: DeliveryChannel | '' = '';
  filterEventCode = '';
  filterSchoolId: number | '' = '';
  filterRecipient = '';
  filterFrom = '';
  filterTo = '';

  rows: DeliveryRow[] = [];
  loading = false;
  failed = false;
  errorMessage = '';
  page = 0;
  hasNext = false;

  selected: DeliveryRow | null = null;
  detail: DeliveryDetail | null = null;
  detailLoading = false;
  detailFailed = false;

  constructor(
    private deliveryService: NotificationDeliveryService,
    private schoolService: SchoolService,
    private logger: LoggerService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.schoolService.listAllSchools().pipe(takeUntil(this.destroy$)).subscribe({
      next: schools => { this.schools = schools; this.cdr.markForCheck(); },
      error: error => this.logger.error('Schools load failed (delivery log school filter):', error),
    });
    this.deliveryService.eventCodes().pipe(takeUntil(this.destroy$)).subscribe({
      next: codes => { this.eventCodes = codes; this.cdr.markForCheck(); },
      error: error => this.logger.error('Event codes load failed (delivery log filter):', error),
    });
    this.loadSummary(0);
  }

  showSummary(): void {
    this.view = 'summary';
    this.close();
  }

  showDetails(): void {
    this.view = 'details';
    if (!this.detailsLoaded) this.load(0);
  }

  loadSummary(page: number): void {
    this.summaryLoading = true;
    this.summaryFailed = false;
    this.cdr.markForCheck();
    this.deliveryService.summary(page, this.pageSize, {
      eventCode: this.filterEventCode || null,
      schoolId: this.filterSchoolId || null,
      from: this.filterFrom || null,
      to: this.filterTo || null,
      search: this.filterSearch || null,
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: result => {
        this.summaryRows = result.content;
        this.summaryPage = result.page;
        this.summaryHasNext = result.hasNext;
        this.summaryLoading = false;
        this.cdr.markForCheck();
      },
      error: error => {
        this.logger.error('Notification delivery summary load failed:', error);
        this.summaryError = error?.status === 400 ? (error?.error?.detail || error?.error?.message || '') : '';
        this.summaryLoading = false;
        this.summaryFailed = true;
        this.cdr.markForCheck();
      },
    });
  }

  /** Opens the existing recipient-level log pinned to one notification — no separate detail UI. */
  drillDown(row: DeliverySummaryRow): void {
    this.drillNotification = { id: row.notificationId, title: row.title };
    this.filterStatus = '';
    this.filterChannel = '';
    this.filterRecipient = '';
    this.view = 'details';
    this.load(0);
  }

  clearDrillDown(): void {
    this.drillNotification = null;
    this.load(0);
  }

  prevSummaryPage(): void { if (this.summaryPage > 0) this.loadSummary(this.summaryPage - 1); }
  nextSummaryPage(): void { if (this.summaryHasNext) this.loadSummary(this.summaryPage + 1); }

  load(page: number): void {
    this.detailsLoaded = true;
    this.loading = true;
    this.failed = false;
    this.cdr.markForCheck();
    this.deliveryService.search(page, this.pageSize, {
      notificationId: this.drillNotification?.id ?? null,
      status: this.filterStatus || null,
      channel: this.filterChannel || null,
      eventCode: this.filterEventCode || null,
      schoolId: this.filterSchoolId || null,
      recipient: this.filterRecipient || null,
      from: this.filterFrom || null,
      to: this.filterTo || null,
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: result => {
        this.rows = result.content;
        this.page = result.page;
        this.hasNext = result.hasNext;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: error => {
        this.logger.error('Notification delivery log load failed:', error);
        this.errorMessage = error?.status === 400 ? (error?.error?.detail || error?.error?.message || '') : '';
        this.loading = false;
        this.failed = true;
        this.cdr.markForCheck();
      },
    });
  }

  applyFilters(): void {
    if (this.view === 'summary') this.loadSummary(0);
    else this.load(0);
  }

  resetFilters(): void {
    this.filterStatus = '';
    this.filterChannel = '';
    this.filterEventCode = '';
    this.filterSchoolId = '';
    this.filterRecipient = '';
    this.filterFrom = '';
    this.filterTo = '';
    this.filterSearch = '';
    this.drillNotification = null;
    this.applyFilters();
  }

  prevPage(): void { if (this.page > 0) this.load(this.page - 1); }
  nextPage(): void { if (this.hasNext) this.load(this.page + 1); }

  open(row: DeliveryRow): void {
    this.selected = row;
    this.detail = null;
    this.detailLoading = true;
    this.detailFailed = false;
    this.cdr.markForCheck();
    this.deliveryService.detail(row.channel, row.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: detail => { this.detail = detail; this.detailLoading = false; this.cdr.markForCheck(); },
      error: error => {
        this.logger.error('Notification delivery detail load failed:', error);
        this.detailLoading = false;
        this.detailFailed = true;
        this.cdr.markForCheck();
      },
    });
  }

  close(): void {
    this.selected = null;
    this.detail = null;
  }

  statusClass(status: DeliveryStatus): string { return 'ndl-status--' + status.toLowerCase(); }

  /** Share of a channel's rows in one outcome, for the stacked bar (0–100). */
  pct(part: number, total: number): number { return total > 0 ? (part / total) * 100 : 0; }

  summaryKey(_: number, row: DeliverySummaryRow): number { return row.notificationId; }

  rowKey(_: number, row: DeliveryRow): string { return row.channel + ':' + row.id; }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
