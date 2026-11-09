import { of } from 'rxjs';
import { FeeAssignmentComponent } from './fee-assignment.component';
describe('Fee Assignment school policy authority', () => {
  it('does not send a per-request school-policy override', () => {
    const c = new FeeAssignmentComponent({} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    c.session = '2026-2027'; c.selected.add('S1'); c.selectedMonths.add(1);
    c.assignForm.effectiveDate = '2026-10-16';
    const request = (c as any).request();
    expect(request.midSessionPolicy).toBeUndefined();
  });

  function withSession() {
    const c = new FeeAssignmentComponent({} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    c.session = '2026-2027';
    c.sessions = [{ id: 2, label: '2026-2027', startDate: '2026-04-01', endDate: '2027-03-31', current: true } as any];
    return c;
  }

  it('a defaulted effective date gives a neutral note; only a date the admin picked raises the warning', () => {
    const c = withSession();
    c.schoolPolicyCode = 'NEXT_MONTH';
    c.selectedMonths = new Set([7, 8, 9]);
    c.assignForm.effectiveDate = '2026-10-12';                // mid-October, the system default "today"
    expect(c.conflictMonth()).toBe(7);
    expect(c.effectiveDateChosen).toBeFalse();
    expect(c.effectiveMonthConsequence(7)).toBe('Oct 2026 will not be charged; billing starts from the following month.');

    c.onEffectiveDateChange('2026-10-20');
    expect(c.effectiveDateChosen).toBeTrue();
    expect(c.assignForm.effectiveDate).toBe('2026-10-20');
  });

  it('explains each school policy\'s effect on the effective month', () => {
    const c = withSession();
    c.schoolPolicyCode = 'FROM_EFFECTIVE_MONTH';
    expect(c.effectiveMonthConsequence(7)).toContain('charged in full');
    c.schoolPolicyCode = 'PRORATE_JOINING_MONTH';
    expect(c.effectiveMonthConsequence(7)).toContain('remaining days');
  });

  it('surfaces students with unresolved months as needing attention, one entry per month', () => {
    const c = withSession();
    c.showOnlyMissing = true;
    c.reconciliation = {
      totalStudents: 2, fullyGenerated: 0, partiallyGenerated: 2, notAssigned: 0, failed: 0, missingMonthCount: 0,
      unresolvedMonthCount: 1, studentsWithUnresolvedMonths: 1,
      students: [
        { studentId: 'stu_1', studentName: 'arnav', className: '1', status: 'PARTIALLY_GENERATED' as any,
          assignedMonths: [7, 8], generatedMonths: [7, 8], missingMonths: [],
          unresolvedMonths: [{ month: 7, periodStart: '2026-10-01', snapshotStatus: 'NO_ACTIVE_RULE_THIS_MONTH',
            reason: 'No fee rule covers this billing month.', ruleContext: 'Class 1\'s current fee rules take effect from 15 Oct 2026.',
            expectedAction: 'Make sure a fee rule … then recalculate this month.' }] },
        { studentId: 'stu_2', studentName: 'Gkgf', className: '1', status: 'PARTIALLY_GENERATED' as any,
          assignedMonths: [8], generatedMonths: [8], missingMonths: [], unresolvedMonths: [] },
      ],
    };

    expect(c.visibleReconciliationRows().map((r) => r.studentId)).toEqual(['stu_1']);
    const entries = c.unresolvedMonthEntries();
    expect(entries.length).toBe(1);
    expect(entries[0].row.studentName).toBe('arnav');
    expect(c.monthLabel(entries[0].month.month, true)).toBe('Oct 2026');
  });

  describe('fee-change outcome', () => {
    function withToast() {
      const toast = jasmine.createSpyObj('ToastService', ['success', 'info', 'warning', 'error']);
      const c = new FeeAssignmentComponent({} as any, {} as any, {} as any, toast, { detectChanges: () => {} } as any, {} as any);
      return { c, toast };
    }
    const run = (c: FeeAssignmentComponent, saved: boolean[], recalculated = 2, skipped = 0) =>
      (c as any).runChange(() => of({
        requestedStudents: saved.length, savedStudents: saved.filter(Boolean).length,
        recalculatedMonths: recalculated, skippedMonths: skipped,
        students: saved.map((ok, i) => ({ studentId: `S${i}`, changeSaved: ok, months: [], message: ok ? undefined : 'Rejected' })),
      }), 'Discount saved.');

    it('all saved: Completed', () => {
      const { c, toast } = withToast();
      run(c, [true, true]);
      expect(toast.success).toHaveBeenCalledWith('Completed', jasmine.stringMatching(/^Discount saved\. 2 month\(s\) updated/));
    });

    it('partly saved: a warning with the count, never Completed', () => {
      const { c, toast } = withToast();
      run(c, [true, false]);
      expect(toast.success).not.toHaveBeenCalled();
      expect(toast.warning).toHaveBeenCalledWith('Partly saved', jasmine.stringMatching(/1 of 2 student\(s\) updated/));
    });

    it('nothing saved: an error, never Completed', () => {
      const { c, toast } = withToast();
      run(c, [false, false]);
      expect(toast.success).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith('Nothing was saved', 'Rejected');
    });

    it('saved but every month protected: says nothing was recalculated', () => {
      const { c, toast } = withToast();
      run(c, [true], 0, 3);
      expect(toast.success).not.toHaveBeenCalled();
      expect(toast.info).toHaveBeenCalledWith('Saved — no months recalculated', jasmine.any(String));
    });
  });
});
