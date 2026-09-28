import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { Location } from '@angular/common';
import { Title } from '@angular/platform-browser';
import { of, throwError } from 'rxjs';
import { ReportCardComponent } from './report-card.component';
import { MarksService, ExamResult } from '../../services/marks.service';
import { ReportCardTemplateService, ReportCardData } from '../../services/report-card-template.service';
import { AuthStateService } from '../../auth/auth-state.service';
import { LoggerService } from '../../services/logger.service';
import { ToastService } from '../../services/toast.service';
import { ParentPortalService } from '../../services/parent-portal.service';
import { ParentChildContextService } from '../../services/parent-child-context.service';

/**
 * Report Card Phase 0: Preview & Print and Download use the backend PDF — the template card's or,
 * without a template, the results card's — and never print the app page (no window.print()).
 */
describe('ReportCardComponent — backend PDF only', () => {
  let fixture: ComponentFixture<ReportCardComponent>;
  let component: ReportCardComponent;
  let rc: jasmine.SpyObj<ReportCardTemplateService>;
  let marks: jasmine.SpyObj<MarksService>;
  let toast: jasmine.SpyObj<ToastService>;
  let printSpy: jasmine.Spy;

  const pdf = () => new Blob(['%PDF-1.4'], { type: 'application/pdf' });

  const result: ExamResult = {
    examId: 7, examName: 'Half Yearly', className: '9', session: '2026-2027', studentName: 'Aarav Sharma', subjects: [],
    totalMarksObtained: 80, totalMaxMarks: 100, percentage: 80, overallRank: 1, resultStatus: 'PUBLISHED',
    complete: true, marksMissing: 0, grade: 'A2', passed: true,
  };

  const templateCard = (): ReportCardData => ({
    studentId: 'S1', studentName: 'Aarav Sharma', className: '9', session: '2026-2027', schoolName: 'Test School',
    template: { id: 100, schoolId: 1, name: 'Standard', assessmentGroupId: 1, assessmentGroupName: 'Annual',
      isDefault: true, isActive: true, createdAt: '', updatedAt: '', sections: [] },
    gradingSystem: 'CBSE',
    weightedResult: { groupId: 1, groupName: 'Annual', groupType: 'EXAM_BASED', weightedPercentage: 80, subjectResults: [], rank: 1 },
  });

  function configure(query: Record<string, string>, card: ReportCardData = templateCard()): void {
    rc = jasmine.createSpyObj('ReportCardTemplateService', ['getReportCard', 'downloadPdf', 'downloadResultsPdf']);
    rc.getReportCard.and.returnValue(of(card));
    marks = jasmine.createSpyObj('MarksService', ['getStudentResults']);
    marks.getStudentResults.and.returnValue(of([result]));
    toast = jasmine.createSpyObj('ToastService', ['success', 'error', 'warning', 'info']);
    const auth = jasmine.createSpyObj('AuthStateService', ['getUserRole', 'getUserId']);
    auth.getUserRole.and.returnValue('ADMIN');
    auth.getUserId.and.returnValue('admin1');
    const parentPortal = jasmine.createSpyObj('ParentPortalService', ['assertChildAccess', 'getMyProfile']);
    parentPortal.getMyProfile.and.returnValue(of({ children: [] }));

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ReportCardComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
        { provide: Router, useValue: jasmine.createSpyObj('Router', ['navigate', 'navigateByUrl']) },
        { provide: Location, useValue: jasmine.createSpyObj('Location', ['back']) },
        { provide: Title, useValue: { getTitle: () => '', setTitle: () => {} } },
        { provide: MarksService, useValue: marks },
        { provide: ReportCardTemplateService, useValue: rc },
        { provide: AuthStateService, useValue: auth },
        { provide: LoggerService, useValue: jasmine.createSpyObj('LoggerService', ['error', 'warn', 'info']) },
        { provide: ToastService, useValue: toast },
        { provide: ParentPortalService, useValue: parentPortal },
        { provide: ParentChildContextService, useValue: jasmine.createSpyObj('ParentChildContextService', ['select', 'clear']) },
      ],
    });
    fixture = TestBed.createComponent(ReportCardComponent);
    component = fixture.componentInstance;
    printSpy = spyOn(window, 'print');
    fixture.detectChanges();
  }

  const el = () => fixture.nativeElement as HTMLElement;

  /** Error bodies are Blobs read asynchronously (Blob.text) — wait for the component to react. */
  async function until(condition: () => boolean): Promise<void> {
    for (let i = 0; i < 100 && !condition(); i++) await new Promise(r => setTimeout(r, 5));
  }

  it('results card (Class Results / My Results): Preview & Print shows that exam\'s backend PDF', () => {
    configure({ studentId: 'S1', session: '2026-2027', examId: '7' });
    rc.downloadResultsPdf.and.returnValue(of(pdf()));

    (el().querySelector('.rc-btn-print') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(rc.downloadResultsPdf).toHaveBeenCalledWith('S1', '2026-2027', 7, null);
    expect(rc.downloadPdf).not.toHaveBeenCalled();
    expect(el().querySelector('.rc-pdf-overlay iframe.rc-pdf-frame')).not.toBeNull();
    expect(printSpy).not.toHaveBeenCalled();
  });

  it('Print prints the PDF document in the preview, never the app page', () => {
    configure({ studentId: 'S1', session: '2026-2027' });
    rc.downloadResultsPdf.and.returnValue(of(pdf()));
    component.print();
    fixture.detectChanges();
    const frame = el().querySelector('iframe.rc-pdf-frame') as HTMLIFrameElement;
    const framePrint = jasmine.createSpy('framePrint');
    spyOnProperty(frame, 'contentWindow', 'get').and.returnValue({ print: framePrint, focus: () => {} } as unknown as Window);

    (Array.from(el().querySelectorAll('.rc-pdf-btn')).find(b => b.textContent!.trim() === 'Print') as HTMLButtonElement).click();

    expect(framePrint).toHaveBeenCalled();
    expect(printSpy).not.toHaveBeenCalled();
    expect(rc.downloadResultsPdf).toHaveBeenCalledWith('S1', '2026-2027', null, null);   // whole session
  });

  it('template card: Preview & Print and Download use the template PDF', () => {
    configure({ studentId: 'S1', session: '2026-2027', templateId: '100' });
    rc.downloadPdf.and.returnValue(of(pdf()));
    component.print();
    component.downloadPdf();
    expect(rc.downloadPdf).toHaveBeenCalledTimes(2);
    expect(rc.downloadPdf).toHaveBeenCalledWith('S1', 100, '2026-2027', null);
    expect(rc.downloadResultsPdf).not.toHaveBeenCalled();
    expect(printSpy).not.toHaveBeenCalled();
  });

  it('a notification link\'s classId opens that exact card', () => {
    configure({ studentId: 'S1', session: '2025-2026', templateId: '100', classId: '9' });
    expect(rc.getReportCard).toHaveBeenCalledWith('S1', 100, '2025-2026', 9);
    rc.downloadPdf.and.returnValue(of(pdf()));
    component.downloadPdf();
    expect(rc.downloadPdf).toHaveBeenCalledWith('S1', 100, '2025-2026', 9);
  });

  it('a multi-class answer shows the class picker, then continues with the chosen class', async () => {
    configure({ studentId: 'S1', session: '2025-2026' });
    const ambiguous = new Blob([JSON.stringify({ ambiguous: true, studentId: 'S1', message: 'm',
      candidates: [{ classId: 9, className: '9' }, { classId: 10, className: '10' }] })], { type: 'application/json' });
    rc.downloadResultsPdf.and.returnValue(throwError(() => ({ status: 409, error: ambiguous })));
    component.print();
    await until(() => !!component.ambiguousCandidates);
    fixture.detectChanges();
    expect(component.ambiguousCandidates!.length).toBe(2);

    rc.downloadResultsPdf.and.returnValue(of(pdf()));
    component.selectHistoricalClass({ classId: 10, className: '10' });
    expect(rc.downloadResultsPdf).toHaveBeenCalledWith('S1', '2025-2026', null, 10);
    expect(component.pdfPreviewUrl).not.toBeNull();
  });

  it('explains a missing or unpublished card instead of printing anything', async () => {
    configure({ studentId: 'S1', session: '2026-2027' });
    rc.downloadResultsPdf.and.returnValue(throwError(() => ({ status: 404,
      error: new Blob([JSON.stringify({ message: 'No results are available for this report card yet.' })]) })));
    component.print();
    await until(() => toast.info.calls.count() > 0);
    expect(toast.info).toHaveBeenCalledWith('No results yet', 'No results are available for this report card yet.');
    expect(component.pdfPreviewUrl).toBeNull();
    expect(printSpy).not.toHaveBeenCalled();
  });

  it('title: a one-exam results card is named after the exam, never "Annual"', () => {
    configure({ studentId: 'S1', session: '2026-2027', examId: '7' });
    expect(el().querySelector('.rc-card-title')!.textContent!.trim()).toBe('Half Yearly — Report Card');
  });

  it('title: the whole-session results card is the Annual Report Card', () => {
    configure({ studentId: 'S1', session: '2026-2027' });
    expect(el().querySelector('.rc-card-title')!.textContent!.trim()).toBe('Annual Report Card');
  });

  it('template card shows the backend title, the same one the PDF prints', () => {
    configure({ studentId: 'S1', session: '2026-2027', templateId: '100' },
      { ...templateCard(), reportTitle: 'HALF YEARLY — REPORT CARD' });
    const title = el().querySelector('.rc-title-label')!.textContent!.replace(/\s+/g, ' ').trim();
    expect(title).toBe('H A L F Y E A R L Y — R E P O R T C A R D');
    expect(el().querySelector('.rc-title-session')!.textContent!.trim()).toBe('Academic Session 2026-2027');
  });

  it('the static sample has no PDF actions', () => {
    configure({ demo: 'true' });
    expect(el().querySelector('.rc-btn-print')).toBeNull();
    expect(el().querySelector('.rc-btn-pdf')).toBeNull();
  });
});

/** Android app: the same backend PDF, handed to the system to open/print/share — no browser print. */
describe('ReportCardComponent — Android PDF delivery', () => {
  let fixture: ComponentFixture<ReportCardComponent>;
  let component: ReportCardComponent;
  let rc: jasmine.SpyObj<ReportCardTemplateService>;

  beforeEach(() => {
    rc = jasmine.createSpyObj('ReportCardTemplateService', ['getReportCard', 'downloadPdf', 'downloadResultsPdf']);
    const marks = jasmine.createSpyObj('MarksService', ['getStudentResults']);
    marks.getStudentResults.and.returnValue(of([]));
    const auth = jasmine.createSpyObj('AuthStateService', ['getUserRole', 'getUserId']);
    auth.getUserRole.and.returnValue('STUDENT');
    auth.getUserId.and.returnValue('S1');
    const parentPortal = jasmine.createSpyObj('ParentPortalService', ['assertChildAccess', 'getMyProfile']);
    parentPortal.getMyProfile.and.returnValue(of({ children: [] }));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ReportCardComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ studentId: 'S1', session: '2026-2027', examId: '7' }) } } },
        { provide: Router, useValue: jasmine.createSpyObj('Router', ['navigate', 'navigateByUrl']) },
        { provide: Location, useValue: jasmine.createSpyObj('Location', ['back']) },
        { provide: Title, useValue: { getTitle: () => '', setTitle: () => {} } },
        { provide: MarksService, useValue: marks },
        { provide: ReportCardTemplateService, useValue: rc },
        { provide: AuthStateService, useValue: auth },
        { provide: LoggerService, useValue: jasmine.createSpyObj('LoggerService', ['error', 'warn', 'info']) },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['success', 'error', 'warning', 'info']) },
        { provide: ParentPortalService, useValue: parentPortal },
        { provide: ParentChildContextService, useValue: jasmine.createSpyObj('ParentChildContextService', ['select', 'clear']) },
      ],
    });
    fixture = TestBed.createComponent(ReportCardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('Preview & Print in the app fetches the backend PDF and shares it — no preview page, no window.print', async () => {
    const { Capacitor } = await import('@capacitor/core');
    spyOn(Capacitor, 'isNativePlatform').and.returnValue(true);
    const printSpy = spyOn(window, 'print');
    const share = spyOn<any>(component, 'sharePdf').and.resolveTo();
    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    rc.downloadResultsPdf.and.returnValue(of(blob));

    component.print();
    await new Promise(r => setTimeout(r));

    expect(rc.downloadResultsPdf).toHaveBeenCalledWith('S1', '2026-2027', 7, null);
    expect(share).toHaveBeenCalledWith(blob);
    expect(component.pdfPreviewUrl).toBeNull();
    expect(printSpy).not.toHaveBeenCalled();
  });

  it('Download in the app uses the same share flow', async () => {
    const { Capacitor } = await import('@capacitor/core');
    spyOn(Capacitor, 'isNativePlatform').and.returnValue(true);
    const share = spyOn<any>(component, 'sharePdf').and.resolveTo();
    rc.downloadResultsPdf.and.returnValue(of(new Blob(['%PDF'])));
    component.downloadPdf();
    await new Promise(r => setTimeout(r));
    expect(share).toHaveBeenCalled();
  });
});
