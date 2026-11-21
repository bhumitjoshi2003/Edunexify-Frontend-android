import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { StaffAdoptionService } from '../../services/staff-adoption.service';
import { ToastService } from '../../services/toast.service';
import { StaffAdoptionResponse, StaffAdoptionTeacherRow } from '../../interfaces/staff-adoption';
import { StaffAdoptionReminderType } from '../../interfaces/staff-adoption-reminder';
import {
  StaffAdoptionQuery, accountStatusLabel, adoptionRatePercent, appVersionLabel, filterStaffAdoption,
  notStartedForSummary, relativeActivityLabel, reminderConfirmDialog, reminderSendResult,
} from '../../utils/staff-adoption.util';

/** One select on the phone; each choice maps onto the shared filter query (see utils/staff-adoption.util.ts). */
type AdoptionFilter = 'ALL' | 'STARTED' | 'NOT_STARTED' | 'USED' | 'NOT_USED' | 'LAST_7_DAYS' | 'OLDER' | 'NEVER';

interface ReminderOption { type: StaffAdoptionReminderType; label: string; description: string; }
const REMINDER_OPTIONS: ReminderOption[] = [
  { type: 'NOT_STARTED', label: 'Not started', description: 'Nudge teachers who have not yet signed in.' },
  { type: 'OUTDATED_APP', label: 'Outdated app', description: 'Ask teachers to update the Edunexify app.' },
  { type: 'ONBOARDING_INCOMPLETE', label: 'Onboarding incomplete', description: 'Remind teachers to finish Getting Started.' },
];

@Component({ selector: 'app-staff-adoption', standalone: true, imports: [CommonModule, FormsModule, MatIconModule, RouterLink], templateUrl: './staff-adoption.component.html', styleUrl: './staff-adoption.component.css', changeDetection: ChangeDetectionStrategy.OnPush })
export class StaffAdoptionComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>(); loading = true; error = false; data: StaffAdoptionResponse | null = null;
  searchTerm = ''; filter: AdoptionFilter = 'ALL';

  readonly reminderOptions = REMINDER_OPTIONS;
  reminderPanelOpen = false;
  selectedReminderType: StaffAdoptionReminderType = 'NOT_STARTED';
  reminderPreviewLoading = false;
  reminderSendLoading = false;
  reminderError: string | null = null;

  constructor(private service: StaffAdoptionService, private toast: ToastService, private cdr: ChangeDetectorRef) {}
  ngOnInit(): void { this.load(); }
  load(): void { this.loading = true; this.error = false; this.service.getStaffAdoption().pipe(takeUntil(this.destroy$)).subscribe({ next: data => { this.data = data; this.loading = false; this.cdr.markForCheck(); }, error: () => { this.loading = false; this.error = true; this.cdr.markForCheck(); } }); }
  get rows(): StaffAdoptionTeacherRow[] { return filterStaffAdoption(this.data?.teachers ?? [], this.query, new Date()); }
  private get query(): StaffAdoptionQuery {
    const f = this.filter;
    return {
      search: this.searchTerm,
      account: f === 'STARTED' || f === 'NOT_STARTED' ? f : 'ALL',
      attendance: f === 'USED' || f === 'NOT_USED' ? f : 'ALL',
      activity: f === 'LAST_7_DAYS' || f === 'OLDER' || f === 'NEVER' ? f : 'ALL',
    };
  }
  get adoptionRate(): number { return adoptionRatePercent(this.data); }
  get notStartedCount(): number { return notStartedForSummary(this.data); }
  status(t: StaffAdoptionTeacherRow): string { return accountStatusLabel(t.accountStatus); }
  relative(value: string | null): string { return relativeActivityLabel(value, new Date()); }
  app(t: StaffAdoptionTeacherRow): string { return appVersionLabel(t); }

  // ── Reminders (admin-triggered, never automatic) ────────────────

  toggleReminderPanel(): void { this.reminderPanelOpen = !this.reminderPanelOpen; this.reminderError = null; this.cdr.markForCheck(); }

  /** Preview → confirm → send. The backend re-resolves recipients itself from `type` alone;
   *  this only ever asks it to preview, then to send — it never submits a recipient list. */
  previewAndSendReminder(): void {
    if (this.reminderPreviewLoading || this.reminderSendLoading) return;
    const type = this.selectedReminderType;
    this.reminderPreviewLoading = true; this.reminderError = null; this.cdr.markForCheck();
    this.service.previewReminder(type).pipe(takeUntil(this.destroy$)).subscribe({
      next: preview => {
        this.reminderPreviewLoading = false; this.cdr.markForCheck();
        if (preview.count === 0) { this.toast.info('No recipients', 'No teachers currently match this reminder.'); return; }
        this.confirmAndSend(type, preview.count, preview.teachers.map(t => t.name));
      },
      error: () => { this.reminderPreviewLoading = false; this.reminderError = 'Could not load recipients. Please try again.'; this.cdr.markForCheck(); }
    });
  }

  private confirmAndSend(type: StaffAdoptionReminderType, count: number, names: string[]): void {
    // Plain text: teacher names are never rendered as HTML.
    this.toast.confirm(reminderConfirmDialog(count, names)).then(confirmed => { if (confirmed) this.sendReminder(type); });
  }

  private sendReminder(type: StaffAdoptionReminderType): void {
    this.reminderSendLoading = true; this.cdr.markForCheck();
    this.service.sendReminder(type).pipe(takeUntil(this.destroy$)).subscribe({
      next: result => {
        this.reminderSendLoading = false; this.reminderPanelOpen = false; this.cdr.markForCheck();
        this.toastForSendResult(result.sentCount, result.skippedRecentCount);
      },
      error: () => {
        this.reminderSendLoading = false; this.reminderError = 'Could not send the reminder. Please try again.'; this.cdr.markForCheck();
        this.toast.error('Error', 'Failed to send reminder. Please try again.');
      }
    });
  }

  /** Truthful wording: "sent" means accepted for delivery, never a claim it was received. */
  private toastForSendResult(sentCount: number, skippedRecentCount: number): void {
    const result = reminderSendResult(sentCount, skippedRecentCount);
    this.toast[result.level](result.title, result.message);
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }
}
