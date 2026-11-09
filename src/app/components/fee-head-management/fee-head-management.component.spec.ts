import { FeeHeadManagementComponent } from './fee-head-management.component';
import { of } from 'rxjs';
describe('fee head academic schedules', () => {
  function component() {
    return new FeeHeadManagementComponent(
      { getAllFeeHeads: () => of([]) } as any, {} as any, { error: () => {} } as any,
      { markForCheck: () => {} } as any,
      { getCurrentSession: () => of({ startDate: '2026-04-01' }) } as any);
  }
  it('uses academic month 1 for annual and months 1/7 for semi-annual', () => {
    const c = component(); c.ngOnInit();
    c.form.frequency = 'ANNUAL'; c.onFrequencyChange();
    expect([...c.selectedMonths]).toEqual([1]);
    c.form.frequency = 'SEMI_ANNUAL'; c.onFrequencyChange();
    expect([...c.selectedMonths]).toEqual([1, 7]);
    expect(c.allMonths[0].label).toBe('April 2026');
    expect(c.allMonths[6].label).toBe('October 2026');
  });
  it('preserves existing suspicious schedules when editing', () => {
    const c = component();
    c.openEdit({ id: 1, dueMonths: '[4,10]' } as any);
    expect([...c.selectedMonths]).toEqual([4, 10]);
  });

  describe('review notice', () => {
    async function render(heads: any[]) {
      const { TestBed } = await import('@angular/core/testing');
      const { FeeHeadService } = await import('../../services/fee-head.service');
      const { ToastService } = await import('../../services/toast.service');
      const { LoggerService } = await import('../../services/logger.service');
      const { AcademicSessionService } = await import('../../services/academic-session.service');
      await TestBed.configureTestingModule({
        imports: [FeeHeadManagementComponent],
        providers: [
          { provide: FeeHeadService, useValue: { getAllFeeHeads: () => of(heads) } },
          { provide: ToastService, useValue: { error: () => {}, success: () => {} } },
          { provide: LoggerService, useValue: { error: () => {} } },
          { provide: AcademicSessionService, useValue: { getCurrentSession: () => of({ startDate: '2026-04-01' }) } },
        ],
      }).compileComponents();
      const fixture = TestBed.createComponent(FeeHeadManagementComponent);
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    }
    const head = (over: any) => ({ id: 1, name: 'Tuition', code: 'TUITION', frequency: 'MONTHLY',
      dueMonths: '[1,2,3,4,5,6,7,8,9,10,11,12]', active: true, optional: false, ...over });

    it('shows no notice and no developer text when no schedule looks suspicious', async () => {
      const root = await render([head({}), head({ id: 2, name: 'Exam', code: 'EXAM', frequency: 'QUARTERLY', dueMonths: '[1,4,7,10]' })]);
      expect(root.querySelector('[data-testid="fee-head-review"]')).toBeNull();
      expect(root.textContent).not.toContain('ordinal');
      expect(root.textContent).not.toContain('Android');
      expect(root.querySelector('.fhm-badge-review')).toBeNull();
    });

    it('lists only the flagged heads, in admin wording, and highlights them without changing them', async () => {
      const root = await render([
        head({}),
        head({ id: 7, name: 'Annual Charges', code: 'ANNUAL', frequency: 'ANNUAL', dueMonths: '[4]' }),
        head({ id: 8, name: 'Exam Fee', code: 'EXAM', frequency: 'SEMI_ANNUAL', dueMonths: '[4,10]' }),
      ]);
      const notice = root.querySelector('[data-testid="fee-head-review"]')!;
      expect(notice.textContent).toContain('Some fee schedules may need a quick review');
      expect(notice.textContent).toContain('Nothing has been changed automatically');
      expect(notice.textContent).toContain('Annual Charges');
      expect(notice.textContent).toContain('Exam Fee');
      expect(notice.textContent).toContain('July 2026');            // ordinal 4 shown as a real month
      expect(notice.textContent).not.toContain('Tuition');
      expect(notice.textContent).not.toContain('Android');
      expect(root.querySelectorAll('.fhm-badge-review').length).toBe(2);
    });
  });
});
