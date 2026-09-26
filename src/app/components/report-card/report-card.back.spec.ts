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
 * Opened from Class Results, Back must land on the same session/class/exam/section. With in-app
 * history it steps back (Class Results keeps its selection in its URL, so browser Back matches);
 * without history (new tab) it uses the caller's returnUrl — only ever an in-app dashboard path.
 */
describe('ReportCardComponent — Back returns to the caller with its selection', () => {
  let locationSpy: jasmine.SpyObj<Location>;
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
    routerSpy = jasmine.createSpyObj('Router', ['navigate', 'navigateByUrl'], { lastSuccessfulNavigation: null });
    const marksServiceSpy = jasmine.createSpyObj('MarksService', ['getStudentResults']);
    const authStateSpy = jasmine.createSpyObj('AuthStateService', ['getUserRole', 'getUserId']);
    authStateSpy.getUserRole.and.returnValue('ADMIN');
    authStateSpy.getUserId.and.returnValue('admin1');
    const loggerSpy = jasmine.createSpyObj('LoggerService', ['error', 'warn', 'info']);
    const toastSpy = jasmine.createSpyObj('ToastService', ['success', 'error', 'warning', 'info']);
    locationSpy = jasmine.createSpyObj('Location', ['back']);
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

  const RETURN = '/dashboard/class-results?session=2025-2026&className=9&examId=8&sectionId=4';

  it('steps back through history when the card was opened inside the app', () => {
    configure({ studentId: STUDENT_ID, session: SESSION, templateId: String(TEMPLATE_ID), returnUrl: RETURN });
    (Object.getOwnPropertyDescriptor(routerSpy, 'lastSuccessfulNavigation')!.get as jasmine.Spy)
      .and.returnValue({ previousNavigation: {} });
    component.goBack();
    expect(locationSpy.back).toHaveBeenCalled();
    expect(routerSpy.navigateByUrl).not.toHaveBeenCalled();
  });

  it('without history, returns to the exact Class Results selection', () => {
    configure({ studentId: STUDENT_ID, session: SESSION, templateId: String(TEMPLATE_ID), returnUrl: RETURN });
    component.goBack();
    expect(routerSpy.navigateByUrl).toHaveBeenCalledWith(RETURN);
    expect(locationSpy.back).not.toHaveBeenCalled();
  });

  it('never follows an external or protocol-relative returnUrl', () => {
    for (const bad of ['https://evil.example/x', '//evil.example/x', '/home', 'javascript:alert(1)']) {
      configure({ studentId: STUDENT_ID, session: SESSION, templateId: String(TEMPLATE_ID), returnUrl: bad });
      component.goBack();
      expect(routerSpy.navigateByUrl).withContext(bad).not.toHaveBeenCalled();
      expect(locationSpy.back).withContext(bad).toHaveBeenCalled();
    }
  });
});
