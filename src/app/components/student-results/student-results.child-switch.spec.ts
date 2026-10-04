import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { of, Subject } from 'rxjs';
import { StudentResultsComponent } from './student-results.component';
import { MarksService, ExamResult } from '../../services/marks.service';
import { AuthStateService } from '../../auth/auth-state.service';
import { AcademicSessionService } from '../../services/academic-session.service';
import { ParentPortalService } from '../../services/parent-portal.service';
import { ToastService } from '../../services/toast.service';
import { LoggerService } from '../../services/logger.service';
import { ChildAccess } from '../../interfaces/parent-portal';

/** Parent Lifecycle Phase 1: switching child cancels the previous child's request — a late answer never lands on the new child. */
describe('StudentResultsComponent — parent switching children', () => {
  let fixture: ComponentFixture<StudentResultsComponent>;
  let component: StudentResultsComponent;
  let marks: jasmine.SpyObj<MarksService>;
  let toast: jasmine.SpyObj<ToastService>;
  const responses: Record<string, Subject<ExamResult[]>> = {};

  const child = (id: string, o: Partial<ChildAccess> = {}): ChildAccess => ({
    relationshipId: 1, studentId: id, studentName: id, className: '5', sectionName: null, relationshipType: 'MOTHER',
    primaryGuardian: true, canViewAttendance: true, canViewFees: true, canPayFees: true, canViewResults: true,
    canViewTimetable: true, canManageLeave: true, effectiveFrom: '2026-04-01', effectiveUntil: null, ...o,
  });
  const result = (studentName: string): ExamResult => ({
    examId: 1, examName: 'Unit Test 1', className: '5', session: '2026-2027', studentName, subjects: [],
    totalMarksObtained: 30, totalMaxMarks: 100, percentage: 30, overallRank: 4, resultStatus: 'PUBLISHED',
    complete: true, marksMissing: 0, grade: 'E', passed: false,
  } as ExamResult);

  function setup(requested: string): void {
    marks = jasmine.createSpyObj('MarksService', ['getStudentResults']);
    marks.getStudentResults.and.callFake((studentId: string) => (responses[studentId] = new Subject<ExamResult[]>()));
    toast = jasmine.createSpyObj('ToastService', ['error', 'success', 'info', 'warning']);
    TestBed.configureTestingModule({
      imports: [StudentResultsComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ studentId: requested }) } } },
        { provide: Router, useValue: jasmine.createSpyObj('Router', ['navigate']) },
        { provide: MarksService, useValue: marks },
        { provide: AuthStateService, useValue: { getUserRole: () => 'PARENT', getUserId: () => 'par_1' } },
        { provide: AcademicSessionService, useValue: { getAllSessions: () => of([{ label: '2026-2027', current: true }]) } },
        { provide: ParentPortalService, useValue: { getMyProfile: () => of({
          parent: { parentId: 'par_1', name: 'Mum', email: null, phoneNumber: '1', active: true, linkedChildren: 2 },
          children: [child('A'), child('B')] }) } },
        { provide: ToastService, useValue: toast },
        { provide: LoggerService, useValue: jasmine.createSpyObj('LoggerService', ['error', 'warn', 'info', 'debug', 'log']) },
      ],
    });
    fixture = TestBed.createComponent(StudentResultsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it("a late answer for child A never replaces child B's results", () => {
    setup('A');
    expect(marks.getStudentResults).toHaveBeenCalledWith('A', '2026-2027');

    component.onChildTabSelected(child('B'));
    responses['B'].next([result('Child B')]);
    responses['A'].next([result('Child A')]);          // arrives after the switch

    expect(component.studentId).toBe('B');
    expect(component.results.map(r => r.studentName)).toEqual(['Child B']);
    expect(responses['A'].observed).toBeFalse();       // the request for A was cancelled
  });

  it('a deep link to a child the parent can no longer access loads nothing and says so', () => {
    setup('GONE');
    expect(toast.error).toHaveBeenCalledWith('Student unavailable', 'You no longer have access to this student.');
    expect(component.studentId).toBe('GONE');          // kept, so the switcher can offer the other children
    expect(component.childUnavailable).toBeTrue();
    expect(component.results).toEqual([]);
  });
});
