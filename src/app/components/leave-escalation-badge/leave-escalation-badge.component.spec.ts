import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LeaveEscalationBadgeComponent } from './leave-escalation-badge.component';
import { EscalatableLeave, attentionOverdueLabel, formatShortDate } from '../../utils/leave-escalation.util';

/** Shared by the web and Android clients — keep the two copies identical. */
describe('LeaveEscalationBadgeComponent', () => {
  let fixture: ComponentFixture<LeaveEscalationBadgeComponent>;

  /** Pill and note text, joined with " | " (empty string when nothing renders). */
  function render(leave: EscalatableLeave): string {
    TestBed.configureTestingModule({ imports: [LeaveEscalationBadgeComponent] });
    fixture = TestBed.createComponent(LeaveEscalationBadgeComponent);
    fixture.componentRef.setInput('leave', leave);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    return Array.from(root.querySelectorAll('.leb-pill, .leb-note')).map(e => e.textContent?.trim()).join(' | ');
  }

  it('shows the overdue badge with the day count and automatic approval date from day 3', () => {
    const text = render({ status: 'PENDING', escalation: { day: 3, overdue: true, autoApprovalDate: '2026-11-20', automatic: true } });
    expect(text).toBe('Overdue · Action Required | Day 3 since leave started · Auto-approves 20 Nov');
    expect(fixture.nativeElement.querySelector('.leb-overdue')).not.toBeNull();
  });

  it('omits the automatic approval date for leave outside the workflow', () => {
    const text = render({ status: 'PENDING', escalation: { day: 40, overdue: true, autoApprovalDate: null, automatic: false } });
    expect(text).toBe('Overdue · Action Required | Day 40 since leave started');
  });

  it('renders nothing before day 3', () => {
    expect(render({ status: 'PENDING', escalation: { day: 2, overdue: false, autoApprovalDate: '2026-11-20', automatic: true } })).toBe('');
  });

  it('renders nothing once a person approved, rejected or cancelled the request', () => {
    for (const status of ['APPROVED', 'REJECTED', 'CANCELLED']) {
      TestBed.resetTestingModule();
      expect(render({ status, decisionSource: null, escalation: { day: 5, overdue: true, autoApprovalDate: null, automatic: true } }))
        .withContext(status).toBe('');
    }
  });

  it('marks an automatic approval', () => {
    const text = render({ status: 'APPROVED', decisionSource: 'SYSTEM_AUTO_APPROVAL' });
    expect(text).toBe('Automatically Approved | No action was taken within the seven-day review period.');
    expect(fixture.nativeElement.querySelector('.leb-auto')).not.toBeNull();
  });

  it('formats dashboard labels and dates', () => {
    expect(attentionOverdueLabel({ pending: 4, overdue: 2, oldestDay: 6 })).toBe('2 overdue · oldest on day 6');
    expect(attentionOverdueLabel({ pending: 4, overdue: 0, oldestDay: 2 })).toBe('');
    expect(attentionOverdueLabel(null)).toBe('');
    expect(formatShortDate('2026-01-04')).toBe('4 Jan');
  });
});
