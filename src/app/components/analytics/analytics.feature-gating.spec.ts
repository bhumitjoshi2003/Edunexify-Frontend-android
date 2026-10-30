import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AnalyticsComponent } from './analytics.component';
import { DashboardAnalyticsService } from '../../services/dashboard-analytics.service';
import { SchoolService } from '../../services/school.service';
import { LoggerService } from '../../services/logger.service';
import { AuthStateService } from '../../auth/auth-state.service';

describe('AnalyticsComponent — Fee Management gating', () => {
  let service: jasmine.SpyObj<DashboardAnalyticsService>;

  function create(enabled: string[]) {
    service = jasmine.createSpyObj('DashboardAnalyticsService', ['getFeeTrend', 'getClassStats', 'getAttendanceTrend']);
    service.getFeeTrend.and.returnValue(of([{ month: 'Jan', amount: 100000 }] as any));
    service.getClassStats.and.returnValue(of([{ className: '5', studentCount: 10, attendanceRate: 90 }] as any));
    service.getAttendanceTrend.and.returnValue(of([]));
    TestBed.configureTestingModule({
      imports: [AnalyticsComponent],
      providers: [
        { provide: DashboardAnalyticsService, useValue: service },
        { provide: SchoolService, useValue: { getClasses: () => of([]) } },
        { provide: LoggerService, useValue: jasmine.createSpyObj('LoggerService', ['error']) },
        { provide: AuthStateService, useValue: { hasFeature: (k: string) => enabled.includes(k) } },
      ],
    });
    const fixture = TestBed.createComponent(AnalyticsComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('does not request or show fee collection when Fee Management is off', () => {
    const el = create([]);
    expect(service.getFeeTrend).not.toHaveBeenCalled();
    expect(service.getClassStats).toHaveBeenCalled();
    expect(el.textContent).not.toContain('Monthly Fee Collection');
    expect(el.textContent).not.toContain('Fee (');
  });

  it('requests and shows fee collection when Fee Management is on', () => {
    const el = create(['FEE_MANAGEMENT']);
    expect(service.getFeeTrend).toHaveBeenCalled();
    expect(el.textContent).toContain('Monthly Fee Collection');
  });
});
