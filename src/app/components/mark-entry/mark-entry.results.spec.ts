import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { MarkEntryComponent } from './mark-entry.component';
import { MarksService } from '../../services/marks.service';
import { ExamConfigService, ExamConfig } from '../../services/exam-config.service';
import { AuthStateService } from '../../auth/auth-state.service';
import { TeacherService } from '../../services/teacher.service';
import { StudentService } from '../../services/student.service';
import { AcademicSessionService } from '../../services/academic-session.service';
import { LoggerService } from '../../services/logger.service';
import { ToastService } from '../../services/toast.service';
import { SchoolService } from '../../services/school.service';
import { SectionService } from '../../services/section.service';

describe('MarkEntryComponent — draft/published and validation', () => {
  let fixture: ComponentFixture<MarkEntryComponent>;
  let marks: jasmine.SpyObj<MarksService>;
  let toast: jasmine.SpyObj<ToastService>;

  const exam = (status: 'DRAFT' | 'PUBLISHED'): ExamConfig =>
    ({ id: 7, session: '2026-2027', className: '8', examName: 'Unit Test 1', resultStatus: status });

  function create(role: string): MarkEntryComponent {
    TestBed.overrideProvider(AuthStateService, { useValue: { getUser: () => ({ userId: 'U1', role }) } });
    fixture = TestBed.createComponent(MarkEntryComponent);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  beforeEach(() => {
    marks = jasmine.createSpyObj('MarksService', ['saveBulkMarks', 'getStudentsForSubject', 'getSubjectsForStudent']);
    toast = jasmine.createSpyObj('ToastService', ['confirm', 'success', 'error', 'warning', 'info']);
    TestBed.configureTestingModule({
      imports: [MarkEntryComponent],
      providers: [
        { provide: MarksService, useValue: marks },
        { provide: ExamConfigService, useValue: { getExams: () => of([]), getExamSubjects: () => of([]) } },
        { provide: ToastService, useValue: toast },
        { provide: AuthStateService, useValue: { getUser: () => null } },
        { provide: TeacherService, useValue: { getTeacher: () => of({ classTeacher: '8' }) } },
        { provide: StudentService, useValue: {} },
        { provide: AcademicSessionService, useValue: { getAllSessions: () => of([{ label: '2026-2027', current: true }]) } },
        { provide: LoggerService, useValue: jasmine.createSpyObj('LoggerService', ['error', 'warn', 'info', 'debug', 'log']) },
        { provide: SchoolService, useValue: { getClasses: () => of(['8']), getManagedClasses: () => of([{ id: 1, name: '8' }]) } },
        { provide: SectionService, useValue: { getSectionsForClass: () => of([{ id: 3, name: 'A' }]) } },
      ],
    });
  });

  function withSubject(c: MarkEntryComponent, status: 'DRAFT' | 'PUBLISHED'): void {
    c.exams = [exam(status)];
    c.selectedExamId = 7;
    c.examSubjects = [{ id: 11, subjectName: 'Maths', maxMarks: 50 } as any];
    c.selectedSubjectEntryId = 11;
    c.subjectStudents = [{ studentId: 'S1', studentName: 'Aarav', marksObtained: null }, { studentId: 'S2', studentName: 'Bina', marksObtained: null }];
  }

  it('a published exam is locked: save is refused before any request', async () => {
    const c = create('ADMIN');
    withSubject(c, 'PUBLISHED');
    c.marksInputA = { S1: 40 };
    expect(c.examLocked).toBeTrue();
    await c.saveMarksA();
    expect(toast.warning).toHaveBeenCalledWith('Results Published', jasmine.stringContaining('unpublish'));
    expect(marks.saveBulkMarks).not.toHaveBeenCalled();
  });

  it('a draft exam is editable', () => {
    const c = create('ADMIN');
    withSubject(c, 'DRAFT');
    expect(c.examLocked).toBeFalse();
  });

  it('maps a rejected save to per-row errors and reports that nothing was saved', async () => {
    const c = create('TEACHER');
    withSubject(c, 'DRAFT');
    c.marksInputA = { S1: 40, S2: 45 };
    toast.confirm.and.resolveTo(true);
    marks.saveBulkMarks.and.returnValue(throwError(() => ({
      status: 400,
      error: { message: '1 mark could not be saved.', errors: [{ index: 1, studentId: 'S2', examSubjectEntryId: 11, reason: 'Student is not enrolled in this subject' }] },
    })));
    await c.saveMarksA();
    expect(c.rowError('S2', 11)).toBe('Student is not enrolled in this subject');
    expect(c.rowError('S1', 11)).toBeNull();
    expect(c.saving).toBeFalse();
    expect(toast.error).toHaveBeenCalledWith('Nothing was saved', jasmine.stringContaining('highlighted rows'));
  });

  it('warns before leaving with unsaved marks', () => {
    const c = create('ADMIN');
    withSubject(c, 'DRAFT');
    const clean = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
    c.warnBeforeLeaving(clean);
    expect(clean.defaultPrevented).toBeFalse();
    c.marksInputA = { S1: 12 };
    const dirty = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
    c.warnBeforeLeaving(dirty);
    expect(dirty.defaultPrevented).toBeTrue();
  });

  it('flags teachers so the "All Sections" chips are hidden', () => {
    expect(create('TEACHER').isTeacher).toBeTrue();
  });
});

describe('MarkEntryComponent — loading, empty and error states', () => {
  let fixture: ComponentFixture<MarkEntryComponent>;
  let marks: jasmine.SpyObj<MarksService>;
  let students: jasmine.SpyObj<StudentService>;
  let examSubjects$: Subject<any[]>;

  function create(): MarkEntryComponent {
    marks = jasmine.createSpyObj('MarksService', ['saveBulkMarks', 'getStudentsForSubject', 'getSubjectsForStudent']);
    students = jasmine.createSpyObj('StudentService', ['getActiveStudentsByClass']);
    examSubjects$ = new Subject<any[]>();
    TestBed.configureTestingModule({
      imports: [MarkEntryComponent],
      providers: [
        { provide: MarksService, useValue: marks },
        { provide: ExamConfigService, useValue: { getExams: () => of([]), getExamSubjects: () => examSubjects$ } },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['confirm', 'success', 'error', 'warning', 'info']) },
        { provide: AuthStateService, useValue: { getUser: () => ({ userId: 'U1', role: 'ADMIN' }) } },
        { provide: TeacherService, useValue: {} },
        { provide: StudentService, useValue: students },
        { provide: AcademicSessionService, useValue: { getAllSessions: () => of([{ label: '2026-2027', current: true }]) } },
        { provide: LoggerService, useValue: jasmine.createSpyObj('LoggerService', ['error', 'warn', 'info', 'debug', 'log']) },
        { provide: SchoolService, useValue: { getClasses: () => of(['8']), getManagedClasses: () => of([]) } },
        { provide: SectionService, useValue: { getSectionsForClass: () => of([]) } },
      ],
    });
    fixture = TestBed.createComponent(MarkEntryComponent);
    fixture.detectChanges();
    const c = fixture.componentInstance;
    c.exams = [{ id: 7, session: '2026-2027', className: '8', examName: 'Unit Test 1', resultStatus: 'DRAFT' }];
    c.selectedExamId = 7;
    c.examSubjects = [{ id: 11, subjectName: 'Maths', maxMarks: 50 } as any];
    return c;
  }

  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent ?? '';

  it('By Subject: shows the skeleton, not "No students found", while loading', () => {
    const c = create();
    const response = new Subject<any[]>();
    marks.getStudentsForSubject.and.returnValue(response);
    c.selectedSubjectEntryId = 11;
    c.onSubjectChange();
    fixture.detectChanges();

    expect(c.subjectStudentsState).toBe('loading');
    expect(el().querySelector('.me-skeleton')).not.toBeNull();
    expect(el().querySelectorAll('.me-sk-row').length).toBe(5);
    expect(text()).not.toContain('No students found');
    expect(el().querySelector('.me-table')).toBeNull();

    response.next([{ studentId: 'S1', studentName: 'Aarav', marksObtained: 40 }]);
    fixture.detectChanges();
    expect(el().querySelector('.me-skeleton')).toBeNull();
    expect(el().querySelectorAll('.me-table tbody tr').length).toBe(1);
    expect(text()).not.toContain('No students found');
  });

  it('By Subject: "No students found" only after a successful empty response', () => {
    const c = create();
    marks.getStudentsForSubject.and.returnValue(of([]));
    c.selectedSubjectEntryId = 11;
    c.onSubjectChange();
    fixture.detectChanges();
    expect(c.subjectStudentsState).toBe('loaded');
    expect(el().querySelector('.me-skeleton')).toBeNull();
    expect(text()).toContain('No students found');
  });

  it('By Subject: a failed request shows an error with retry, never the empty state', () => {
    const c = create();
    marks.getStudentsForSubject.and.returnValue(throwError(() => new Error('offline')));
    c.selectedSubjectEntryId = 11;
    c.onSubjectChange();
    fixture.detectChanges();
    expect(c.subjectStudentsState).toBe('error');
    expect(text()).not.toContain('No students found');
    expect(el().querySelector('.me-load-error')).not.toBeNull();

    marks.getStudentsForSubject.and.returnValue(of([{ studentId: 'S1', studentName: 'Aarav', marksObtained: null }]));
    (el().querySelector('.me-retry') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(c.subjectStudentsState).toBe('loaded');
    expect(el().querySelectorAll('.me-table tbody tr').length).toBe(1);
  });

  it('By Subject: a late answer for a previous subject is ignored', () => {
    const c = create();
    const first = new Subject<any[]>();
    marks.getStudentsForSubject.and.returnValue(first);
    c.selectedSubjectEntryId = 11;
    c.onSubjectChange();
    marks.getStudentsForSubject.and.returnValue(new Subject<any[]>());
    c.selectedSubjectEntryId = 12;
    c.onSubjectChange();
    first.next([{ studentId: 'OLD', studentName: 'Old', marksObtained: 1 }]);
    expect(c.subjectStudents).toEqual([]);
    expect(c.subjectStudentsState).toBe('loading');
  });

  it('By Student: skeleton while loading, then the subjects; empty only after an empty load', () => {
    const c = create();
    c.mode = 'student';
    c.students = [{ studentId: 'S1', name: 'Aarav' }];
    c.studentsState = 'loaded';
    const response = new Subject<any[]>();
    marks.getSubjectsForStudent.and.returnValue(response);
    c.selectedStudentId = 'S1';
    c.onStudentChange();
    fixture.detectChanges();
    expect(el().querySelector('.me-skeleton')).not.toBeNull();
    expect(text()).not.toContain('No subjects found');

    response.next([]);
    fixture.detectChanges();
    expect(el().querySelector('.me-skeleton')).toBeNull();
    expect(text()).toContain('No subjects found');
  });

  it('By Student: the student list shows loading, then an error state if it fails', () => {
    const c = create();
    c.mode = 'student';
    students.getActiveStudentsByClass.and.returnValue(of([]));
    c.onExamChange();
    fixture.detectChanges();
    expect(c.studentsState).toBe('loading');
    const select = el().querySelector('.me-subject-filter select') as HTMLSelectElement;
    expect(select.options[0].textContent!.trim()).toBe('Loading students…');

    examSubjects$.error(new Error('offline'));
    fixture.detectChanges();
    expect(c.studentsState).toBe('error');
    expect(el().querySelector('.me-load-error')).not.toBeNull();
  });
});
