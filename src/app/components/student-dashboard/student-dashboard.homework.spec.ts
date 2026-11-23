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
import { HomeworkClasswork } from '../../interfaces/homework';
import { ClassUpdateService } from '../../services/class-update.service';
import { AssessmentService } from '../../services/assessment.service';

/** The dashboard's compact homework section — isolated from the rest of the dashboard load. */
describe("StudentDashboardComponent — Today's Homework & Classwork", () => {
  let fixture: ComponentFixture<StudentDashboardComponent>;
  let component: StudentDashboardComponent;
  let homework: jasmine.SpyObj<HomeworkService>;

  const item = (id: number, subject: string): HomeworkClasswork => ({
    id, workDate: '2026-09-23', classId: 8, className: '8', sectionId: 3, sectionName: 'A', subjectName: subject,
    teacherId: 'T1', teacherName: 'Ms Rao', timetableEntryId: id, classwork: null, homework: `${subject} homework`,
    dueDate: null, attachments: [],
    createdAt: '2026-09-23T09:00:00', updatedAt: '2026-09-23T09:00:00', canEdit: false,
  });

  beforeEach(() => {
    homework = jasmine.createSpyObj('HomeworkService', ['studentOn']);
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
        { provide: HomeworkService, useValue: homework },
        { provide: ClassUpdateService, useValue: {} },
        { provide: AssessmentService, useValue: {} },
      ],
    });
    fixture = TestBed.createComponent(StudentDashboardComponent);
    component = fixture.componentInstance;
    component.isLoading = false;
  });

  function render(): HTMLElement {
    component.loadTodayHomework();
    fixture.detectChanges();
    return fixture.nativeElement;
  }

  it('shows at most three items and a View all link to the homework page', () => {
    homework.studentOn.and.returnValue(of([item(1, 'Science'), item(2, 'Maths'), item(3, 'English'), item(4, 'Hindi')]));
    const el = render();
    expect(el.querySelectorAll('.sd-hw-item').length).toBe(3);
    expect(el.textContent).toContain('Science · Homework');
    expect(el.textContent).toContain('View all 4');
    expect(el.querySelector('a[href="/dashboard/homework"]')).toBeTruthy();
  });

  it('shows a calm empty state when nothing is posted today', () => {
    homework.studentOn.and.returnValue(of([]));
    expect(render().textContent).toContain('Nothing posted for today yet.');
  });

  it('a homework outage is contained to its own section', () => {
    homework.studentOn.and.returnValue(throwError(() => new Error('offline')));
    const el = render();
    expect(component.homeworkFailed).toBeTrue();
    expect(el.textContent).toContain('Homework is temporarily unavailable.');
  });
});
