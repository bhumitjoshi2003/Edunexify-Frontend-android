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

  function create(role: string): void {
    leaves = jasmine.createSpyObj<LeaveService>('LeaveService', ['getLeavesPaginated', 'updateLeaveStatus']);
    leaves.getLeavesPaginated.and.returnValue(of({ content: [pending], totalElements: 1, totalPages: 1, number: 0 } as any));
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
});
