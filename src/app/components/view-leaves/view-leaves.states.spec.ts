import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ViewLeavesComponent } from './view-leaves.component';
import { AuthStateService } from '../../auth/auth-state.service';
import { SchoolService } from '../../services/school.service';
import { TeacherService } from '../../services/teacher.service';
import { LeaveService } from '../../services/leave.service';
import { ToastService } from '../../services/toast.service';

/**
 * Leave Applications page states: a failed load is never "no leave applications", a teacher without
 * a class is told why, and filters that hide everything offer Clear filters.
 * Shared by the web and Android clients — keep the two copies identical.
 */
describe('ViewLeavesComponent — page states', () => {
  function render(opts: { role?: string; classTeacher?: string | null; fail?: boolean } = {}) {
    const leaves = jasmine.createSpyObj<LeaveService>('LeaveService', ['getLeavesPaginated']);
    leaves.getLeavesPaginated.and.returnValue(opts.fail
      ? throwError(() => ({ status: 503 }))
      : of({ content: [], totalElements: 0, totalPages: 0, number: 0 } as any));
    TestBed.configureTestingModule({
      imports: [ViewLeavesComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: AuthStateService, useValue: { getUser: () => ({ role: opts.role ?? 'TEACHER', userId: 'u1', schoolSlug: 'demo' }), getUserRole: () => opts.role ?? 'TEACHER', hasFeature: () => true, getUserId: () => 'u1' } },
        { provide: SchoolService, useValue: { getClasses: () => of(['8', '9']) } },
        { provide: TeacherService, useValue: { getTeacher: () => of({ classTeacher: opts.classTeacher === undefined ? '8' : opts.classTeacher }) } },
        { provide: LeaveService, useValue: leaves },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['error', 'success', 'info', 'confirm', 'confirmWithReason']) },
      ],
    });
    const fixture = TestBed.createComponent(ViewLeavesComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const state = () => el.querySelector('[data-guidance]')?.getAttribute('data-guidance') ?? null;
    return { fixture, el, leaves, state };
  }

  it('a failed load shows Retry, never "no leave applications"; Retry loads again', () => {
    const { fixture, el, leaves, state } = render({ fail: true });
    expect(state()).toBe('load-error');
    expect(el.textContent).not.toContain('No pending leave applications');
    leaves.getLeavesPaginated.and.returnValue(of({ content: [], totalElements: 0, totalPages: 0, number: 0 } as any));
    (Array.from(el.querySelectorAll('button')).find(b => b.textContent!.includes('Retry')) as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(state()).toBe('empty');
    expect(el.textContent).toContain('No pending leave applications');
  });

  it('a teacher who is not a class teacher is told why (a prerequisite), not shown an empty list', () => {
    const { el, state } = render({ classTeacher: null });
    expect(state()).toBe('prerequisite');
    expect(el.textContent).toContain('You are not a class teacher yet');
  });

  it('filters that hide everything are a no-match with Clear filters', () => {
    const { fixture, el, state } = render({ role: 'ADMIN' });
    fixture.componentInstance.studentIdFilter = 'stu_1';
    fixture.componentInstance.fetchLeaves();
    fixture.detectChanges();
    expect(state()).toBe('no-match');
    (Array.from(el.querySelectorAll('button')).find(b => b.textContent!.includes('Clear filters')) as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.componentInstance.studentIdFilter).toBe('');
    expect(state()).toBe('empty');
  });
});
