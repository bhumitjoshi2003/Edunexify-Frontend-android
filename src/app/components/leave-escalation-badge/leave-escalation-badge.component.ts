import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import {
  AUTO_APPROVED_LABEL, AUTO_APPROVED_NOTE, EscalatableLeave, OVERDUE_BADGE,
  isLeaveAutoApproved, isLeaveNeedsAttention, isLeaveOverdue, overdueDetail,
} from '../../utils/leave-escalation.util';

/**
 * Overdue badge for a pending leave from day 3, or the automatic-approval indicator for a leave the
 * seven-day deadline approved. Renders nothing otherwise. Shared by web and Android.
 */
@Component({
  selector: 'app-leave-escalation-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (leave?.status === 'PENDING' && leave?.urgent) {
      <span class="leb leb-urgent" role="status">
        <span class="leb-pill">Urgent · Action Required</span>
        <span class="leb-note">{{ detail }}</span>
      </span>
    } @else if (overdue) {
      <span class="leb leb-overdue" role="status">
        <span class="leb-pill"><span class="leb-dot" aria-hidden="true"></span>{{ overdueLabel }}</span>
        <span class="leb-note">{{ detail }}</span>
      </span>
    } @else if (needsAttention) {
      <span class="leb leb-overdue" role="status"><span class="leb-pill">Needs Attention</span></span>
    } @else if (autoApproved) {
      <span class="leb leb-auto">
        <span class="leb-pill">{{ autoLabel }}</span>
        <span class="leb-note">{{ autoNote }}</span>
      </span>
    }
  `,
  styles: [`
    :host { display: contents; }
    .leb { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; min-width: 0; }
    .leb-pill {
      display: inline-flex; align-items: center; gap: 6px; padding: 2px 8px; border-radius: 999px;
      font-size: 11px; font-weight: 600; line-height: 18px; white-space: nowrap;
    }
    .leb-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
    .leb-note { font-size: 12px; line-height: 16px; color: #667085; }
    .leb-overdue .leb-pill { color: #b42318; background: #fef3f2; border: 1px solid #fecdca; }
    .leb-urgent .leb-pill { color: #b42318; background: #fff1f3; border: 1px solid #fda4af; }
    .leb-auto .leb-pill { color: #175cd3; background: #eff8ff; border: 1px solid #b2ddff; }
  `],
})
export class LeaveEscalationBadgeComponent {
  @Input({ required: true }) leave!: EscalatableLeave;

  readonly overdueLabel = OVERDUE_BADGE;
  readonly autoLabel = AUTO_APPROVED_LABEL;
  readonly autoNote = AUTO_APPROVED_NOTE;

  get overdue(): boolean { return isLeaveOverdue(this.leave); }
  get needsAttention(): boolean { return isLeaveNeedsAttention(this.leave); }
  get autoApproved(): boolean { return isLeaveAutoApproved(this.leave); }
  get detail(): string { return overdueDetail(this.leave); }
}
