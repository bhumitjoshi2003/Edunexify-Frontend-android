import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, OnDestroy } from '@angular/core';
import { LoggerService } from '../../services/logger.service';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { PaymentHistory } from '../../interfaces/payment-history';
import { PaginatedResponse, PaymentHistoryService } from '../../services/payment-history.service'; // Import PaginatedResponse
import { AuthStateService } from '../../auth/auth-state.service';
import { saveAs } from 'file-saver';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatIconModule } from '@angular/material/icon';
import { ComingSoonComponent } from '../coming-soon/coming-soon.component';
import { MODULE_MESSAGES } from '../../config/module-messages.config';
import { Subject, takeUntil } from 'rxjs';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { ToastService } from '../../services/toast.service';
import { ParentChildContextComponent } from '../parent-child-context/parent-child-context.component';
import { ChildAccess } from '../../interfaces/parent-portal';

@Component({
  selector: 'app-payment-history',
  templateUrl: './payment-history.component.html',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ComingSoonComponent,
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatIconModule,
    ParentChildContextComponent
  ],
  styleUrls: ['./payment-history.component.css'],
})
export class PaymentHistoryComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  /** Latest history request wins — a page change or a parent switching child cancels the previous one. */
  private readonly historyRequest$ = new Subject<void>();

  comingSoonConfig = MODULE_MESSAGES.paymentHistory;
  showFeesModule: boolean = true;
  paymentHistory: PaymentHistory[] = [];
  loading: boolean = true;
  error: string = '';
  role: string = '';
  studentId: string = '';

  currentPage: number = 0;
  pageSize: number = 10;
  totalPages: number = 0;
  totalElements: number = 0;

  constructor(
    private http: HttpClient,
    private route: ActivatedRoute,
    private router: Router,
    private paymentHistoryService: PaymentHistoryService,
    private authStateService: AuthStateService,
    private logger: LoggerService,
    private cdr: ChangeDetectorRef,
    private toast: ToastService
  ) { }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  ngOnInit(): void {
    const user = this.authStateService.getUser();
    if (user) {
      this.role = user.role;

      if (this.role === 'STUDENT') {
        this.studentId = user.userId;
        this.fetchPaymentHistory();
      } else {
        this.route.params.pipe(takeUntil(this.destroy$)).subscribe((params) => {
          const routeStudentId = params['studentId'];
          if (routeStudentId) {
            this.studentId = routeStudentId;
            this.fetchPaymentHistory();
          } else {
            this.error = 'Student ID not provided to view payment history.';
            this.loading = false;
          }
        });
      }
    } else {
      this.error = 'Authentication token not found. Please log in.';
      this.loading = false;
      this.router.navigate(['/login']);
    }
  }

  fetchPaymentHistory(): void {
    if (!this.studentId) {
      this.error = 'Student ID is required to fetch payment history.';
      this.loading = false;
      return;
    }

    this.historyRequest$.next();
    this.loading = true;
    this.error = '';

    this.paymentHistoryService.getPaymentHistoryForStudent(
      this.studentId,
      this.currentPage,
      this.pageSize
    ).pipe(takeUntil(this.destroy$), takeUntil(this.historyRequest$)).subscribe({
      next: (response: PaginatedResponse<PaymentHistory>) => {
        this.paymentHistory = response.content;
        this.totalElements = response.totalElements;
        this.totalPages = response.totalPages;
        this.currentPage = response.number;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.error = 'Failed to fetch payment history. Please try again.';
        this.logger.error('Error fetching payment history:', err);
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  goToPage(page: number): void {
    if (page >= 0 && page < this.totalPages && page !== this.currentPage) {
      this.currentPage = page;
      this.fetchPaymentHistory();
    }
  }

  onChildTabSelected(child: ChildAccess): void {
    if (!child.canViewFees) {
      this.error = "You do not have permission to view this child's payment history.";
      this.cdr.markForCheck();
      return;
    }
    this.studentId = child.studentId;
    this.currentPage = 0;
    this.router.navigate(['/dashboard/payment-history', child.studentId], { replaceUrl: true });
    this.fetchPaymentHistory();
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages - 1) {
      this.currentPage++;
      this.fetchPaymentHistory();
    }
  }

  previousPage(): void {
    if (this.currentPage > 0) {
      this.currentPage--;
      this.fetchPaymentHistory();
    }
  }

  viewPaymentDetails(paymentId: string): void {
    this.router.navigate(['dashboard/payment-history-details', paymentId]);
  }

  trackByPaymentId(index: number, payment: PaymentHistory): string { return payment.paymentId; }

  downloadPaymentReceipt(paymentId: string): void {
    this.loading = true;
    this.error = '';
    this.paymentHistoryService.downloadPaymentReceipt(paymentId).pipe(takeUntil(this.destroy$)).subscribe({
      next: async (data: Blob) => {
        const filename = `receipt_${paymentId}.pdf`;
        try {
          if (Capacitor.isNativePlatform()) {
            // Android: write to cache dir then share so the native PDF viewer opens it
            const base64 = await this.blobToBase64(data);
            await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Cache });
            const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Cache });
            await Share.share({ title: 'Fee Receipt', files: [uri], dialogTitle: 'Open or share your receipt' });
          } else {
            saveAs(data, filename);
          }
        } catch (e: any) {
          if (e?.message !== 'Share canceled') {
            this.error = 'Failed to download payment receipt.';
            this.logger.error('Error sharing payment receipt:', e);
          }
        } finally {
          this.loading = false;
          this.cdr.markForCheck();
        }
      },
      error: (err) => {
        this.error = 'Failed to download payment receipt.';
        this.logger.error('Error downloading payment receipt:', err);
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}