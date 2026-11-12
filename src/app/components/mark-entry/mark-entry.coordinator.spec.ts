import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { MarkEntryComponent } from './mark-entry.component';
import { MarksService } from '../../services/marks.service';
import { ExamConfigService } from '../../services/exam-config.service';
import { AuthStateService } from '../../auth/auth-state.service';
import { TeacherService } from '../../services/teacher.service';
import { StudentService } from '../../services/student.service';
import { AcademicSessionService } from '../../services/academic-session.service';
import { LoggerService } from '../../services/logger.service';
import { ToastService } from '../../services/toast.service';
import { SchoolService } from '../../services/school.service';
import { SectionService } from '../../services/section.service';
import { CoordinatorService } from '../../services/coordinator.service';

/**
 * Shared by the web and Android clients — keep the two copies identical.
 * Mark corrections in the Coordinator workspace: the classes the Coordinator covers (not only their
 * class-teacher class), only covered sections, a reason, and the Coordinator corrections endpoint.
 */
describe('MarkEntryComponent — Coordinator workspace', () => {
  const user = { userId: 'emp_1', role: 'TEACHER', coordinator: true, schoolSlug: 'demo' };
  const key = 'edunexify.workspace.v1.demo.emp_1';
  let fixture: ComponentFixture<MarkEntryComponent>;
  let marks: jasmine.SpyObj<MarksService>;
  let toast: jasmine.SpyObj<ToastService>;
  let teachers: jasmine.SpyObj<TeacherService>;
  let wholeClass = true;

  function create(): MarkEntryComponent {
    fixture = TestBed.createComponent(MarkEntryComponent);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  beforeEach(() => {
    wholeClass = true;
    marks = jasmine.createSpyObj('MarksService', ['saveBulkMarks', 'correctMarks', 'coordinatorCorrectMarks', 'getStudentsForSubject', 'getSubjectsForStudent']);
    marks.coordinatorCorrectMarks.and.returnValue(of({ saved: 0, updated: 1, errors: [] } as any));
    toast = jasmine.createSpyObj('ToastService', ['confirm', 'success', 'error', 'warning', 'info']);
    toast.confirm.and.resolveTo(true);
    teachers = jasmine.createSpyObj('TeacherService', ['getTeacher']);
    teachers.getTeacher.and.returnValue(of({ classTeacher: '10' } as any));
    TestBed.configureTestingModule({
      imports: [MarkEntryComponent],
      providers: [
        { provide: MarksService, useValue: marks },
        { provide: ExamConfigService, useValue: { getExams: () => of([]), getExamSubjects: () => of([]) } },
        { provide: ToastService, useValue: toast },
        { provide: AuthStateService, useValue: { getUser: () => user, getUserRole: () => 'TEACHER', isCoordinator: () => true } },
        { provide: TeacherService, useValue: teachers },
        { provide: StudentService, useValue: {} },
        { provide: AcademicSessionService, useValue: { getAllSessions: () => of([{ label: '2026-2027', current: true }]) } },
        { provide: LoggerService, useValue: jasmine.createSpyObj('LoggerService', ['error', 'warn', 'info', 'debug', 'log']) },
        { provide: SchoolService, useValue: {
          getClasses: () => of(['1', '6', '7', '8', '10']),
          getManagedClasses: () => of([{ id: 6, name: '6' }, { id: 7, name: '7' }, { id: 8, name: '8' }, { id: 10, name: '10' }]) } },
        { provide: SectionService, useValue: { getSectionsForClass: () => of([{ id: 81, name: 'A' }, { id: 82, name: 'B' }]) } },
        { provide: CoordinatorService, useValue: {
          restrictToScopedClassNames: (names: string[]) => of(names.filter(n => ['6', '7', '8'].includes(n))),
          sectionScope: () => of({ wholeClass, sectionIds: wholeClass ? [] : [81] }) } },
      ],
    });
  });

  afterEach(() => localStorage.removeItem(key));

  it('offers the covered classes with a class choice instead of locking to the class-teacher class', () => {
    const c = create();
    expect(c.classOptions).toEqual(['6', '7', '8']);
    expect(c.selectedClass).toBe('6');
    expect(c.isTeacher).toBeFalse();
    expect(teachers.getTeacher).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.me-class-badge')).toBeNull();
    expect(fixture.nativeElement.querySelector('#mark-correction-reason')).not.toBeNull();
  });

  it('only covered sections, without "All Sections", when part of the class is covered', () => {
    wholeClass = false;
    const c = create();
    expect(c.sections.map(s => s.id)).toEqual([81]);
    expect(c.allSectionsAllowed).toBeFalse();
    expect(c.selectedSectionId).toBe(81);
  });

  it('saves through the Coordinator corrections endpoint and only with a reason', async () => {
    const c = create();
    c.exams = [{ id: 7, session: '2026-2027', className: '6', examName: 'Unit Test', resultStatus: 'DRAFT' } as any];
    c.selectedExamId = 7;
    c.examSubjects = [{ id: 11, subjectName: 'Maths', maxMarks: 50 } as any];
    c.selectedSubjectEntryId = 11;
    c.subjectStudents = [{ studentId: 'S1', studentName: 'Aarav', marksObtained: 20 }];
    (c as any).originalMarksA = { S1: 10 };
    (c as any).marksInputA = { S1: 20 };
    c.correctionReason = '';
    await c.saveMarksA();
    expect(marks.coordinatorCorrectMarks).not.toHaveBeenCalled();
    c.correctionReason = 'Totalling error';
    await c.saveMarksA();
    expect(marks.coordinatorCorrectMarks).toHaveBeenCalledWith(jasmine.any(Array), 'Totalling error');
    expect(marks.saveBulkMarks).not.toHaveBeenCalled();
    expect(marks.correctMarks).not.toHaveBeenCalled();
  });

  it('the Teacher workspace keeps the class-teacher view', () => {
    localStorage.setItem(key, 'TEACHER');
    const c = create();
    expect(c.isTeacher).toBeTrue();
    expect(c.selectedClass).toBe('10');
  });
});
