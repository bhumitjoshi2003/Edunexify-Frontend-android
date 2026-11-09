import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of, Subject } from 'rxjs';
import { FeeStructureComponent } from './fee-structure.component';
import { FeeHeadService } from '../../services/fee-head.service';
import { FeeRuleService } from '../../services/fee-rule.service';
import { AcademicSessionService } from '../../services/academic-session.service';
import { SchoolService } from '../../services/school.service';
import { ParentPortalService } from '../../services/parent-portal.service';
import { AuthStateService } from '../../auth/auth-state.service';
import { LoggerService } from '../../services/logger.service';
import { ToastService } from '../../services/toast.service';

describe('FeeStructureComponent shared access and schedule contract', () => {
  const session = { id: 1, label: '2026-2027', startDate: '2026-10-01', current: true } as any;
  let heads: any, rules: any, profile: Subject<any>, role: string;
  beforeEach(async () => {
    role = 'PARENT'; profile = new Subject<any>();
    heads = jasmine.createSpyObj('FeeHeadService', ['getActiveFeeHeads', 'createFeeHead']);
    heads.getActiveFeeHeads.and.returnValue(of([]));
    rules = jasmine.createSpyObj('FeeRuleService', ['getRulesBySessionAndClass', 'getRulesBySession']);
    rules.getRulesBySessionAndClass.and.returnValue(of([])); rules.getRulesBySession.and.returnValue(of([]));
    await TestBed.configureTestingModule({ imports: [FeeStructureComponent], providers: [
      { provide: FeeHeadService, useValue: heads }, { provide: FeeRuleService, useValue: rules },
      { provide: AcademicSessionService, useValue: { getAllSessions: () => of([session]) } },
      { provide: SchoolService, useValue: { getClasses: () => of(['6', '7']) } },
      { provide: ParentPortalService, useValue: { getMyProfile: () => profile } },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => 'S1' } } } },
      { provide: AuthStateService, useValue: { getUserRole: () => role, getUserId: () => 'S1' } },
      { provide: LoggerService, useValue: { error: () => {} } },
      { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['error','success','warning','confirm']) },
    ] }).compileComponents();
  });
  it('waits for permission and then asks only for the linked student class', () => {
    const f = TestBed.createComponent(FeeStructureComponent); f.detectChanges();
    expect(heads.getActiveFeeHeads).not.toHaveBeenCalled();
    profile.next({ children: [{ studentId: 'S1', className: '6', canViewFees: true }] });
    expect(heads.getActiveFeeHeads).toHaveBeenCalledWith('S1');
    expect(rules.getRulesBySessionAndClass).toHaveBeenCalledWith(1, '6', 'S1');
    expect(rules.getRulesBySession).not.toHaveBeenCalled(); expect(f.componentInstance.classes).toEqual(['6']);
  });
  it('makes no fee request when the linked child cannot view fees', () => {
    const f = TestBed.createComponent(FeeStructureComponent); f.detectChanges();
    profile.next({ children: [{ studentId: 'S1', className: '6', canViewFees: false }] });
    expect(heads.getActiveFeeHeads).not.toHaveBeenCalled(); expect(f.componentInstance.accessDenied).toBeTrue();
  });
  it('the real new-head frequency dropdown updates the academic schedule', async () => {
    role = 'ADMIN'; const f = TestBed.createComponent(FeeStructureComponent); f.detectChanges();
    f.componentInstance.toggleFeeHeadForm(); f.detectChanges(); await f.whenStable(); f.detectChanges();
    const select = f.nativeElement.querySelector('.fs-fh-form select') as HTMLSelectElement;
    expect(select).withContext('new-head frequency control').not.toBeNull();
    select.value = 'ANNUAL'; select.dispatchEvent(new Event('change')); await f.whenStable();
    expect(f.componentInstance.newFeeHead.dueMonths).toBe('[1]');
  });
  it('a previous session rule response cannot replace the new session grid', () => {
    role = 'ADMIN'; const old = new Subject<any[]>(); rules.getRulesBySession.and.returnValue(old);
    const f = TestBed.createComponent(FeeStructureComponent); f.detectChanges();
    rules.getRulesBySession.and.returnValue(of([{ className: '6', feeHeadId: 1, amount: 20000 }]));
    f.componentInstance.currentSession = { ...session, id: 2 }; f.componentInstance.loadRules();
    old.next([{ className: '6', feeHeadId: 1, amount: 10000 }]);
    expect(f.componentInstance.feeGrid['6'][1]).toBe(200);
  });
});
