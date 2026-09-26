import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { Location } from '@angular/common';
import { Title } from '@angular/platform-browser';
import { of } from 'rxjs';

import { ReportCardComponent } from './report-card.component';
import { MarksService } from '../../services/marks.service';
import { ReportCardTemplateService, ReportCardData } from '../../services/report-card-template.service';
import { AuthStateService } from '../../auth/auth-state.service';
import { LoggerService } from '../../services/logger.service';
import { ToastService } from '../../services/toast.service';
import { ParentPortalService } from '../../services/parent-portal.service';
import { ParentChildContextService } from '../../services/parent-child-context.service';

/**
 * Results Phase 1: every grade on the report card comes from the backend (GradingPolicy). The
 * page prints the label it receives and keeps no grading scale of its own.
 */
describe('ReportCardComponent — backend grades only', () => {
  let component: ReportCardComponent;
  let fixture: ComponentFixture<ReportCardComponent>;
  let rcTemplateServiceSpy: jasmine.SpyObj<ReportCardTemplateService>;
  let routerSpy: jasmine.SpyObj<Router>;

  const STUDENT_ID = 'S1';
  const SESSION = '2026-2027';
  const TEMPLATE_ID = 100;

  function reportCard(overrides: Partial<ReportCardData> = {}): ReportCardData {
    return {
      studentId: STUDENT_ID,
      studentName: 'Test Student',
      className: '9',
      session: SESSION,
      schoolName: 'Test School',
      template: {
        id: TEMPLATE_ID, schoolId: 1, name: 'Standard', assessmentGroupId: 1,
        assessmentGroupName: 'Annual', isDefault: true, isActive: true,
        createdAt: '', updatedAt: '', sections: [],
      },
      gradingSystem: 'CBSE',
      weightedResult: { groupId: 1, groupName: 'Annual', groupType: 'EXAM_BASED', weightedPercentage: 80, subjectResults: [], rank: 1 },
      ...overrides,
    };
  }

  function configure(queryParams: Record<string, string>): void {
    rcTemplateServiceSpy = jasmine.createSpyObj('ReportCardTemplateService', ['getReportCard', 'downloadPdf']);
    routerSpy = jasmine.createSpyObj('Router', ['navigate']);
    const marksServiceSpy = jasmine.createSpyObj('MarksService', ['getStudentResults']);
    const authStateSpy = jasmine.createSpyObj('AuthStateService', ['getUserRole', 'getUserId']);
    authStateSpy.getUserRole.and.returnValue('ADMIN');
    authStateSpy.getUserId.and.returnValue('admin1');
    const loggerSpy = jasmine.createSpyObj('LoggerService', ['error', 'warn', 'info']);
    const toastSpy = jasmine.createSpyObj('ToastService', ['success', 'error', 'warning', 'info']);
    const locationSpy = jasmine.createSpyObj('Location', ['back']);
    const parentPortalSpy = jasmine.createSpyObj('ParentPortalService', ['assertChildAccess', 'getMyProfile']);
    parentPortalSpy.getMyProfile.and.returnValue(of({ children: [] }));
    const parentChildContextSpy = jasmine.createSpyObj('ParentChildContextService', ['select', 'clear']);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ReportCardComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } } },
        { provide: Router, useValue: routerSpy },
        { provide: Location, useValue: locationSpy },
        { provide: Title, useValue: { getTitle: () => '', setTitle: () => {} } },
        { provide: MarksService, useValue: marksServiceSpy },
        { provide: ReportCardTemplateService, useValue: rcTemplateServiceSpy },
        { provide: AuthStateService, useValue: authStateSpy },
        { provide: LoggerService, useValue: loggerSpy },
        { provide: ToastService, useValue: toastSpy },
        { provide: ParentPortalService, useValue: parentPortalSpy },
        { provide: ParentChildContextService, useValue: parentChildContextSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReportCardComponent);
    component = fixture.componentInstance;
  }

  function marksTableCard(): ReportCardData {
    return reportCard({
      overallGrade: 'C1',
      weightedResult: {
        groupId: 1, groupName: 'Annual', groupType: 'EXAM_BASED', weightedPercentage: 95, subjectResults: [], rank: 1,
        marksTable: {
          examColumns: [{ examId: 1, examName: 'Annual', maxTotal: 100, weightage: 1 }],
          // Deliberately inconsistent with any scale: the page must print the backend label as-is.
          subjectRows: [
            { subjectName: 'Math', examMarks: [{ obtained: 95, max: 100, percentage: 95 }], weightedPercentage: 95, grade: 'B2' },
            { subjectName: 'Science', examMarks: [{ obtained: 20, max: 100, percentage: 20 }], weightedPercentage: 20, grade: null },
          ],
          examTotals: [{ obtained: 115, max: 200 }],
        },
      },
    });
  }

  it('prints subject and overall grades exactly as the backend sent them', () => {
    configure({ studentId: STUDENT_ID, session: SESSION, templateId: String(TEMPLATE_ID) });
    rcTemplateServiceSpy.getReportCard.and.returnValue(of(marksTableCard()));
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    const grades = Array.from(el.querySelectorAll('.rc-marks-table .rc-td-grade')).map(c => c.textContent!.trim());
    expect(grades).toEqual(['B2', '—', 'C1']);
    const kpis = Array.from(el.querySelectorAll('.rc-kpi-val')).map(k => k.textContent!.trim());
    expect(kpis).toContain('C1');
  });

  it('has no frontend grading scale left', () => {
    configure({ studentId: STUDENT_ID, session: SESSION, templateId: String(TEMPLATE_ID) });
    const c = component as unknown as Record<string, unknown>;
    for (const removed of ['getGradeFromPct', 'gradeFromPct', 'getGrade', 'getOverallGrade', 'cbseGradePoint', 'isPass', 'gradeLegend']) {
      expect(c[removed]).withContext(removed).toBeUndefined();
    }
  });

  it('colours a grade from the backend grade and pass flag only', () => {
    configure({ studentId: STUDENT_ID, session: SESSION, templateId: String(TEMPLATE_ID) });
    expect(component.gradeClass(null, null)).toBe('grade-absent');
    expect(component.gradeClass('E', false)).toBe('grade-fail');
    expect(component.gradeClass('A2', true)).toBe('grade-a');
    expect(component.gradeClass('B1', true)).toBe('grade-b');
    expect(component.gradeClass('D', true)).toBe('grade-c');
  });
});
