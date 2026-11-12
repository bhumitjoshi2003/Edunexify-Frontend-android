import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ClassResultsComponent } from './class-results.component';
import { MarksService } from '../../services/marks.service';
import { ExamConfigService } from '../../services/exam-config.service';
import { ToastService } from '../../services/toast.service';
import { AuthStateService } from '../../auth/auth-state.service';
import { TeacherService } from '../../services/teacher.service';
import { AcademicSessionService } from '../../services/academic-session.service';
import { LoggerService } from '../../services/logger.service';
import { SchoolService } from '../../services/school.service';
import { SectionService } from '../../services/section.service';
import { CoordinatorService } from '../../services/coordinator.service';

/**
 * Shared by the web and Android clients — keep the two copies identical.
 * Academic results in the Coordinator workspace: the covered classes and sections, read only.
 */
describe('ClassResultsComponent — Coordinator workspace', () => {
  const user = { userId: 'emp_1', role: 'TEACHER', coordinator: true, schoolSlug: 'demo' };
  const key = 'edunexify.workspace.v1.demo.emp_1';
  let fixture: ComponentFixture<ClassResultsComponent>;
  let teachers: jasmine.SpyObj<TeacherService>;
  let wholeClass = true;
  let urlClass: string | null = null;

  function create(): ClassResultsComponent {
    TestBed.overrideProvider(ActivatedRoute, { useValue: { snapshot: { queryParamMap: convertToParamMap(urlClass ? { className: urlClass } : {}) } } });
    fixture = TestBed.createComponent(ClassResultsComponent);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  beforeEach(() => {
    wholeClass = true;
    urlClass = null;
    teachers = jasmine.createSpyObj('TeacherService', ['getTeacher']);
    teachers.getTeacher.and.returnValue(of({ classTeacher: '10' } as any));
    TestBed.configureTestingModule({
      imports: [ClassResultsComponent],
      providers: [
        provideRouter([]),
        { provide: MarksService, useValue: { getClassResults: () => of([]) } },
        { provide: ExamConfigService, useValue: { getExams: () => of([{ id: 7, session: '2026-2027', className: '6', examName: 'Unit Test', resultStatus: 'DRAFT' }]), getExamSubjects: () => of([]) } },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['confirm', 'success', 'error', 'warning', 'info']) },
        { provide: AuthStateService, useValue: { getUser: () => user, getUserRole: () => 'TEACHER', isCoordinator: () => true } },
        { provide: TeacherService, useValue: teachers },
        { provide: AcademicSessionService, useValue: { getAllSessions: () => of([{ label: '2026-2027', current: true }]) } },
        { provide: LoggerService, useValue: jasmine.createSpyObj('LoggerService', ['error', 'warn', 'info', 'debug', 'log']) },
        { provide: SchoolService, useValue: {
          getClasses: () => of(['1', '6', '7', '10']),
          getManagedClasses: () => of([{ id: 1, name: '1' }, { id: 6, name: '6' }, { id: 7, name: '7' }, { id: 10, name: '10' }]) } },
        { provide: SectionService, useValue: { getSectionsForClass: () => of([{ id: 61, name: 'A' }, { id: 62, name: 'B' }]) } },
        { provide: CoordinatorService, useValue: {
          restrictToScopedClassNames: (names: string[]) => of(names.filter(n => ['6', '7'].includes(n))),
          sectionScope: () => of({ wholeClass, sectionIds: wholeClass ? [] : [62] }) } },
      ],
    });
  });

  afterEach(() => localStorage.removeItem(key));

  it('offers the covered classes and never the publish controls', () => {
    const c = create();
    expect(c.classOptions).toEqual(['6', '7']);
    expect(c.selectedClass).toBe('6');
    expect(c.showClassDropdown).toBeTrue();
    expect(c.canReleaseResults).toBeFalse();
    expect(teachers.getTeacher).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).not.toContain('Publish Results');
  });

  it('ignores a class from the link that is outside the scope', () => {
    urlClass = '1';
    expect(create().selectedClass).toBe('6');
  });

  it('only covered sections, without "All Sections", when part of the class is covered', () => {
    wholeClass = false;
    const c = create();
    expect(c.sections.map(s => s.id)).toEqual([62]);
    expect(c.allSectionsAllowed).toBeFalse();
    expect(c.selectedSectionId).toBe(62);
  });

  it('the Teacher workspace keeps the class-teacher view', () => {
    localStorage.setItem(key, 'TEACHER');
    const c = create();
    expect(c.isTeacher).toBeTrue();
    expect(c.selectedClass).toBe('10');
  });
});
