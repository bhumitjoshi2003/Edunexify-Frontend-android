import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { FeeReminderService } from '../../services/fee-reminder.service';
import { LoggerService } from '../../services/logger.service';
import { BulkReminderResult, OverdueStudent, ReminderOutcome } from '../../interfaces/fee-reminder';
import { ComingSoonComponent } from '../coming-soon/coming-soon.component';
import { MODULE_MESSAGES } from '../../config/module-messages.config';
import { ToastService } from '../../services/toast.service';
import { Capacitor } from '@capacitor/core';
import { SchoolService } from '../../services/school.service';
import { AcademicSessionService } from '../../services/academic-session.service';
import { InrPipe } from '../../pipes/inr.pipe';

@Component({
  selector: 'app-fee-reminders',
  standalone: true,
  imports: [CommonModule, FormsModule, ComingSoonComponent, InrPipe],
  templateUrl: './fee-reminders.component.html',
  styleUrl: './fee-reminders.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FeeRemindersComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  classList: string[] = [];

  comingSoonConfig = MODULE_MESSAGES.feesReminder;
  showFeesReminderModule: boolean = true;
  sessions: string[] = [];
  selectedSession = '';
  selectedClass = '';
  minDaysOverdue = 0;      // 0 = all, 30 = 30+ days, 60 = 60+ days
  minUnpaidMonths = 0;     // 0 = all, 1 = 1+, 2 = 2+, 3 = 3+, 6 = 6+

  allStudents: OverdueStudent[] = [];
  isLoading = false;
  error: string | null = null;

  /** studentIds for which reminder was sent this session */
  reminderSent = new Set<string>();
  sendingId: string | null = null;   // single reminder in-flight
  sendingBulk = false;

  /**
   * Issue #46: Per-student reminder state tracking.
   * 'idle' | 'sending' | ReminderOutcome ('sent' | 'skipped_not_active' | 'skipped_no_email' | 'failed')
   * Reflects the backend's actual per-student outcome — a skipped/failed send is never shown
   * as sent.
   */
  reminderStates: Map<string, 'idle' | 'sending' | ReminderOutcome> = new Map();

  // ── Pagination ───────────────────────────────────────────────────
  currentPage = 0;
  pageSize = 10;
  readonly pageSizes = [5, 10, 20, 50];

  constructor(
    private feeReminderService: FeeReminderService,
    private logger: LoggerService,
    private cdr: ChangeDetectorRef,
    private toast: ToastService,
    private schoolService: SchoolService,
    private academicSessionService: AcademicSessionService
  ) { }

  ngOnInit(): void {
    this.schoolService.getClasses().pipe(takeUntil(this.destroy$)).subscribe({
      next: classes => { this.classList = classes; this.cdr.markForCheck(); },
      error: () => { }
    });

    this.academicSessionService.getAllSessions().pipe(takeUntil(this.destroy$)).subscribe({
      next: sessions => {
        this.sessions = sessions.map(s => s.label);
        const current = sessions.find(s => s.current);
        this.selectedSession = current ? current.label : (this.sessions[0] ?? '');
        this.cdr.markForCheck();
        this.loadOverdue();
      },
      error: (e) => {
        this.logger.error('Failed to load sessions', e);
        this.loadOverdue();
        this.cdr.markForCheck();
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Filtered view ────────────────────────────────────────────────

  get filteredStudents(): OverdueStudent[] {
    return this.allStudents.filter(s => {
      if (this.selectedClass && s.className !== this.selectedClass) return false;
      if (this.minDaysOverdue && s.daysOverdue < this.minDaysOverdue) return false;
      if (this.minUnpaidMonths && s.unpaidMonths.length < this.minUnpaidMonths) return false;
      return true;
    });
  }

  get pagedStudents(): OverdueStudent[] {
    const start = this.currentPage * this.pageSize;
    return this.filteredStudents.slice(start, start + this.pageSize);
  }

  get totalPages(): number {
    return Math.ceil(this.filteredStudents.length / this.pageSize);
  }

  /** Sum of known amounts only — students with an unconfigured fee structure (totalDue
   * null) are excluded rather than silently treated as ₹0. See amountUnknownCount. */
  get totalDue(): number {
    return this.filteredStudents.reduce((sum, s) => sum + (s.totalDue ?? 0), 0);
  }

  get amountUnknownCount(): number {
    return this.filteredStudents.filter(s => s.totalDue === null).length;
  }

  /** Every listed student's amount is unknown: there is no known subtotal to show (never ₹0). */
  get allAmountsUnknown(): boolean {
    return this.filteredStudents.length > 0 && this.amountUnknownCount === this.filteredStudents.length;
  }

  get criticalCount(): number {
    return this.filteredStudents.filter(s => s.daysOverdue >= 60).length;
  }

  get warningCount(): number {
    return this.filteredStudents.filter(s => s.daysOverdue >= 30 && s.daysOverdue < 60).length;
  }

  get defaulterCount(): number {
    return this.filteredStudents.filter(s => s.unpaidMonths.length >= 3).length;
  }

  // ── Pagination helpers ───────────────────────────────────────────

  onFilterChange(): void {
    this.currentPage = 0;
    this.cdr.markForCheck();
  }

  goToPage(page: number): void {
    if (page >= 0 && page < this.totalPages) {
      this.currentPage = page;
      this.cdr.markForCheck();
    }
  }

  nextPage(): void { this.goToPage(this.currentPage + 1); }
  prevPage(): void { this.goToPage(this.currentPage - 1); }

  onPageSizeChange(size: number): void {
    this.pageSize = +size;
    this.currentPage = 0;
    this.cdr.markForCheck();
  }

  // ── Load ─────────────────────────────────────────────────────────

  loadOverdue(): void {
    this.isLoading = true;
    this.error = null;
    this.allStudents = [];
    this.currentPage = 0;
    this.reminderSent.clear();
    this.cdr.markForCheck();

    this.feeReminderService.getOverdueStudents(this.selectedSession)
      .pipe(takeUntil(this.destroy$)).subscribe({
        next: (data) => {
          // Sort: most overdue first
          this.allStudents = data.sort((a, b) => b.daysOverdue - a.daysOverdue);
          this.isLoading = false;
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.logger.error('Failed to load overdue students:', err);
          this.error = 'Failed to load overdue fees. Please try again.';
          this.isLoading = false;
          this.cdr.markForCheck();
        }
      });
  }

  // ── Status helpers ───────────────────────────────────────────────

  getRowClass(s: OverdueStudent): string {
    if (s.daysOverdue >= 60) return 'row-critical';
    if (s.daysOverdue >= 30) return 'row-warning';
    return 'row-mild';
  }

  getBadgeClass(s: OverdueStudent): string {
    if (s.daysOverdue >= 60) return 'badge-critical';
    if (s.daysOverdue >= 30) return 'badge-warning';
    return 'badge-mild';
  }

  // ── Send reminder ────────────────────────────────────────────────

  sendReminder(student: OverdueStudent): void {
    if (this.sendingId || this.reminderSent.has(student.studentId)) return;

    this.sendingId = student.studentId;
    this.reminderStates.set(student.studentId, 'sending');
    this.cdr.markForCheck();

    this.feeReminderService.sendReminder(student.studentId, this.selectedSession)
      .pipe(takeUntil(this.destroy$)).subscribe({
        next: (res) => {
          this.reminderStates.set(student.studentId, res.status);
          if (res.status === 'sent') this.reminderSent.add(student.studentId);
          this.sendingId = null;
          this.cdr.markForCheck();
          this.toastForOutcome(res.status, res.message);
        },
        error: (err) => {
          this.logger.error('Failed to send reminder:', err);
          this.reminderStates.set(student.studentId, 'failed');
          this.sendingId = null;
          this.cdr.markForCheck();
          this.toast.error('Error', 'Failed to send reminder. Please try again.');
        }
      });
  }

  /** Maps one backend ReminderOutcome to the toast the admin actually needs to see —
   * "sent" means it genuinely went out; the others explain exactly why it did not. */
  private toastForOutcome(status: ReminderOutcome, message: string): void {
    switch (status) {
      case 'sent':
        this.toast.success('Reminder sent!', message);
        break;
      case 'skipped_not_active':
        this.toast.warning('Reminder skipped', 'Reminder skipped because the student is no longer active.');
        break;
      case 'skipped_no_email':
        this.toast.warning('Reminder skipped', 'Reminder skipped because no email address is available.');
        break;
      case 'failed':
        this.toast.error('Reminder failed', message || 'The reminder could not be sent.');
        break;
    }
  }

  sendAllReminders(): void {
    const unsent = this.filteredStudents.filter(s => !this.reminderSent.has(s.studentId));
    if (unsent.length === 0) {
      this.toast.info('All done', 'Reminders already sent to all students shown.');
      return;
    }

    this.toast.confirm({
      title: `Send reminders to ${unsent.length} student${unsent.length > 1 ? 's' : ''}?`,
      message: 'A fee reminder will be sent to each parent.',
      icon: 'question',
      confirmText: 'Yes, send all',
      cancelText: 'Cancel',
    }).then(confirmed => {
      if (!confirmed) return;

      this.sendingBulk = true;
      this.cdr.markForCheck();

      const ids = unsent.map(s => s.studentId);
      ids.forEach(id => this.reminderStates.set(id, 'sending'));
      this.feeReminderService.sendBulkReminders(ids, this.selectedSession)
        .pipe(takeUntil(this.destroy$)).subscribe({
          next: (res: BulkReminderResult) => {
            this.applyBulkOutcome(ids, res);
            this.sendingBulk = false;
            this.cdr.markForCheck();
          },
          error: (err) => {
            this.logger.error('Failed to send bulk reminders:', err);
            ids.forEach(id => this.reminderStates.set(id, 'failed'));
            this.sendingBulk = false;
            this.cdr.markForCheck();
            this.toast.error('Error', 'Failed to send reminders. Please try again.');
          }
        });
    });
  }

  /** Every id in `ids` is accounted for by the backend as either sent (absent from
   * res.skipped) or present in res.skipped with a reason — "error" (a genuine per-student
   * failure) is shown as failed, any other reason (skipped_not_active/skipped_no_email) is
   * shown as skipped. Summarizes all three counts in a single toast. */
  private applyBulkOutcome(ids: string[], res: BulkReminderResult): void {
    const skippedByStudent = new Map(res.skipped.map(s => [s.studentId, s.reason]));
    let sentCount = 0, skippedCount = 0, failedCount = 0;

    ids.forEach(id => {
      const reason = skippedByStudent.get(id);
      if (!reason) {
        this.reminderStates.set(id, 'sent');
        this.reminderSent.add(id);
        sentCount++;
      } else if (reason === 'error') {
        this.reminderStates.set(id, 'failed');
        failedCount++;
      } else {
        this.reminderStates.set(id, reason as ReminderOutcome);
        skippedCount++;
      }
    });

    const parts = [`${sentCount} sent`];
    if (skippedCount > 0) parts.push(`${skippedCount} skipped`);
    if (failedCount > 0) parts.push(`${failedCount} failed`);
    const summary = parts.join(', ') + '.';

    if (failedCount > 0) {
      this.toast.error('Reminders processed', summary);
    } else if (skippedCount > 0) {
      this.toast.warning('Reminders processed', summary);
    } else {
      this.toast.success('Reminders sent!', summary);
    }
  }

  printReport(): void {
    if (Capacitor.isNativePlatform()) {
      this.toast.info('Not Available', 'Printing is not supported on the mobile app. Please use the web version.');
      return;
    }
    window.print();
  }

  trackById(_: number, s: OverdueStudent): string { return s.studentId; }
  trackByIndex(i: number): number { return i; }
}
