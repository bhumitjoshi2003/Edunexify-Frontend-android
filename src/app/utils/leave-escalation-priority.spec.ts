import { overdueDetail } from './leave-escalation.util';

describe('leave escalation future date wording', () => {
  const future = (day: number) => ({
    status: 'PENDING',
    urgent: true,
    escalation: { day, overdue: false, automatic: true, autoApprovalDate: '2026-11-20' },
  });

  it('describes tomorrow and future dates without negative or zero day labels', () => {
    expect(overdueDetail(future(0))).toContain('Leave starts tomorrow');
    expect(overdueDetail(future(-6))).toContain('Leave starts in 7 days');
    expect(overdueDetail(future(1))).toContain('Leave starts today');
  });

  it('preserves the retrospective approval date', () => {
    expect(overdueDetail(future(0))).toContain('Auto-approves 20 Nov');
  });
});
