import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { StudentDashboardComponent } from './student-dashboard.component';
import { AuthStateService } from '../../auth/auth-state.service';
import { StudentService } from '../../services/student.service';
import { AttendanceService } from '../../services/attendance.service';
import { LeaveService } from '../../services/leave.service';
import { LoggerService } from '../../services/logger.service';
import { ToastService } from '../../services/toast.service';
import { HomeworkService } from '../../services/homework.service';
import { ClassUpdateService } from '../../services/class-update.service';
import { AssessmentService } from '../../services/assessment.service';
import { Assessment, assessmentDateKey } from '../../interfaces/assessment';

/** The dashboard's compact Upcoming Assessments section — isolated from the rest of the dashboard load. */
describe('StudentDashboardComponent — Upcoming Assessments', () => {
  let fixture: ComponentFixture<StudentDashboardComponent>;
  let component: StudentDashboardComponent;
  let assessments: jasmine.SpyObj<AssessmentService>;

  const inDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return assessmentDateKey(d); };
  const item = (id: number, subject: string, days: number): Assessment => ({
    id, assessmentType: 'UNIT_TEST', typeLabel: 'Unit Test', title: `${subject} test`, classId: 8, className: '8', sectionId: 3,
    sectionName: 'A', subjectName: subject, assessmentDate: inDays(days), startTime: null, endTime: null, syllabus: 'Ch 1',
    instructions: null, attachment: null, createdByUserId: 'T1', createdByName: 'Ms Rao', createdByRole: 'TEACHER',
    createdAt: '2026-09-20T09:00:00', updatedAt: '2026-09-20T09:00:00', canEdit: false,
    canDelete: false, createdByCurrentUser: false,
  });

  beforeEach(() => {
    assessments = jasmine.createSpyObj('AssessmentService', ['studentUpcoming']);
    TestBed.configureTestingModule({
      imports: [StudentDashboardComponent],
      providers: [
        // The getting-started card on this page needs HttpClient (no request is made in these tests).
        provideHttpClient(), provideHttpClientTesting(),
        provideRouter([]),
        { provide: AuthStateService, useValue: { getUser: () => null, hasFeature: () => false } },
        { provide: StudentService, useValue: {} },
        { provide: AttendanceService, useValue: {} },
        { provide: LeaveService, useValue: {} },
        { provide: LoggerService, useValue: jasmine.createSpyObj('LoggerService', ['error']) },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['error']) },
        { provide: HomeworkService, useValue: {} },
        { provide: ClassUpdateService, useValue: {} },
        { provide: AssessmentService, useValue: assessments },
      ],
    });
    fixture = TestBed.createComponent(StudentDashboardComponent);
    component = fixture.componentInstance;
    component.isLoading = false;
    component.homeworkLoading = false;
  });

  function render(): HTMLElement {
    component.loadUpcomingAssessments();
    fixture.detectChanges();
    return fixture.nativeElement;
  }

  it('requests at most three upcoming assessments and shows countdowns with a View all link', () => {
    assessments.studentUpcoming.and.returnValue(of([item(1, 'Science', 0), item(2, 'Maths', 1), item(3, 'English', 5), item(4, 'Hindi', 9)]));
    const el = render();
    expect(assessments.studentUpcoming).toHaveBeenCalledOnceWith(3);
    expect(el.querySelectorAll('.sd-as-item').length).toBe(3);
    expect(el.textContent).toContain('Science · Unit Test');
    expect(el.querySelector('.sd-as-when.is-today')!.textContent).toContain('Today');
    expect(el.textContent).toContain('Tomorrow');
    expect(el.textContent).toContain('In 5 days');
    expect(el.querySelector('a[href="/dashboard/assessments"]')).toBeTruthy();
  });

  it('shows a calm empty state', () => {
    assessments.studentUpcoming.and.returnValue(of([]));
    expect(render().textContent).toContain('No upcoming assessments.');
  });

  it('an assessments outage is contained to its own section', () => {
    assessments.studentUpcoming.and.returnValue(throwError(() => new Error('offline')));
    const el = render();
    expect(component.assessmentsFailed).toBeTrue();
    expect(el.textContent).toContain('Assessments are temporarily unavailable.');
  });
});
