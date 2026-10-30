import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { SchoolSettingsComponent } from './school-settings.component';
import { SchoolService } from '../../services/school.service';
import { AuthStateService } from '../../auth/auth-state.service';
import { TenantService } from '../../services/tenant.service';
import { LoggerService } from '../../services/logger.service';
import { ToastService } from '../../services/toast.service';
import { AcademicSessionService } from '../../services/academic-session.service';
import { FeeWorkflowService } from '../../services/fee-workflow.service';

/**
 * Entitlement-aware School Settings: a switched-off feature must not be requested, must not leave
 * a tab/section behind, and must not produce a warning just because the page was opened.
 */
describe('School Settings — feature gating', () => {
  let feeWorkflow: { getSettings: jasmine.Spy; updateSettings: jasmine.Spy };
  let schoolService: any;
  let toast: jasmine.SpyObj<ToastService>;

  function create(enabled: string[], tab: string | null = null, role = 'ADMIN') {
    toast = jasmine.createSpyObj('ToastService', ['success', 'error', 'warning', 'info', 'confirm']);
    feeWorkflow = {
      getSettings: jasmine.createSpy('getSettings').and.returnValue(of({ midSessionPolicy: 'NEXT_MONTH' })),
      updateSettings: jasmine.createSpy('updateSettings').and.returnValue(of({ midSessionPolicy: 'NEXT_MONTH' })),
    };
    schoolService = {
      getSettings: () => of({ id: 1, name: 'S', workingDays: [] } as any),
      getEntitlement: () => of(null),
      getSchoolFeatures: () => of([]),
    };
    TestBed.configureTestingModule({
      imports: [SchoolSettingsComponent],
      providers: [
        { provide: SchoolService, useValue: schoolService },
        { provide: AuthStateService, useValue: { getUser: () => ({ role, userId: 'A1' }),
            hasFeature: (k: string) => enabled.includes(k), setFeatureEnabled: () => {}, loadCurrentUser: () => Promise.resolve() } },
        { provide: TenantService, useValue: { getLogoUrl: (u: string) => u } },
        { provide: LoggerService, useValue: jasmine.createSpyObj('LoggerService', ['error']) },
        { provide: ToastService, useValue: toast },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: (k: string) => k === 'tab' ? tab : null } } } },
        { provide: AcademicSessionService, useValue: { getAllSessions: () => of([]) } },
        { provide: FeeWorkflowService, useValue: feeWorkflow },
      ],
    });
    const fixture = TestBed.createComponent(SchoolSettingsComponent);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }
  const tabLabels = (el: HTMLElement) => Array.from(el.querySelectorAll('.ss-tab-label')).map(t => t.textContent!.trim());

  describe('all fee features off', () => {
    it('opening General never requests the fee policy', () => {
      create([]);
      expect(feeWorkflow.getSettings).not.toHaveBeenCalled();
    });

    it('shows no warning or error toast just because the page opened', () => {
      create([]);
      expect(toast.error).not.toHaveBeenCalled();
      expect(toast.warning).not.toHaveBeenCalled();
    });

    it('hides the Payments tab and the fee policy section', () => {
      const { el } = create([]);
      expect(tabLabels(el)).not.toContain('Payments');
      expect(el.textContent).not.toContain('Mid-session fee policy');
      expect(tabLabels(el)).toContain('General');
    });

    it('a ?tab=razorpay deep link falls back to General and shows no payment configuration', () => {
      const { component, el } = create([], 'razorpay');
      expect(component.activeTab).toBe('general');
      expect(el.textContent).not.toContain('Payment Integration');
    });

    it('saving the fee policy is a no-op', () => {
      const { component } = create([]);
      component.feePolicy = { midSessionPolicy: 'NEXT_MONTH' } as any;
      component.saveFeePolicy();
      expect(feeWorkflow.updateSettings).not.toHaveBeenCalled();
    });
  });

  describe('ONLINE_PAYMENTS off, FEE_MANAGEMENT on', () => {
    it('hides the Payments tab but keeps the fee policy reachable from General', () => {
      const { el } = create(['FEE_MANAGEMENT']);
      expect(tabLabels(el)).not.toContain('Payments');
      expect(feeWorkflow.getSettings).toHaveBeenCalledTimes(1);
      expect(el.textContent).toContain('Mid-session fee policy');
    });
  });

  describe('features enabled (existing behaviour)', () => {
    it('shows the Payments tab, loads and shows the fee policy, and opens the payment configuration', () => {
      const { fixture, el } = create(['FEE_MANAGEMENT', 'ONLINE_PAYMENTS']);
      expect(tabLabels(el)).toContain('Payments');
      expect(feeWorkflow.getSettings).toHaveBeenCalledTimes(1);
      expect(el.textContent).toContain('Mid-session fee policy');
      const paymentsTab = Array.from(el.querySelectorAll<HTMLElement>('.ss-tab')).find(t => t.textContent!.includes('Payments'))!;
      paymentsTab.click();
      fixture.detectChanges();
      expect(el.textContent).toContain('Payment Integration');
    });

    it('honours a ?tab=razorpay deep link', () => {
      const { component } = create(['FEE_MANAGEMENT', 'ONLINE_PAYMENTS'], 'razorpay');
      expect(component.activeTab).toBe('razorpay');
    });

    it('still saves the fee policy', () => {
      const { component } = create(['FEE_MANAGEMENT']);
      component.saveFeePolicy();
      expect(feeWorkflow.updateSettings).toHaveBeenCalled();
      expect(toast.success).toHaveBeenCalled();
    });
  });
});
