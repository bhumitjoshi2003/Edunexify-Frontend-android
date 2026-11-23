import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ExamConfigComponent } from './exam-config.component';
import { ExamConfig, ExamConfigService, ExamSubjectOption } from '../../services/exam-config.service';
import { AcademicSessionService } from '../../services/academic-session.service';
import { SchoolService } from '../../services/school.service';
import { baselineTestProviders } from '../../../testing/baseline-test-providers';

/** The exam subject checklist is the class's academic subjects from the server — no free-text subjects. */
describe('ExamConfigComponent subject checklist', () => {
  let fixture: ComponentFixture<ExamConfigComponent>;
  let component: ExamConfigComponent;
  let api: ExamConfigService;
  const exam = { id: 4, schoolId: 1, session: '2026-2027', className: 'Class 11', examName: 'E2E Unit Test 1',
    resultStatus: 'DRAFT' } as unknown as ExamConfig;
  const options: ExamSubjectOption[] = [
    { subjectName: 'English', optional: false, optionalGroup: null, kind: 'COMMON' },
    { subjectName: 'Physical Education', optional: false, optionalGroup: null, kind: 'COMMON' },
    { subjectName: 'Physics', optional: false, optionalGroup: null, kind: 'STREAM' },
    { subjectName: 'Accountancy', optional: false, optionalGroup: null, kind: 'STREAM' },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ExamConfigComponent], providers: [...baselineTestProviders()] }).compileComponents();
    api = TestBed.inject(ExamConfigService);
    spyOn(TestBed.inject(AcademicSessionService), 'getAllSessions').and.returnValue(of([{ label: '2026-2027', current: true } as any]));
    spyOn(TestBed.inject(SchoolService), 'getClasses').and.returnValue(of(['Class 11']));
    spyOn(api, 'getExams').and.returnValue(of([exam]));
    spyOn(api, 'getSubjectOptions').and.returnValue(of(options));
    spyOn(api, 'getExamSubjects').and.returnValue(of([
      { id: 5, examConfigId: 4, subjectName: 'English', maxMarks: 50, examDate: '2026-11-12' },
      { id: 6, examConfigId: 4, subjectName: 'Physics', maxMarks: 50, examDate: '2026-11-12' },
      { id: 9, examConfigId: 4, subjectName: 'Old GK', maxMarks: 20, examDate: '2026-11-12' },
    ]));
    fixture = TestBed.createComponent(ExamConfigComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    component.toggleExam(exam);
    fixture.detectChanges();
  });

  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  it('lists the class academic subjects (stream ones flagged) and keeps saved choices checked', () => {
    expect(api.getSubjectOptions).toHaveBeenCalledOnceWith('Class 11');
    const rows = component.getClassRows(4);
    expect(rows.map(r => r.subjectName)).toEqual(['English', 'Physical Education', 'Physics', 'Accountancy']);
    expect(rows.filter(r => r.checked).map(r => r.subjectName)).toEqual(['English', 'Physics']);
    expect(rows.find(r => r.subjectName === 'Physics')!.isStream).toBeTrue();
    expect(rows.find(r => r.subjectName === 'English')!.isStream).toBeFalse();
  });

  it('offers no free-text subject: no "Add Extra Subject" and saved unconfigured names are read-only', () => {
    expect(text()).not.toContain('Add Extra Subject');
    expect(component.getExtraRows(4).map(r => r.subjectName)).toEqual(['Old GK']);
    expect((fixture.nativeElement as HTMLElement).querySelector('input.ec-extra-name-input')).toBeNull();
    expect(text()).toContain('Not configured for this class');
  });
});
