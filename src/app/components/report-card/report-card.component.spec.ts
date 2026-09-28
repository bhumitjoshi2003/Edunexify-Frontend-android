import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { Location } from '@angular/common';
import { Title } from '@angular/platform-browser';
import { of, throwError } from 'rxjs';

import { ReportCardComponent } from './report-card.component';
import { MarksService } from '../../services/marks.service';
import { ReportCardTemplateService, ReportCardData } from '../../services/report-card-template.service';
import { SchoolService } from '../../services/school.service';
import { AuthStateService } from '../../auth/auth-state.service';
import { LoggerService } from '../../services/logger.service';
import { ToastService } from '../../services/toast.service';
import { ParentPortalService } from '../../services/parent-portal.service';
import { ParentChildContextService } from '../../services/parent-child-context.service';

/**
 * Phase E6F: the report-card page's handling of E6E's multi-class ambiguity response —
 * a student with more than one legitimate historical class for the requested session must
 * never have one silently guessed. The page shows the candidates, and the user's choice is
 * retried (with classId) rather than defaulted.
 */
describe('ReportCardComponent — E6F ambiguity handling', () => {
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
    const schoolServiceSpy = jasmine.createSpyObj('SchoolService', ['getSettings']);
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
        { provide: SchoolService, useValue: schoolServiceSpy },
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

  it('loads normally and shows no ambiguity picker when the context is unique', () => {
    configure({ studentId: STUDENT_ID, session: SESSION, templateId: String(TEMPLATE_ID) });
    rcTemplateServiceSpy.getReportCard.and.returnValue(of(reportCard()));

    fixture.detectChanges();

    expect(component.reportCardData?.className).toBe('9');
    expect(component.ambiguousCandidates).toBeNull();
    expect(rcTemplateServiceSpy.getReportCard).toHaveBeenCalledWith(STUDENT_ID, TEMPLATE_ID, SESSION, null);
  });

  it('shows the candidate classes rather than guessing when the backend returns 409 ambiguous', () => {
    configure({ studentId: STUDENT_ID, session: SESSION, templateId: String(TEMPLATE_ID) });
    rcTemplateServiceSpy.getReportCard.and.returnValue(throwError(() => ({
      status: 409,
      error: {
        ambiguous: true,
        studentId: STUDENT_ID,
        message: 'Multiple historical class contexts exist.',
        candidates: [{ classId: 9, className: '9' }, { classId: 10, className: '10' }],
      },
    })));

    fixture.detectChanges();

    expect(component.ambiguousCandidates).not.toBeNull();
    expect(component.ambiguousCandidates!.length).toBe(2);
    expect(component.reportCardData).toBeNull();
    expect(component.notPublished).toBeFalse();
  });

  it('retries with the selected classId when the user picks a candidate, and clears the picker', () => {
    configure({ studentId: STUDENT_ID, session: SESSION, templateId: String(TEMPLATE_ID) });
    rcTemplateServiceSpy.getReportCard.and.returnValue(throwError(() => ({
      status: 409,
      error: {
        ambiguous: true,
        studentId: STUDENT_ID,
        message: 'Multiple historical class contexts exist.',
        candidates: [{ classId: 9, className: '9' }, { classId: 10, className: '10' }],
      },
    })));
    fixture.detectChanges();
    expect(component.ambiguousCandidates).not.toBeNull();

    rcTemplateServiceSpy.getReportCard.and.returnValue(of(reportCard({ className: '9' })));
    component.selectHistoricalClass({ classId: 9, className: '9' });

    expect(component.ambiguousCandidates).toBeNull();
    expect(component.selectedClassId).toBe(9);
    expect(component.reportCardData?.className).toBe('9');
    expect(rcTemplateServiceSpy.getReportCard).toHaveBeenCalledWith(STUDENT_ID, TEMPLATE_ID, SESSION, 9);
  });

  it('uses the selected classId for the PDF download too, once chosen', () => {
    configure({ studentId: STUDENT_ID, session: SESSION, templateId: String(TEMPLATE_ID) });
    rcTemplateServiceSpy.getReportCard.and.returnValue(of(reportCard({ className: '10' })));
    fixture.detectChanges();
    component.selectedClassId = 10;

    rcTemplateServiceSpy.downloadPdf.and.returnValue(of(new Blob(['pdf'])));
    spyOn(URL, 'createObjectURL').and.returnValue('blob:mock');
    spyOn(URL, 'revokeObjectURL');
    spyOn(document, 'createElement').and.callThrough();

    component.downloadPdf();

    expect(rcTemplateServiceSpy.downloadPdf).toHaveBeenCalledWith(STUDENT_ID, TEMPLATE_ID, SESSION, 10);
  });

  it('still shows the not-published lock screen for a plain 403 (unrelated to ambiguity)', () => {
    configure({ studentId: STUDENT_ID, session: SESSION, templateId: String(TEMPLATE_ID) });
    rcTemplateServiceSpy.getReportCard.and.returnValue(throwError(() => ({ status: 403, error: {} })));

    fixture.detectChanges();

    expect(component.notPublished).toBeTrue();
    expect(component.ambiguousCandidates).toBeNull();
  });
});
