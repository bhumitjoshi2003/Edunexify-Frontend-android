import { PageHeaderComponent } from '../ui/page-header/page-header.component';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, OnDestroy } from '@angular/core';
import { LoggerService } from '../../services/logger.service';
import { PaymentHistoryService, PaginatedResponse } from '../../services/payment-history.service';
import { SchoolService } from '../../services/school.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, debounceTime, distinctUntilChanged } from 'rxjs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatIconModule } from '@angular/material/icon';
import { ToastService } from '../../services/toast.service';
import { AuthStateService } from '../../auth/auth-state.service';
import { Capacitor } from '@capacitor/core';
import { PaymentHistory } from '../../interfaces/payment-history';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { saveAs } from 'file-saver';
import { MODULE_MESSAGES } from '../../config/module-messages.config';
import { ComingSoonComponent } from '../coming-soon/coming-soon.component';

@Component({
  selector: 'app-payment-history-admin',
  templateUrl: './payment-history-admin.component.html',
  styleUrls: ['./payment-history-admin.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, 
    ComingSoonComponent,
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatIconModule,
    DatePipe
  ],
  providers: [DatePipe]
})
export class PaymentHistoryAdminComponent implements OnInit, OnDestroy {

  comingSoonConfig = MODULE_MESSAGES.paymentHistory;
  showFeesModule: boolean = true;
  filteredPayments: PaymentHistory[] = [];
  classList: string[] = [];
  selectedClass: string = 'all';
  selectedDate: Date | null = null;
  loading: boolean = true;
  error: string = '';

  studentIdFilter: string = '';
  private ngUnsubscribe = new Subject<void>();
  private studentIdInputSubject = new Subject<string>();

  currentPage: number = 0;
  pageSize: number = 10;
  totalElements: number = 0;
  totalPages: number = 0;
  pageSizes: number[] = [5, 10, 20, 50];

  constructor(private router: Router, private paymentHistoryService: PaymentHistoryService, private datePipe: DatePipe, private logger: LoggerService, private cdr: ChangeDetectorRef, private toast: ToastService, private schoolService: SchoolService, private authStateService: AuthStateService) { }

  ngOnInit(): void {
    const role = this.authStateService.getUserRole();
    if (role !== 'ADMIN') {
      this.router.navigate(['/dashboard']);
      return;
    }
    this.schoolService.getClasses().pipe(takeUntil(this.ngUnsubscribe)).subscribe(classes => {
      this.classList = classes;
      this.cdr.markForCheck();
    });
    this.fetchPaymentHistory();

    this.studentIdInputSubject.pipe(
      debounceTime(800),
      distinctUntilChanged(),
      takeUntil(this.ngUnsubscribe)
    ).subscribe(() => {
      this.currentPage = 0;
      this.fetchPaymentHistory();
    });
  }

  ngOnDestroy(): void {
    this.ngUnsubscribe.next();
    this.ngUnsubscribe.complete();
    this.studentIdInputSubject.complete();
  }

  fetchPaymentHistory(): void {
    this.loading = true;
    this.error = '';

    const classFilterToSend = this.selectedClass === 'all' ? undefined : this.selectedClass;
    const studentIdToFilter = this.studentIdFilter.trim() === '' ? undefined : this.studentIdFilter.trim();
    const formattedDate: string | undefined = this.selectedDate ? this.datePipe.transform(this.selectedDate, 'yyyy-MM-dd') || undefined : undefined;

    this.paymentHistoryService.getFilteredPaymentHistory(
      classFilterToSend,
      studentIdToFilter,
      formattedDate,
      this.currentPage,
      this.pageSize
    ).pipe(
      takeUntil(this.ngUnsubscribe)
    ).subscribe({
      next: (response: PaginatedResponse<PaymentHistory>) => {
        this.filteredPayments = response.content;
        this.totalElements = response.totalElements;
        this.totalPages = response.totalPages;
        this.currentPage = response.number;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.logger.error('Error loading payment history:', error);
        this.error = 'Failed to load payment history.';
        this.loading = false;
        this.filteredPayments = [];
        this.totalElements = 0;
        this.totalPages = 0;
        this.cdr.markForCheck();
        this.toast.error('Error!', 'Failed to load payment history.');
      }
    });
  }

  onClassSelect(className: string): void {
    this.selectedClass = className;
    this.currentPage = 0;
    this.fetchPaymentHistory();
  }

  onDateSelect(): void {
    this.currentPage = 0;
    this.fetchPaymentHistory();
  }

  onStudentIdInput(): void {
    this.studentIdInputSubject.next(this.studentIdFilter);
  }

  clearFilter(): void {
    this.selectedDate = null;
    this.studentIdFilter = '';
    // this.selectedClass = 'all';
    this.currentPage = 0;
    this.fetchPaymentHistory();
  }

  viewPaymentDetails(paymentId: string): void {
    this.router.navigate(['dashboard/payment-history-details', paymentId]);
  }

  downloadPaymentReceipt(paymentId: string, event: Event): void {
    event.stopPropagation();
    if (Capacitor.isNativePlatform()) {
      this.toast.info('Not Available', 'Downloading receipts is not supported on the mobile app. Please use the web version.');
      return;
    }
    this.loading = true;
    this.error = '';
    this.paymentHistoryService.downloadPaymentReceipt(paymentId).subscribe({
      next: (data: Blob) => {
        let filename = `receipt_${paymentId}.pdf`;
        saveAs(data, filename);
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.error = 'Failed to download payment receipt.';
        this.logger.error('Error downloading payment receipt:', err);
        this.loading = false;
        this.cdr.markForCheck();
        this.toast.error('Error!', 'Failed to download payment receipt.');
      },
    });
  }

  goToPage(page: number): void {
    if (page >= 0 && page < this.totalPages) {
      this.currentPage = page;
      this.fetchPaymentHistory();
    }
  }

  nextPage(): void {
    this.goToPage(this.currentPage + 1);
  }

  prevPage(): void {
    this.goToPage(this.currentPage - 1);
  }

  onPageSizeChange(newPageSize: number): void {
    this.pageSize = newPageSize;
    this.currentPage = 0;
    this.fetchPaymentHistory();
  }

  trackByPaymentId(index: number, payment: PaymentHistory): string { return payment.paymentId; }
  trackByClass(index: number, className: string): string { return className; }
  trackByIndex(index: number): number { return index; }

  getPaginationDisplayPages(): (number | string)[] {
    const pages: (number | string)[] = [];
    const total = this.totalPages;
    const current = this.currentPage;
    const maxVisiblePages = 3;
    if (total <= 1) {
      return [];
    }

    let start = Math.max(0, current - Math.floor(maxVisiblePages / 2));
    let end = start + maxVisiblePages - 1;

    if (end >= total) {
      end = total - 1;
      start = Math.max(0, end - maxVisiblePages + 1);
    }

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    if (!pages.includes(0)) {
      if (pages[0] !== 1) {
        pages.unshift('...');
      }
      pages.unshift(0);
    }

    if (!pages.includes(total - 1)) {
      if (pages[pages.length - 1] !== total - 2) {
        pages.push('...');
      }
      pages.push(total - 1);
    }

    const cleanedPages: (number | string)[] = [];
    let lastAddedItem: number | string | null = null;
    for (const item of pages) {
      if (typeof item === 'number') {
        if (item !== lastAddedItem) {
          cleanedPages.push(item);
          lastAddedItem = item;
        }
      } else {
        if (lastAddedItem !== '...') {
          cleanedPages.push(item);
          lastAddedItem = item;
        }
      }
    }
    return cleanedPages;
  }
}