import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FormBuilder } from '@angular/forms';
import { of } from 'rxjs';
import { OnLeaveTodayComponent } from './on-leave-today.component';
import { LeaveService, LeaveApplication } from '../../services/leave.service';
import { ViewLeavesComponent } from '../view-leaves/view-leaves.component';
import { ApplyLeaveComponent } from '../apply-leave/apply-leave.component';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component';

/** Leave Phase 1 UI: apply payload, decisions with reasons, explicit reversal, cancel-not-delete,
 *  the reason field in the confirm dialog and the admin "On Leave Today" card. */
describe('Leave Phase 1', () => {
  const noop = { markForCheck: () => {} } as any;
  const logger = { error: () => {}, warn: () => {}, info: () => {} } as any;

  function leave(status: string): LeaveApplication {
    return { id: 7, studentId: 'S1', studentName: 'Asha', leaveDate: '2026-10-06', reason: 'Fever', className: '8', status };
  }

  function viewLeaves(api: any, toast: any): ViewLeavesComponent {
    return new ViewLeavesComponent({ params: of({}) } as any, api, {} as any, {} as any, logger, noop, toast, {} as any);
  }

  it('apply sends only the day and the reason', async () => {
    const api = jasmine.createSpyObj('LeaveService', ['applyLeave', 'getLeavesByStudentId']);
    api.applyLeave.and.returnValue(of('ok'));
    api.getLeavesByStudentId.and.returnValue(of({ content: [], totalPages: 0, totalElements: 0 }));
    const toast = jasmine.createSpyObj('ToastService', ['success', 'error', 'warning', 'info', 'confirm']);
    const auth = { getUserRole: () => 'STUDENT' } as any;
    const c = new ApplyLeaveComponent(new FormBuilder(), api, {} as any, auth, logger, noop, toast, {} as any, {} as any, {} as any);
    c.studentId = 'S1';
    c.studentName = 'Asha';
    c.className = '8';
    const d = new Date();
    d.setDate(d.getDate() + 2);
    if (d.getDay() === 0) d.setDate(d.getDate() + 1);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    c.leaveForm.get('leaveDate')!.setValue(iso);
    c.leaveForm.get('reason')!.setValue('Fever');

    await c.applyLeave();

    expect(api.applyLeave).toHaveBeenCalledTimes(1);
    expect(Object.keys(api.applyLeave.calls.mostRecent().args[0]).sort()).toEqual(['leaveDate', 'reason']);
  });

  it('rejecting sends the reason; changing a decision uses the explicit reversal with a reason', async () => {
    const api = jasmine.createSpyObj('LeaveService', ['updateLeaveStatus', 'reverseLeaveDecision', 'deleteLeaveById', 'getLeavesPaginated']);
    api.updateLeaveStatus.and.returnValue(of({ ...leave('REJECTED'), decisionReason: 'Exam day', decidedBy: 'ct1' }));
    api.reverseLeaveDecision.and.returnValue(of({ ...leave('APPROVED'), decisionReason: 'Certificate' }));
    const toast = jasmine.createSpyObj('ToastService', ['success', 'error', 'warning', 'info', 'confirm', 'confirmWithReason']);
    const c = viewLeaves(api, toast);

    toast.confirmWithReason.and.resolveTo('Exam day');
    const pending = leave('PENDING');
    c.updateLeaveStatus(pending, 'REJECTED');
    await Promise.resolve(); await Promise.resolve();
    expect(api.updateLeaveStatus).toHaveBeenCalledWith(7, 'REJECTED', 'Exam day');
    expect(pending.status).toBe('REJECTED');
    expect(pending.decisionReason).toBe('Exam day');

    toast.confirmWithReason.and.resolveTo('Certificate');
    c.editLeaveStatus(pending);
    await Promise.resolve(); await Promise.resolve();
    expect(toast.confirmWithReason.calls.mostRecent().args[0].reasonInput.required).toBeTrue();
    expect(api.reverseLeaveDecision).toHaveBeenCalledWith(7, 'Certificate');
    expect(api.updateLeaveStatus).toHaveBeenCalledTimes(1);    // never a second "decision"

    toast.confirmWithReason.and.resolveTo(null);               // cancelled dialog → nothing sent
    c.editLeaveStatus(pending);
    await Promise.resolve(); await Promise.resolve();
    expect(api.reverseLeaveDecision).toHaveBeenCalledTimes(1);
  });

  it('bulk "Cancel pending" only cancels pending requests', async () => {
    const api = jasmine.createSpyObj('LeaveService', ['deleteLeaveById', 'getLeavesPaginated']);
    api.deleteLeaveById.and.returnValue(of('ok'));
    api.getLeavesPaginated.and.returnValue(of({ content: [], totalPages: 0, totalElements: 0 }));
    const toast = jasmine.createSpyObj('ToastService', ['success', 'error', 'warning', 'info', 'confirm']);
    toast.confirm.and.resolveTo(true);
    const c = viewLeaves(api, toast);
    c.filteredLeaves = [leave('PENDING'), { ...leave('APPROVED'), id: 8 }, { ...leave('CANCELLED'), id: 9 }, { ...leave('PENDING'), id: 10 }];
    spyOn(c, 'fetchLeaves');
    c.deleteAllFilteredLeaves();
    await Promise.resolve(); await Promise.resolve();
    expect(api.deleteLeaveById.calls.allArgs().map((a: any[]) => a[0])).toEqual([7, 10]);
  });

  it('confirm dialog reason: required blocks confirm, and the reason is returned', () => {
    const closed: any[] = [];
    const ref = { close: (v: any) => closed.push(v), keydownEvents: () => of() } as any;
    const sanitizer = { sanitize: (_: any, v: string) => v } as any;
    const dlg = new ConfirmDialogComponent(ref, { title: 'x', reasonInput: { label: 'Reason', required: true } }, sanitizer);
    expect(dlg.confirmDisabled).toBeTrue();
    dlg.reasonText = '  Parent called  ';
    expect(dlg.confirmDisabled).toBeFalse();
    dlg.confirm();
    expect(closed).toEqual(['Parent called']);
    const plain = new ConfirmDialogComponent(ref, { title: 'y' }, sanitizer);
    plain.confirm();
    expect(closed[1]).toBeTrue();                              // ordinary confirms unchanged
  });

  it('On Leave Today shows staff, students and the substitution link', () => {
    const api = { getOnLeaveToday: () => of({
      date: '2026-10-05', periodsNeedingSubstitute: 2,
      students: [{ leaveId: 1, studentId: 'S1', studentName: 'Asha', className: '8', sectionName: 'A', reason: 'Fever' }],
      staff: [{ leaveId: 2, teacherId: 'T1', teacherName: 'Mr Rao', startDate: '2026-10-05', endDate: '2026-10-07', reason: 'Medical',
                periodsToday: 3, periodsNeedingSubstitute: 2 }],
    }) };
    TestBed.configureTestingModule({ imports: [OnLeaveTodayComponent], providers: [provideRouter([]), { provide: LeaveService, useValue: api }] });
    const f = TestBed.createComponent(OnLeaveTodayComponent);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Mr Rao');
    expect(el.textContent).toContain('Asha');
    expect(el.textContent).toContain('Class 8-A');
    expect(el.textContent).toContain('2 periods need substitution');
    expect(el.querySelector('a[href="/dashboard/teacher-substitutions"]')).not.toBeNull();
  });
});
