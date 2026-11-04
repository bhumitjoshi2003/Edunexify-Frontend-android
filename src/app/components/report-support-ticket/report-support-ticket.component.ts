import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { SUPPORT_TICKET_CATEGORIES, SupportTicketCategory } from '../../interfaces/support-ticket';
import { SupportTicketService } from '../../services/support-ticket.service';
import { ToastService } from '../../services/toast.service';
import { LoggerService } from '../../services/logger.service';
import { AndroidPlatformService } from '../../services/android-platform.service';

@Component({
  selector: 'app-report-support-ticket',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, RouterLink],
  templateUrl: './report-support-ticket.component.html',
  styleUrl: './report-support-ticket.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportSupportTicketComponent implements OnInit {
  readonly categories = SUPPORT_TICKET_CATEGORIES;

  category: SupportTicketCategory | '' = '';
  title = '';
  description = '';
  selectedFiles: File[] = [];
  imagePreviewUrls: (string | ArrayBuffer | null)[] = [];
  submitting = false;
  appVersion: string | null = null;

  constructor(
    private supportTicketService: SupportTicketService,
    private toast: ToastService,
    private router: Router,
    private logger: LoggerService,
    private cdr: ChangeDetectorRef,
    private platform: AndroidPlatformService,
  ) {}

  ngOnInit(): void {
    if (!this.platform.isNativePlatform()) return;
    this.platform.getAppUpdateInfo()
      .then(info => { this.appVersion = info.currentVersionName ?? null; this.cdr.markForCheck(); })
      .catch(error => this.logger.error('App version capture failed:', error));
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const picked = Array.from(input.files ?? []);
    if (!picked.length) return;

    const maxSize = 5 * 1024 * 1024;
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const combined = [...this.selectedFiles, ...picked];

    if (combined.length > 5) {
      this.toast.warning('Too many screenshots', 'You can attach up to 5 screenshots.');
      input.value = '';
      return;
    }

    for (const file of picked) {
      if (file.size > maxSize) {
        this.toast.error('File too large', 'Each screenshot must be less than 5MB.');
        input.value = '';
        return;
      }
      if (!allowedTypes.includes(file.type)) {
        this.toast.error('Invalid file', 'Only JPG, PNG, or WebP images are supported.');
        input.value = '';
        return;
      }
    }

    this.selectedFiles = combined;
    picked.forEach(file => {
      const index = this.imagePreviewUrls.length;
      this.imagePreviewUrls.push(null);
      const reader = new FileReader();
      reader.onload = () => {
        this.imagePreviewUrls[index] = reader.result;
        this.cdr.markForCheck();
      };
      reader.readAsDataURL(file);
    });
    input.value = '';
    this.cdr.markForCheck();
  }

  removeScreenshot(index: number): void {
    this.selectedFiles = this.selectedFiles.filter((_, i) => i !== index);
    this.imagePreviewUrls = this.imagePreviewUrls.filter((_, i) => i !== index);
    this.cdr.markForCheck();
  }

  submit(): void {
    if (!this.category) {
      this.toast.warning('Select a category', 'Please choose what this problem is about.');
      return;
    }
    if (!this.title.trim() || !this.description.trim()) {
      this.toast.warning('Missing information', 'Please provide both a title and a description.');
      return;
    }

    this.submitting = true;
    this.cdr.markForCheck();

    if (this.selectedFiles.length) {
      forkJoin(this.selectedFiles.map(file => this.supportTicketService.uploadScreenshotDirect(file))).subscribe({
        next: uploaded => this.createTicket(uploaded.map(item => item.objectKey)),
        error: error => {
          this.logger.error('Screenshot upload failed:', error);
          this.submitting = false;
          this.toast.error('Unable to upload screenshots', this.errorMessage(error));
          this.cdr.markForCheck();
        },
      });
    } else {
      this.createTicket([]);
    }
  }

  private createTicket(screenshotObjectKeys: string[]): void {
    const route = this.router.url.split('?')[0];
    this.supportTicketService.createTicket({
      category: this.category as SupportTicketCategory,
      title: this.title.trim(),
      description: this.description.trim(),
      screenshotObjectKey: screenshotObjectKeys[0] ?? null,
      screenshotObjectKeys,
      route,
      platform: 'ANDROID',
      appVersion: this.appVersion,
    }).subscribe({
      next: ticket => {
        this.submitting = false;
        this.toast.success('Support request submitted', `Ticket ${ticket.ticketNumber} has been created.`);
        this.router.navigate(['/dashboard/my-support-requests']);
      },
      error: error => {
        this.logger.error('Support ticket creation failed:', error);
        this.submitting = false;
        this.toast.error('Unable to submit your request', this.errorMessage(error));
        this.cdr.markForCheck();
      },
    });
  }

  private errorMessage(error: any): string {
    return error?.error?.detail || error?.error?.message || (typeof error?.error === 'string' ? error.error : '')
      || 'Please try again in a moment.';
  }
}
