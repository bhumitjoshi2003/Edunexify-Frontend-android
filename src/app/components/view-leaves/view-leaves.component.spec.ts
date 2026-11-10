import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { ViewLeavesComponent } from './view-leaves.component';
import { AuthStateService } from '../../auth/auth-state.service';
import { SchoolService } from '../../services/school.service';
import { LeaveApplication, LeaveService } from '../../services/leave.service';
import { ToastService } from '../../services/toast.service';
import { TeacherService } from '../../services/teacher.service';

/** Shared by the web and Android clients — keep the two copies identical. */
describe('ViewLeavesComponent', () => {
  let fixture: ComponentFixture<ViewLeavesComponent>;
  let component: ViewLeavesComponent;
  let leaves: jasmine.SpyObj<LeaveService>;
  let toast: jasmine.SpyObj<ToastService>;
  const pending = { id: 7, studentId: 'S1', studentName: 'Asha', className: '8', leaveDate: '2026-11-09', status: 'PENDING' } as unknown as LeaveApplication;

  function create(role: string, content: LeaveApplication[] = [pending]): void {
    leaves = jasmine.createSpyObj<LeaveService>('LeaveService', ['getLeavesPaginated', 'updateLeaveStatus']);
    leaves.getLeavesPaginated.and.returnValue(of({ content, totalElements: content.length, totalPages: 1, number: 0 } as any));
    leaves.updateLeaveStatus.and.returnValue(of({ ...pending, status: 'APPROVED' } as LeaveApplication));
    toast = jasmine.createSpyObj<ToastService>('ToastService', ['confirmWithReason', 'confirm', 'success', 'info', 'error']);
    toast.confirmWithReason.and.resolveTo('Checked with the class teacher');
    TestBed.configureTestingModule({
      imports: [ViewLeavesComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: AuthStateService, useValue: { getUser: () => ({ role, userId: 'u1', schoolSlug: 'demo' }) } },
        { provide: SchoolService, useValue: { getClasses: () => of(['8', '9']) } },
        { provide: TeacherService, useValue: { getTeacher: () => of({ classTeacher: '8' }) } },
        { provide: LeaveService, useValue: leaves },
        { provide: ToastService, useValue: toast },
      ],
    });
    fixture = TestBed.createComponent(ViewLeavesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('lets the Principal review every class without the Admin-only bulk cancel', () => {
    create('PRINCIPAL');
    expect(component.schoolWide).toBeTrue();
    expect(leaves.getLeavesPaginated.calls.mostRecent().args[2]).toBeUndefined();
    const page: HTMLElement = fixture.nativeElement;
    expect(page.querySelector('.vl-actions')).not.toBeNull();
    expect(page.querySelector('.vl-btn-delete-all')).toBeNull();
  });

  it('requires a reason for every Principal decision, including approval', async () => {
    create('PRINCIPAL');
    component.updateLeaveStatus(pending, 'APPROVED');
    await fixture.whenStable();
    expect(toast.confirmWithReason.calls.mostRecent().args[0].reasonInput.required).toBeTrue();
    expect(leaves.updateLeaveStatus).toHaveBeenCalledWith(7, 'APPROVED', 'Checked with the class teacher');
  });

  it('keeps the approval note optional for an Admin', async () => {
    create('ADMIN');
    component.updateLeaveStatus(pending, 'APPROVED');
    await fixture.whenStable();
    expect(toast.confirmWithReason.calls.mostRecent().args[0].reasonInput.required).toBeFalse();
    expect((fixture.nativeElement as HTMLElement).querySelector('.vl-btn-delete-all')).not.toBeNull();
  });

  it('marks a pending request red from day 3 only, and keeps its actions', () => {
    // Explicit status: other specs approve the shared `pending` fixture in place.
    const overdue = { ...pending, id: 8, status: 'PENDING', escalation: { day: 4, overdue: true, autoApprovalDate: '2026-11-16', automatic: true } } as LeaveApplication;
    const early = { ...pending, id: 9, status: 'PENDING', escalation: { day: 2, overdue: false, autoApprovalDate: '2026-11-18', automatic: true } } as LeaveApplication;
    create('ADMIN', [overdue, early]);
    const cards = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.vl-card'));
    expect(cards[0].classList).toContain('is-overdue');
    expect(cards[0].textContent).toContain('Overdue · Action Required');
    expect(cards[0].textContent).toContain('Day 4 since leave started · Auto-approves 16 Nov');
    expect(cards[0].querySelector('.vl-btn-approve')).not.toBeNull();
    expect(cards[0].querySelector('.vl-btn-reject')).not.toBeNull();
    expect(cards[1].classList).not.toContain('is-overdue');
    expect(cards[1].textContent).not.toContain('Overdue');
  });

  it('shows an automatic approval as such, without naming an administrator', () => {
    const auto = { ...pending, status: 'APPROVED', decidedBy: 'SYSTEM', decisionSource: 'SYSTEM_AUTO_APPROVAL',
      escalation: null } as LeaveApplication;
    const manual = { ...pending, id: 10, status: 'APPROVED', decidedBy: 'admin1', decisionSource: null } as LeaveApplication;
    create('ADMIN', [auto, manual]);
    const cards = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.vl-card'));
    expect(cards[0].textContent).toContain('Automatically Approved');
    expect(cards[0].textContent).toContain('No action was taken within the seven-day review period.');
    expect(cards[0].textContent).not.toContain('by SYSTEM');
    expect(cards[0].classList).not.toContain('is-overdue');
    expect(cards[1].textContent).toContain('Approved by admin1');
    expect(cards[1].textContent).not.toContain('Automatically Approved');
  });
});
