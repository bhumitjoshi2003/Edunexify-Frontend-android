import { convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { FeeRecalculationComponent } from './fee-recalculation.component';

/** Shared by the web and Android clients — keep the two copies identical. */
describe('FeeRecalculationComponent — opened from an unresolved month', () => {
  function open(query: Record<string, string>) {
    const feesService = jasmine.createSpyObj('FeesService', ['previewRecalculation', 'applyRecalculation']);
    const route = { snapshot: { queryParamMap: convertToParamMap(query) } };
    const sessions = { getAllSessions: () => of([{ id: 1, label: '2026-2027', startDate: '2026-04-01', endDate: '2027-03-31', current: true }]) };
    const c = new FeeRecalculationComponent(feesService, {} as any, {} as any, sessions as any,
      jasmine.createSpyObj('ToastService', ['success', 'error', 'warning', 'info']), jasmine.createSpyObj('LoggerService', ['error']),
      jasmine.createSpyObj('ChangeDetectorRef', ['markForCheck', 'detectChanges']), route as any);
    c.ngOnInit();
    return { c, feesService };
  }

  it('prefills the student, session and month, and runs nothing until the admin previews', () => {
    const { c, feesService } = open({ studentId: 'stu_1', session: '2026-2027', months: '7' });
    expect(c.studentId).toBe('stu_1');
    expect(c.session).toBe('2026-2027');
    expect(c.selectedMonthsForPreview).toEqual([7]);
    expect(feesService.previewRecalculation).not.toHaveBeenCalled();
    expect(feesService.applyRecalculation).not.toHaveBeenCalled();
  });

  it('ignores invalid months and opens normally without query parameters', () => {
    expect(open({ studentId: 'stu_1', session: '2026-2027', months: '0,13,x,3' }).c.selectedMonthsForPreview).toEqual([3]);
    const plain = open({}).c;
    expect(plain.studentId).toBe('');
    expect(plain.selectedMonthsForPreview).toEqual([]);
  });
});
