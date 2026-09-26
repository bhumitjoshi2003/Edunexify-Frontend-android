import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { StudentResultsComponent } from './student-results.component';
import { MarksService, ExamResult } from '../../services/marks.service';
import { AuthStateService } from '../../auth/auth-state.service';
import { AcademicSessionService } from '../../services/academic-session.service';
import { ParentPortalService } from '../../services/parent-portal.service';
import { ToastService } from '../../services/toast.service';
import { LoggerService } from '../../services/logger.service';

describe('StudentResultsComponent — published results', () => {
  let fixture: ComponentFixture<StudentResultsComponent>;
  let marks: jasmine.SpyObj<MarksService>;

  const result = (o: Partial<ExamResult>): ExamResult => ({
    examId: 1, examName: 'Unit Test 1', className: '8', session: '2026-2027', studentName: 'Aarav', subjects: [],
    totalMarksObtained: 30, totalMaxMarks: 100, percentage: 30, overallRank: 4, resultStatus: 'PUBLISHED',
    complete: true, marksMissing: 0, grade: 'E', passed: false, ...o,
  });

  function render(data: ExamResult[]): HTMLElement {
    marks.getStudentResults.and.returnValue(of(data));
    fixture = TestBed.createComponent(StudentResultsComponent);
    fixture.detectChanges();
    return fixture.nativeElement;
  }

  beforeEach(() => {
    marks = jasmine.createSpyObj('MarksService', ['getStudentResults']);
    TestBed.configureTestingModule({
      imports: [StudentResultsComponent],
      providers: [
        provideRouter([]),
        { provide: MarksService, useValue: marks },
        { provide: AuthStateService, useValue: { getUserRole: () => 'STUDENT', getUserId: () => 'S1' } },
        { provide: AcademicSessionService, useValue: { getAllSessions: () => of([{ label: '2026-2027', current: true }]) } },
        { provide: ParentPortalService, useValue: {} },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['error', 'success', 'info', 'warning']) },
        { provide: LoggerService, useValue: jasmine.createSpyObj('LoggerService', ['error', 'warn', 'info', 'debug', 'log']) },
      ],
    });
  });

  it('shows a clean empty state when nothing is published', () => {
    const el = render([]);
    expect(marks.getStudentResults).toHaveBeenCalledWith('S1', '2026-2027');
    expect(el.querySelector('.sr-empty-title')!.textContent!.trim()).toBe('No published results yet');
  });

  it('uses the backend grade, fail flag and rank', () => {
    const el = render([result({})]);
    const badges = Array.from(el.querySelectorAll('.sr-grade-badge')).map(b => b.textContent!.trim());
    expect(badges).toEqual(['E', 'Fail']);
    expect(el.querySelector('.sr-rank-badge')!.textContent!.trim()).toBe('Rank 4');
    expect(el.querySelector('.sr-chip-pending')).toBeNull();
  });

  it('an incomplete result shows pending, no grade/rank, and is excluded from averages', () => {
    const el = render([
      result({ examId: 2, examName: 'Half Yearly', percentage: null, overallRank: null, complete: false, marksMissing: 2, grade: null, passed: null }),
      result({ percentage: 80, grade: 'A2', passed: true, overallRank: 1 }),
    ]);
    expect(el.querySelector('.sr-chip-pending')).not.toBeNull();
    expect(el.querySelectorAll('.sr-rank-badge').length).toBe(1);
    expect(fixture.componentInstance.completeResults.map(r => r.examId)).toEqual([1]);
  });
});
