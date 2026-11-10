import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { CoordinatorDashboardComponent } from './coordinator-dashboard.component';
import { CoordinatorService } from '../../services/coordinator.service';
import { AuthStateService } from '../../auth/auth-state.service';
import { CoordinatorOverview } from '../../interfaces/coordinator';

/** Shared by the web and Android clients — keep the two copies identical. */
describe('CoordinatorDashboardComponent', () => {
  let fixture: ComponentFixture<CoordinatorDashboardComponent>;
  let coordinators: jasmine.SpyObj<CoordinatorService>;

  const overview: CoordinatorOverview = {
    today: '2026-11-10', units: [{ classId: 8, className: '8', sectionId: 81, sectionName: 'A' }],
    students: 32, teachers: 6,
    attendance: [{ classId: 8, className: '8', sectionId: 81, sectionName: 'A', submitted: false, present: 0, absent: 0, markedBy: null }],
    assessments: [], exams: [], substitutionsNeeded: 2, substitutionsCovered: 1,
    attention: [{ kind: 'SUBSTITUTION', severity: 'danger', title: '2 periods need a substitute today', detail: 'Assign cover', route: '/dashboard/teacher-substitutions' }],
    classTeacher: true, classTeacherOf: 'Class 9',
  };

  function create() {
    TestBed.configureTestingModule({
      imports: [CoordinatorDashboardComponent],
      providers: [
        provideRouter([]),
        { provide: CoordinatorService, useValue: coordinators },
        { provide: AuthStateService, useValue: { getUser: () => ({ name: 'Asha Rao' }) } },
      ],
    });
    fixture = TestBed.createComponent(CoordinatorDashboardComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    coordinators = jasmine.createSpyObj('CoordinatorService', ['mine', 'overview', 'reportCards', 'marksCompletion']);
    coordinators.mine.and.returnValue(of({ id: 1, appointedAt: '', operations: [], fullClassIds: [],
      scope: [{ classId: 8, className: '8', sectionId: 81, sectionName: 'A', streamId: null, streamName: null }] }));
    coordinators.overview.and.returnValue(of(overview));
    coordinators.reportCards.and.returnValue(of([{ setupId: 1, setupName: 'Term 1', classId: 8, className: '8', sectionId: 81,
      sectionName: 'A', students: 30, complete: 20, incomplete: 10, noResult: 0, missingTeacherRemarks: 4,
      approvalStatus: 'PENDING_TEACHER', correctionRequests: 0 }]));
    coordinators.marksCompletion.and.returnValue(of([]));
  });

  it('shows the scope, today in scope, attention items, report-card progress and the way back to teaching', () => {
    const el = create();
    const text = el.textContent ?? '';
    expect(text).toContain('Academic Coordinator');
    expect(text).toContain('Class 8-A');
    expect(text).toContain('32');
    expect(text).toContain('0 / 1');
    expect(text).toContain('2 periods need a substitute today');
    expect(text).toContain('Term 1 · Class 8-A');
    expect(text).toContain('Awaiting class teacher');
    expect(text).toContain('class teacher of Class 9');
    expect(el.querySelector('a[href="/dashboard/teacher-dashboard"]')).not.toBeNull();
  });

  it('keeps other panels working when one source fails', () => {
    coordinators.reportCards.and.returnValue(throwError(() => ({ status: 500 })));
    const el = create();
    expect(el.textContent).toContain('Report-card progress is unavailable.');
    expect(el.textContent).toContain('32');
  });

  it('explains a missing appointment instead of showing an empty scope', () => {
    coordinators.mine.and.returnValue(of(null));
    expect(create().textContent).toContain('could not be loaded');
  });
});
