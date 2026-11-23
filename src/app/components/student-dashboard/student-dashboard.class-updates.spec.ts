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
import { ClassUpdate } from '../../interfaces/class-update';

/** The dashboard's compact Class Updates section — isolated from the rest of the dashboard load. */
describe('StudentDashboardComponent — Class Updates', () => {
  let fixture: ComponentFixture<StudentDashboardComponent>;
  let component: StudentDashboardComponent;
  let classUpdates: jasmine.SpyObj<ClassUpdateService>;

  const item = (id: number, title: string, subjectName: string | null = 'Science'): ClassUpdate => ({
    id, classId: 8, className: '8', sectionId: 3, sectionName: 'A', subjectName, teacherId: 'T1', teacherName: 'Ms Rao',
    title, message: 'Details', attachment: null, expiresAt: null, expired: false,
    createdAt: '2026-09-23T09:00:00', updatedAt: '2026-09-23T09:00:00', canEdit: false,
  });

  beforeEach(() => {
    classUpdates = jasmine.createSpyObj('ClassUpdateService', ['studentActive']);
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
        { provide: ClassUpdateService, useValue: classUpdates },
        { provide: AssessmentService, useValue: {} },
      ],
    });
    fixture = TestBed.createComponent(StudentDashboardComponent);
    component = fixture.componentInstance;
    component.isLoading = false;
    component.homeworkLoading = false;
  });

  function render(): HTMLElement {
    component.loadClassUpdates();
    fixture.detectChanges();
    return fixture.nativeElement;
  }

  it('requests at most three active updates and shows them with a View all link', () => {
    classUpdates.studentActive.and.returnValue(of([item(1, 'Unit test Friday'), item(2, 'Lab day'), item(3, 'Trip', null), item(4, 'Extra')]));
    const el = render();
    expect(classUpdates.studentActive).toHaveBeenCalledOnceWith(3);
    expect(el.querySelectorAll('.sd-cu-item').length).toBe(3);
    expect(el.textContent).toContain('Unit test Friday');
    expect(el.textContent).toContain('Science · Ms Rao');
    expect(el.textContent).toContain('Class 8 · Ms Rao');
    expect(el.querySelector('a[href="/dashboard/class-updates"]')).toBeTruthy();
  });

  it('shows a calm empty state', () => {
    classUpdates.studentActive.and.returnValue(of([]));
    expect(render().textContent).toContain('No class updates right now.');
  });

  it('a class updates outage is contained to its own section', () => {
    classUpdates.studentActive.and.returnValue(throwError(() => new Error('offline')));
    const el = render();
    expect(component.classUpdatesFailed).toBeTrue();
    expect(el.textContent).toContain('Class updates are temporarily unavailable.');
  });
});
