
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { CoordinatorDashboardComponent } from './coordinator-dashboard.component';
import { CoordinatorService } from '../../services/coordinator.service';
import { AuthStateService } from '../../auth/auth-state.service';
import { CoordinatorOverview } from '../../interfaces/coordinator';

/** Shared by the web and Android clients — keep the two copies identical.
 * The Coordinator workspace's dashboard, laid out like the Principal's; personal teaching is not part of it. */
describe('CoordinatorDashboardComponent', () => {
  let fixture: ComponentFixture<CoordinatorDashboardComponent>;
  let coordinators: jasmine.SpyObj<CoordinatorService>;
  let features: string[];

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
        { provide: AuthStateService, useValue: { getUser: () => ({ name: 'Asha Rao' }), hasFeature: (k: string) => features.includes(k) } },
      ],
    });
    fixture = TestBed.createComponent(CoordinatorDashboardComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    features = ['REPORT_CARDS', 'EXAMS_RESULTS', 'CLASSROOM'];
    coordinators = jasmine.createSpyObj('CoordinatorService', ['mine', 'overview', 'reportCards', 'marksCompletion']);
    coordinators.mine.and.returnValue(of({ id: 1, appointedAt: '', operations: [], fullClassIds: [],
      scope: [{ classId: 8, className: '8', sectionId: 81, sectionName: 'A', streamId: null, streamName: null }] }));
    coordinators.overview.and.returnValue(of(overview));
    coordinators.reportCards.and.returnValue(of([{ setupId: 1, setupName: 'Term 1', classId: 8, className: '8', sectionId: 81,
      sectionName: 'A', students: 30, complete: 20, incomplete: 10, noResult: 0, missingTeacherRemarks: 4,
      approvalStatus: 'PENDING_TEACHER', correctionRequests: 0 }]));
    coordinators.marksCompletion.and.returnValue(of([]));
  });

  it('is the Principal-style dashboard: hero, today tiles, needs-attention and no teaching panel', () => {
    const el = create();
    const text = el.textContent ?? '';
    expect(el.querySelector('.pd-hero')).not.toBeNull();
    expect(el.querySelector('.pd-hero-meta')?.textContent).toContain('Coordinator');
    expect(text).not.toContain('Class teacher');
    expect(text).toContain('Class 8-A');                    // attendance table
    expect(el.querySelector('.pd-hero-meta')?.textContent).toContain('1 class');
    expect(el.querySelectorAll('.pd-today .pd-tile').length).toBe(4);
    expect(text).toContain('0 / 1');
    expect(text).toContain('Needs your attention');
    expect(el.querySelector('.pd-attention-list li.is-urgent')?.textContent).toContain('2 periods need a substitute today');
    expect(text).toContain('Term 1 · Class 8-A');            // report card completion
    expect(text).toContain('Awaiting class teacher');
    expect(text).not.toContain('My teaching');
  });

  it('keeps teaching out: no link to the Teacher dashboard or personal teaching pages', () => {
    const el = create();
    expect(el.querySelector('a[href="/dashboard/teacher-dashboard"]')).toBeNull();
    expect(el.querySelector('a[href="/dashboard/teacher-checkin"]')).toBeNull();
    expect(el.textContent).not.toContain('Open my teaching');
  });

  it('surfaces report cards that still need work in Needs your attention, linking to the review', () => {
    const el = create();
    const rows = Array.from(el.querySelectorAll('.pd-attention-list li a')).map(a => a.getAttribute('href'));
    expect(rows).toContain('/dashboard/report-card-review');
    expect(el.querySelector('.pd-attention-list')?.textContent).toContain('10 incomplete · 4 without teacher remarks');
  });

  it('keeps other panels working when one source fails', () => {
    coordinators.reportCards.and.returnValue(throwError(() => ({ status: 500 })));
    const el = create();
    expect(el.textContent).toContain('Report-card progress is unavailable.');
    expect(el.textContent).toContain('32');
    expect(el.textContent).toContain('Some information is unavailable');
  });

  it('hides the report-card and marks panels when those features are off for the school', () => {
    features = [];
    const el = create();
    expect(el.textContent).not.toContain('Report card completion');
    expect(el.textContent).not.toContain('Marks still to enter');
    expect(el.querySelector('a[href="/dashboard/report-card-review"]')).toBeNull();
  });

  it('explains a missing appointment instead of showing an empty scope', () => {
    coordinators.mine.and.returnValue(of(null));
    expect(create().textContent).toContain('could not be loaded');
  });
});
