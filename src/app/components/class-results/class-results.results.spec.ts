import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ClassResultsComponent } from './class-results.component';
import { MarksService, ClassStudentResult } from '../../services/marks.service';
import { ExamConfigService, ExamConfig } from '../../services/exam-config.service';
import { ToastService } from '../../services/toast.service';
import { AuthStateService } from '../../auth/auth-state.service';
import { TeacherService } from '../../services/teacher.service';
import { AcademicSessionService } from '../../services/academic-session.service';
import { LoggerService } from '../../services/logger.service';
import { SchoolService } from '../../services/school.service';
import { SectionService } from '../../services/section.service';

describe('ClassResultsComponent — results publishing', () => {
  let fixture: ComponentFixture<ClassResultsComponent>;
  let marks: jasmine.SpyObj<MarksService>;
  let exams: jasmine.SpyObj<ExamConfigService>;
  let toast: jasmine.SpyObj<ToastService>;

  const exam = (status: 'DRAFT' | 'PUBLISHED'): ExamConfig =>
    ({ id: 7, session: '2026-2027', className: '8', examName: 'Unit Test 1', resultStatus: status });

  const row = (o: Partial<ClassStudentResult>): ClassStudentResult => ({
    studentId: 'S1', studentName: 'Aarav', sectionName: 'A', subjects: [], totalMarksObtained: 80, totalMaxMarks: 100,
    percentage: 80, rank: 1, resultStatus: 'DRAFT', complete: true, marksMissing: 0, grade: 'A2', passed: true, ...o,
  });

  const results = [
    row({}),
    row({ studentId: 'S2', studentName: 'Bina', totalMarksObtained: 20, percentage: 20, rank: 2, grade: 'E', passed: false }),
    row({ studentId: 'S3', studentName: 'Chetan', totalMarksObtained: 40, percentage: null, rank: null, complete: false, marksMissing: 1, grade: null, passed: null }),
  ];

  function render(role: string, status: 'DRAFT' | 'PUBLISHED'): HTMLElement {
    TestBed.overrideProvider(AuthStateService, { useValue: { getUser: () => ({ userId: 'U1', role }) } });
    exams.getExams.and.returnValue(of([exam(status)]));
    fixture = TestBed.createComponent(ClassResultsComponent);
    fixture.detectChanges();
    const c = fixture.componentInstance;
    c.selectedExamId = 7;
    c.onExamChange();
    fixture.detectChanges();
    return fixture.nativeElement;
  }

  beforeEach(() => {
    marks = jasmine.createSpyObj('MarksService', ['getClassResults']);
    marks.getClassResults.and.returnValue(of(results));
    exams = jasmine.createSpyObj('ExamConfigService', ['getExams', 'getExamSubjects', 'publishResults', 'unpublishResults']);
    exams.getExamSubjects.and.returnValue(of([]));
    toast = jasmine.createSpyObj('ToastService', ['confirm', 'success', 'error', 'warning', 'info']);
    TestBed.configureTestingModule({
      imports: [ClassResultsComponent],
      providers: [
        provideRouter([]),
        { provide: MarksService, useValue: marks },
        { provide: ExamConfigService, useValue: exams },
        { provide: ToastService, useValue: toast },
        { provide: AuthStateService, useValue: { getUser: () => null } },
        { provide: TeacherService, useValue: { getTeacher: () => of({ classTeacher: '8' }) } },
        { provide: AcademicSessionService, useValue: { getAllSessions: () => of([{ label: '2026-2027', current: true }]) } },
        { provide: LoggerService, useValue: jasmine.createSpyObj('LoggerService', ['error', 'warn', 'info', 'debug', 'log']) },
        { provide: SchoolService, useValue: { getClasses: () => of(['8']), getManagedClasses: () => of([{ id: 1, name: '8' }]) } },
        { provide: SectionService, useValue: { getSectionsForClass: () => of([{ id: 3, name: 'A' }, { id: 4, name: 'B' }]) } },
      ],
    });
  });

  it('admin sees Draft status, counts and the Publish action', () => {
    const el = render('ADMIN', 'DRAFT');
    expect(el.querySelector('.cr-status-badge')!.textContent!.trim()).toBe('Draft');
    expect(el.querySelector('.cr-status-text')!.textContent).toContain('2 complete');
    expect(el.querySelector('.cr-status-text')!.textContent).toContain('1 with marks missing');
    expect(el.querySelector('.cr-status-text')!.textContent).toContain('1 passed');
    expect(el.querySelector('.cr-btn-publish')).not.toBeNull();
    expect(el.querySelector('.cr-btn-unpublish')).toBeNull();
    expect(el.querySelector('.cr-section-chips')).not.toBeNull();
  });

  it('admin sees Unpublish on a published exam', () => {
    const el = render('ADMIN', 'PUBLISHED');
    expect(el.querySelector('.cr-status-badge')!.textContent!.trim()).toBe('Published');
    expect(el.querySelector('.cr-btn-unpublish')).not.toBeNull();
    expect(el.querySelector('.cr-btn-publish')).toBeNull();
  });

  it('teacher gets no publish action and no "All Sections" chip', () => {
    const el = render('TEACHER', 'DRAFT');
    expect(el.querySelector('.cr-status-badge')!.textContent!.trim()).toBe('Draft');
    expect(el.querySelector('.cr-btn-publish')).toBeNull();
    expect(el.querySelector('.cr-btn-unpublish')).toBeNull();
    expect(el.querySelector('.cr-section-chips')).toBeNull();
  });

  it('shows backend rank, grade, pass/fail and marks-missing without recomputing', () => {
    const el = render('ADMIN', 'DRAFT');
    const rows = Array.from(el.querySelectorAll('tbody tr'));
    expect(rows.map(r => r.querySelector('.cr-cell-rank')!.textContent!.trim())).toEqual(['1', '2', '—']);
    expect(rows[0].querySelector('.cr-cell-result')!.textContent).toContain('A2');
    expect(rows[0].querySelector('.cr-cell-result')!.textContent).toContain('Pass');
    expect(rows[1].querySelector('.cr-fail')!.textContent!.trim()).toBe('Fail');
    expect(rows[2].querySelector('.cr-cell-result')!.textContent!.trim()).toBe('Incomplete');
    expect(rows[2].querySelector('.cr-missing')!.textContent!.trim()).toBe('1 mark missing');
    expect(rows[2].querySelector('.cr-pct')).toBeNull();
  });

  it('publish confirms, calls the API and refreshes the status', async () => {
    const el = render('ADMIN', 'DRAFT');
    toast.confirm.and.resolveTo(true);
    exams.publishResults.and.returnValue(of(exam('PUBLISHED')));
    await fixture.componentInstance.publish();
    fixture.detectChanges();
    expect(toast.confirm.calls.mostRecent().args[0].message).toContain('1 student(s) still have marks missing');
    expect(exams.publishResults).toHaveBeenCalledWith(7);
    expect(el.querySelector('.cr-status-badge')!.textContent!.trim()).toBe('Published');
  });

  it('publish is a no-op for a teacher even if invoked', async () => {
    render('TEACHER', 'DRAFT');
    await fixture.componentInstance.publish();
    expect(toast.confirm).not.toHaveBeenCalled();
    expect(exams.publishResults).not.toHaveBeenCalled();
  });
});

describe('ClassResultsComponent — selection survives a report-card round trip', () => {
  let router: { navigate: jasmine.Spy; url: string };
  let marks: jasmine.SpyObj<MarksService>;
  let exams: jasmine.SpyObj<ExamConfigService>;

  function create(role: string, query: Record<string, string>): ClassResultsComponent {
    router = { navigate: jasmine.createSpy('navigate').and.resolveTo(true), url: '/dashboard/class-results?examId=7' };
    marks = jasmine.createSpyObj('MarksService', ['getClassResults']);
    marks.getClassResults.and.returnValue(of([]));
    exams = jasmine.createSpyObj('ExamConfigService', ['getExams', 'getExamSubjects', 'publishResults', 'unpublishResults']);
    exams.getExams.and.returnValue(of([
      { id: 7, session: '2025-2026', className: '9', examName: 'Half Yearly', resultStatus: 'DRAFT' },
      { id: 8, session: '2025-2026', className: '9', examName: 'Annual', resultStatus: 'DRAFT' },
    ] as ExamConfig[]));
    exams.getExamSubjects.and.returnValue(of([]));
    TestBed.configureTestingModule({
      imports: [ClassResultsComponent],
      providers: [
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
        { provide: MarksService, useValue: marks },
        { provide: ExamConfigService, useValue: exams },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['confirm', 'success', 'error']) },
        { provide: AuthStateService, useValue: { getUser: () => ({ userId: 'U1', role }) } },
        { provide: TeacherService, useValue: { getTeacher: () => of({ classTeacher: '8' }) } },
        { provide: AcademicSessionService, useValue: { getAllSessions: () => of([{ label: '2025-2026', current: false }, { label: '2026-2027', current: true }]) } },
        { provide: LoggerService, useValue: jasmine.createSpyObj('LoggerService', ['error']) },
        { provide: SchoolService, useValue: { getClasses: () => of(['8', '9']), getManagedClasses: () => of([{ id: 1, name: '9' }]) } },
        { provide: SectionService, useValue: { getSectionsForClass: () => of([{ id: 3, name: 'A' }, { id: 4, name: 'B' }]) } },
      ],
    });
    const fixture = TestBed.createComponent(ClassResultsComponent);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('restores session, class, exam and section from the URL and reloads the results', () => {
    const c = create('ADMIN', { session: '2025-2026', className: '9', examId: '8', sectionId: '4' });
    expect(c.selectedSession).toBe('2025-2026');
    expect(c.selectedClass).toBe('9');
    expect(c.selectedExamId).toBe(8);
    expect(c.selectedSectionId).toBe(4);
    expect(exams.getExams).toHaveBeenCalledWith('2025-2026', '9');
    expect(marks.getClassResults).toHaveBeenCalledWith('9', 8, 4);
  });

  it('mirrors every selection into the URL, replacing the history entry', () => {
    const c = create('ADMIN', {});
    c.selectedExamId = 7;
    c.onExamChange();
    c.onSectionSelect(3);
    const [commands, extras] = router.navigate.calls.mostRecent().args;
    expect(commands).toEqual([]);
    expect(extras.replaceUrl).toBeTrue();
    expect(extras.queryParams).toEqual({ session: '2026-2027', className: '8', examId: 7, sectionId: 3 });
  });

  it('ignores an exam id that is not in the selected class and session', () => {
    const c = create('ADMIN', { session: '2025-2026', className: '9', examId: '999' });
    expect(c.selectedExamId).toBeNull();
    expect(marks.getClassResults).not.toHaveBeenCalled();
  });

  it('a teacher keeps their own class and section even if the URL says otherwise', () => {
    const c = create('TEACHER', { session: '2026-2027', className: '9', examId: '7', sectionId: '4' });
    expect(c.selectedClass).toBe('8');
    expect(exams.getExams).toHaveBeenCalledWith('2026-2027', '8');
    expect(c.selectedExamId).toBe(7);
    expect(c.selectedSectionId).toBeNull();
    expect(c.isAdmin).toBeFalse();
  });

  it('opens the report card with a returnUrl back to this exact selection', () => {
    const c = create('ADMIN', { session: '2025-2026', className: '9', examId: '8' });
    c.openReportCard('S1', 8);
    const [commands, extras] = router.navigate.calls.mostRecent().args;
    expect(commands).toEqual(['/dashboard/report-card']);
    expect(extras.queryParams).toEqual({ studentId: 'S1', session: '2025-2026', examId: '8', returnUrl: '/dashboard/class-results?examId=7' });
  });
});
