import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { Rc2SetupComponent } from './setup/rc2-setup.component';
import { Rc2RemarksComponent } from './remarks/rc2-remarks.component';
import { Rc2GenerateComponent } from './generate/rc2-generate.component';
import { Rc2Context } from './rc2-context.component';
import { ReportCardV2Service, RemarksPage, ReportCardSetup, Summary } from '../../services/report-card-v2.service';
import { ReportCardPdfDeliveryService } from '../../services/report-card-pdf-delivery.service';
import { AcademicSessionService } from '../../services/academic-session.service';
import { SchoolService } from '../../services/school.service';
import { SectionService } from '../../services/section.service';
import { TeacherService } from '../../services/teacher.service';
import { AuthStateService } from '../../auth/auth-state.service';
import { ToastService } from '../../services/toast.service';
import { routes } from '../../app.routes';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { Rc2PublishedComponent } from './published/rc2-published.component';
import { Rc2MyReportCardsComponent } from './documents/rc2-my-report-cards.component';
import { Rc2DocumentViewComponent } from './documents/rc2-document-view.component';
import { VerifyRcComponent } from '../verify-rc/verify-rc.component';
import { HttpClient } from '@angular/common/http';
import { Publication, ReportCardDocument } from '../../services/report-card-v2.service';

/** Report Card V2 screens: the app only collects input and shows backend results / PDFs. */
describe('Report Card V2 (Phase 1)', () => {
  let api: jasmine.SpyObj<ReportCardV2Service>;
  let toast: jasmine.SpyObj<ToastService>;
  let delivery: { native: boolean; share: jasmine.Spy; download: jasmine.Spy };
  let role = 'ADMIN';

  const session = { id: 1, label: '2026-2027', startDate: '2026-04-01', endDate: '2027-03-31', current: true };
  const cls = { id: 8, name: '8', displayOrder: 8, active: true, streamEligible: false };
  const setup: ReportCardSetup = {
    id: 5, academicSessionId: 1, sessionLabel: '2026-2027', classId: 8, className: '8', name: 'Annual', resultMode: 'WEIGHTED',
    displayOrder: 0, terms: [], revision: 0,
    exams: [{ id: 1, examConfigId: 11, examName: 'Half Yearly', resultStatus: 'PUBLISHED', termId: null, termName: null, weight: 0.4, displayOrder: 0 }],
  };
  const ctx = (s: ReportCardSetup | null = setup): Rc2Context => ({ session, schoolClass: cls, sectionId: null, setup: s, setups: s ? [s] : [] });

  beforeEach(() => {
    api = jasmine.createSpyObj('ReportCardV2Service', ['listSetups', 'availableExams', 'createSetup', 'updateSetup', 'deleteSetup',
      'getRemarks', 'saveRemarks', 'getSummary', 'previewPdf', 'getDesign', 'listActivities',
      'listPublications', 'publish', 'withdraw', 'publicationDocuments', 'bulkCheck', 'downloadZip', 'send',
      'myDocuments', 'getDocument', 'documentPdf']);
    api.listSetups.and.returnValue(of([setup]));
    api.availableExams.and.returnValue(of([
      { id: 11, examName: 'Half Yearly', resultStatus: 'PUBLISHED', subjects: 5 },
      { id: 12, examName: 'Annual', resultStatus: 'DRAFT', subjects: 5 },
    ]));
    toast = jasmine.createSpyObj('ToastService', ['success', 'error', 'warning', 'info', 'confirm']);
    delivery = { native: false, share: jasmine.createSpy('share').and.resolveTo(), download: jasmine.createSpy('download') };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ReportCardV2Service, useValue: api },
        { provide: ToastService, useValue: toast },
        { provide: ReportCardPdfDeliveryService, useValue: delivery },
        { provide: AcademicSessionService, useValue: { getAllSessions: () => of([session]) } },
        { provide: SchoolService, useValue: { getManagedClasses: () => of([cls]) } },
        { provide: SectionService, useValue: { getSectionsForClass: () => of([]) } },
        { provide: TeacherService, useValue: { getTeacher: () => of({ classTeacher: '8' }) } },
        { provide: AuthStateService, useValue: { getUserRole: () => role, getUserId: () => 'U1' } },
      ],
    });
  });

  it('routes: Setup and Design are ADMIN-only; Remarks and Generate & Preview are ADMIN + TEACHER', () => {
    const dash = routes.find(r => r.path === 'dashboard')!;
    const find = (p: string) => dash.children!.find(c => c.path === p)!.data!['roles'];
    expect(find('report-cards-v2/setup')).toEqual(['ADMIN']);
    expect(find('report-cards-v2/design')).toEqual(['ADMIN']);
    expect(find('report-cards-v2/remarks')).toEqual(['ADMIN', 'TEACHER']);
    expect(find('report-cards-v2/generate')).toEqual(['ADMIN', 'TEACHER']);
  });

  it('Setup sends weights as fractions (40% → 0.4) and drops them for Total marks', () => {
    const fixture = TestBed.createComponent(Rc2SetupComponent);
    const c = fixture.componentInstance;
    fixture.detectChanges();
    c.onContext(ctx());
    api.createSetup.and.returnValue(of(setup));
    c.startNew();
    c.name = 'Annual';
    c.mode = 'WEIGHTED';
    c.addExam(11); c.addExam(12);
    c.exams[0].weight = 40; c.exams[1].weight = 60;
    c.save();
    const req = api.createSetup.calls.mostRecent().args[0];
    expect(req.exams.map(e => e.weight)).toEqual([0.4, 0.6]);
    expect(req.academicSessionId).toBe(1);
    expect(req.classId).toBe(8);

    c.startNew(); c.name = 'Half Yearly'; c.mode = 'TOTAL'; c.addExam(11); c.exams[0].weight = 50;
    c.save();
    expect(api.createSetup.calls.mostRecent().args[0].exams[0].weight).toBeNull();
  });

  it('Setup shows the server’s validation message and never more than six exams', () => {
    const fixture = TestBed.createComponent(Rc2SetupComponent);
    const c = fixture.componentInstance;
    fixture.detectChanges();
    c.onContext(ctx());
    c.available = Array.from({ length: 8 }, (_, i) => ({ id: 100 + i, examName: 'E' + i, resultStatus: 'DRAFT' as const, subjects: 1 }));
    c.startNew();
    c.available.forEach(a => c.addExam(a.id));
    expect(c.exams.length).toBe(6);
    api.createSetup.and.returnValue(throwError(() => ({ error: { message: 'The exam weights must add up to 100%.' } })));
    c.name = 'X';
    c.save();
    expect(c.error).toBe('The exam weights must add up to 100%.');
  });

  const remarksPage = (canEditPrincipal: boolean): RemarksPage => ({
    setupId: 5, setupName: 'Annual', className: '8', sectionId: 3, canEditPrincipal,
    activities: [{ id: 7, name: 'Art', displayOrder: 0, active: true }], gradeScale: ['A', 'B', 'C', 'D', 'E'],
    students: [{ studentId: 'S1', studentName: 'Aarav', sectionId: 3, sectionName: 'A', teacherRemark: 'Good', principalRemark: 'Well done', grades: {}, locked: false }],
  });

  it('Remarks: a teacher never sees or sends the principal’s remark', () => {
    role = 'TEACHER';
    api.getRemarks.and.returnValue(of(remarksPage(false)));
    api.saveRemarks.and.returnValue(of(undefined));
    const fixture = TestBed.createComponent(Rc2RemarksComponent);
    const c = fixture.componentInstance;
    fixture.detectChanges();
    c.onContext(ctx());
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain("Principal's remark");
    c.rows[0].teacher = 'Better';
    c.rows[0].principal = 'Tampered';
    c.rows[0].grades['7'] = 'A';
    c.save();
    expect(api.saveRemarks).toHaveBeenCalledWith(5, [{ studentId: 'S1', teacherRemark: 'Better', principalRemark: null, grades: { '7': 'A' } }]);
    role = 'ADMIN';
  });

  it('Remarks: an admin edits the principal’s remark too, sending only what changed', () => {
    api.getRemarks.and.returnValue(of(remarksPage(true)));
    api.saveRemarks.and.returnValue(of(undefined));
    const fixture = TestBed.createComponent(Rc2RemarksComponent);
    const c = fixture.componentInstance;
    fixture.detectChanges();
    c.onContext(ctx());
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain("Principal's remark");
    c.rows[0].principal = 'Excellent';
    c.save();
    expect(api.saveRemarks).toHaveBeenCalledWith(5, [{ studentId: 'S1', teacherRemark: null, principalRemark: 'Excellent', grades: {} }]);
    expect(c.dirtyCount).toBe(0);
  });

  const summary = (teacherView = false): Summary => ({
    setupId: 5, setupName: 'Annual', resultMode: 'TOTAL', className: '8', sessionLabel: '2026-2027', sectionId: null, teacherView,
    readiness: { draftExams: ['Annual'], students: 1, incomplete: 0, noResult: 0, missingTeacherRemarks: 1, missingPrincipalRemarks: 0, missingCoScholastic: 0, missingPhotos: 1 },
    students: [{ studentId: 'S1', studentName: 'Aarav', sectionId: 3, sectionName: 'A', percentage: 82.5, grade: 'A2', rank: 1, status: 'PASS',
      marksMissing: 0, hasTeacherRemark: false, hasPrincipalRemark: true, coScholasticComplete: true, hasPhoto: false }],
  });

  it('Generate & Preview shows readiness and previews the backend PDF in the page (no window.print)', async () => {
    api.getSummary.and.returnValue(of(summary()));
    api.previewPdf.and.returnValue(of(new Blob(['%PDF'], { type: 'application/pdf' })));
    const printSpy = spyOn(window, 'print');
    const fixture = TestBed.createComponent(Rc2GenerateComponent);
    const c = fixture.componentInstance;
    fixture.detectChanges();
    c.onContext(ctx());
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Draft exam');
    expect(el.textContent).toContain('82.50%');
    c.preview(c.summary!.students[0]);
    await new Promise(r => setTimeout(r));
    fixture.detectChanges();
    expect(api.previewPdf).toHaveBeenCalledWith(5, 'S1');
    expect(el.querySelector('iframe.rc2-pdf-frame')).not.toBeNull();
    expect(printSpy).not.toHaveBeenCalled();
    c.closePreview();
  });

  it('Generate & Preview in the app hands the PDF to the system share sheet', async () => {
    delivery.native = true;
    api.getSummary.and.returnValue(of(summary(true)));
    const blob = new Blob(['%PDF'], { type: 'application/pdf' });
    api.previewPdf.and.returnValue(of(blob));
    const fixture = TestBed.createComponent(Rc2GenerateComponent);
    const c = fixture.componentInstance;
    fixture.detectChanges();
    c.onContext(ctx());
    c.preview(c.summary!.students[0]);
    await new Promise(r => setTimeout(r));
    expect(delivery.share).toHaveBeenCalledWith(blob, 'Aarav_Annual_Preview.pdf');
    expect(c.previewUrl).toBeNull();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('your section only');
  });

  it('Generate & Preview download saves the file', async () => {
    api.getSummary.and.returnValue(of(summary()));
    api.previewPdf.and.returnValue(of(new Blob(['%PDF'])));
    const fixture = TestBed.createComponent(Rc2GenerateComponent);
    const c = fixture.componentInstance;
    fixture.detectChanges();
    c.onContext(ctx());
    c.download(c.summary!.students[0]);
    await new Promise(r => setTimeout(r));
    expect(delivery.download).toHaveBeenCalled();
  });

  // ── Phase 2: published (frozen) report cards ──────────────────────────

  const publication = (over: Partial<Publication> = {}): Publication => ({
    id: 41, setupId: 5, setupName: 'Annual', sectionId: null, sectionName: null, version: 1, status: 'ACTIVE', documentCount: 2,
    publishedBy: 'admin', publishedAt: '2026-09-29T10:00:00', withdrawnBy: null, withdrawnAt: null, withdrawalReason: null, ...over,
  });
  const document = (over: Partial<ReportCardDocument> = {}): ReportCardDocument => ({
    id: 900, publicationId: 41, studentId: 'S1', studentName: 'Aarav', title: 'ANNUAL — REPORT CARD', sessionLabel: '2026-2027',
    className: '8', sectionName: 'A', version: 1, status: 'ACTIVE', reference: 'RC-ABCDEFGHJK', issuedAt: '2026-09-29T10:00:00', ...over,
  });

  it('routes: Published Report Cards is the V2 page for ADMIN only; students/parents get their own documents', async () => {
    const dash = routes.find(r => r.path === 'dashboard')!;
    const route = (p: string) => dash.children!.find(c => c.path === p)!;
    expect(route('bulk-report-cards').data!['roles']).toEqual(['ADMIN']);
    expect(await (route('bulk-report-cards').loadComponent as any)()).toBe(Rc2PublishedComponent);
    expect(route('report-card-documents').data!['roles']).toEqual(['STUDENT', 'PARENT']);
    expect(route('report-card-documents/:id').data!['roles']).toEqual(['STUDENT', 'PARENT', 'ADMIN']);
  });

  it('Published: no setup for the class shows the setup link, never templates', () => {
    const fixture = TestBed.createComponent(Rc2PublishedComponent);
    const c = fixture.componentInstance;
    fixture.detectChanges();
    c.onContext({ session, schoolClass: cls, sectionId: null, setup: null, setups: [] });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('No report card setup found for this class and session.');
    expect(el.querySelector('a[href="/dashboard/report-cards-v2/setup"]')).not.toBeNull();
    expect(el.textContent!.toLowerCase()).not.toContain('template');
    expect(api.listPublications).not.toHaveBeenCalled();
  });

  it('Published: shows the active version and its stored documents, and publishes/republishes after confirmation', async () => {
    api.listPublications.and.returnValue(of([publication(), publication({ id: 40, version: 0 as any, status: 'SUPERSEDED' })]));
    api.publicationDocuments.and.returnValue(of([document()]));
    toast.confirm.and.resolveTo(true);
    api.publish.and.returnValue(of({ published: false, publication: null, documents: 0, excludedIncomplete: [],
      failed: [{ studentId: 'S2', studentName: 'Bina', reason: 'storage offline' }], message: 'Nothing was published: 1 card(s) could not be generated.' }));
    const fixture = TestBed.createComponent(Rc2PublishedComponent);
    const c = fixture.componentInstance;
    fixture.detectChanges();
    c.onContext(ctx());
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Active · Version 1');
    expect(el.textContent).toContain('Republish (new version)');
    expect(el.textContent).toContain('RC-ABCDEFGHJK');
    expect(api.publicationDocuments).toHaveBeenCalledWith(41);

    c.includeIncomplete = true;
    await c.publish();
    fixture.detectChanges();
    expect(api.publish).toHaveBeenCalledWith(5, null, true);
    expect(toast.error).toHaveBeenCalledWith('Nothing was published', jasmine.any(String));
    expect(el.textContent).toContain('Bina');
    expect(el.textContent).toContain('storage offline');
  });

  it('Published: a section is not published over an active whole-class version', () => {
    api.listPublications.and.returnValue(of([publication()]));
    api.publicationDocuments.and.returnValue(of([]));
    const fixture = TestBed.createComponent(Rc2PublishedComponent);
    const c = fixture.componentInstance;
    fixture.detectChanges();
    c.onContext({ ...ctx(), sectionId: 3 });
    fixture.detectChanges();
    expect(c.blockedByWholeClass).toBeTrue();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('published for the whole class');
  });

  it('Published: withdraw sends the reason; bulk download reports total, included and failed', async () => {
    api.listPublications.and.returnValue(of([publication()]));
    api.publicationDocuments.and.returnValue(of([document()]));
    api.withdraw.and.returnValue(of(publication({ status: 'WITHDRAWN' })));
    api.bulkCheck.and.returnValue(of({ total: 2, available: 1, missing: [{ studentId: 'S2', studentName: 'Bina', reason: 'Stored PDF not found' }] }));
    api.downloadZip.and.returnValue(of(new Blob(['PK'])));
    toast.confirm.and.resolveTo(true);
    const fixture = TestBed.createComponent(Rc2PublishedComponent);
    const c = fixture.componentInstance;
    fixture.detectChanges();
    c.onContext(ctx());

    c.downloadAll(c.active!);
    await new Promise(r => setTimeout(r));
    fixture.detectChanges();
    expect(delivery.download).toHaveBeenCalledWith(jasmine.any(Blob), 'Annual_v1.zip');
    expect(toast.warning).toHaveBeenCalled();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Total 2 · included 1 · failed 1');
    expect(el.textContent).toContain('Stored PDF not found');

    c.withdrawReason = ' Marks correction ';
    await c.withdraw(c.active!);
    expect(api.withdraw).toHaveBeenCalledWith(41, 'Marks correction');
  });

  it('Remarks: a student whose card is published is locked', () => {
    const page = remarksPage(true);
    page.students[0].locked = true;
    api.getRemarks.and.returnValue(of(page));
    const fixture = TestBed.createComponent(Rc2RemarksComponent);
    const c = fixture.componentInstance;
    fixture.detectChanges();
    c.onContext(ctx());
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Published — locked');
  });

  it('My report cards: a parent asks for the chosen child; the viewer shows the stored PDF', async () => {
    const query = new BehaviorSubject(convertToParamMap({ studentId: 'S1' }));
    api.myDocuments.and.returnValue(of([document()]));
    TestBed.overrideProvider(ActivatedRoute, { useValue: {
      queryParamMap: query, paramMap: of(convertToParamMap({ id: '900' })),
      snapshot: { queryParamMap: convertToParamMap({ studentId: 'S1' }) },
    } });
    const list = TestBed.createComponent(Rc2MyReportCardsComponent);
    list.detectChanges();
    expect(api.myDocuments).toHaveBeenCalledWith('S1');
    expect((list.nativeElement as HTMLElement).textContent).toContain('ANNUAL — REPORT CARD');

    api.getDocument.and.returnValue(of(document()));
    api.documentPdf.and.returnValue(of(new Blob(['%PDF'], { type: 'application/pdf' })));
    const view = TestBed.createComponent(Rc2DocumentViewComponent);
    view.detectChanges();
    await new Promise(r => setTimeout(r));
    view.detectChanges();
    expect(api.documentPdf).toHaveBeenCalledWith(900);
    const el = view.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Official copy');
    expect(el.textContent).toContain('RC-ABCDEFGHJK');
    expect(el.querySelector('iframe.dv-frame')).not.toBeNull();
  });

  it('Verify: a withdrawn V2 report card says so; legacy results look as before', () => {
    const answer = new BehaviorSubject<any>({ valid: false, status: 'WITHDRAWN', schoolName: 'School', reference: 'RC-ABCDEFGHJK', message: 'Withdrawn by the school.' });
    TestBed.overrideProvider(ActivatedRoute, { useValue: { snapshot: { queryParamMap: convertToParamMap({ token: 't' }) } } });
    TestBed.overrideProvider(HttpClient, { useValue: { get: () => answer } });
    const fixture = TestBed.createComponent(VerifyRcComponent);
    fixture.detectChanges();
    let el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('WITHDRAWN');
    expect(el.textContent).toContain('Withdrawn by the school.');
    expect(el.textContent).toContain('RC-ABCDEFGHJK');

    answer.next({ valid: true, schoolName: 'School', className: '8', session: '2026-2027', publishedAt: '2026-09-01' });
    const legacy = TestBed.createComponent(VerifyRcComponent);
    legacy.detectChanges();
    el = legacy.nativeElement as HTMLElement;
    expect(el.textContent).toContain('VERIFIED');
    expect(el.textContent).toContain('Published On');
    expect(el.textContent).not.toContain('Reference');
  });
});

/** Android: the real delivery service uses Capacitor on a device, never browser printing. */
describe('ReportCardPdfDeliveryService (Android)', () => {
  it('shares through Capacitor Filesystem + Share on a device', async () => {
    const { Capacitor } = await import('@capacitor/core');
    spyOn(Capacitor, 'isNativePlatform').and.returnValue(true);
    const service = new ReportCardPdfDeliveryService();
    const toBase64 = spyOn<any>(service, 'toBase64').and.resolveTo('JVBERg==');
    const printSpy = spyOn(window, 'print');
    expect(service.native).toBeTrue();
    // Filesystem/Share are native plugins (unavailable in the test browser): the call reaches them.
    await expectAsync(service.share(new Blob(['%PDF']), 'card.pdf')).toBeRejected();
    expect(toBase64).toHaveBeenCalled();
    expect(printSpy).not.toHaveBeenCalled();
  });

  it('downloads in a plain browser', async () => {
    const service = new ReportCardPdfDeliveryService();
    const download = spyOn(service, 'download');
    await service.share(new Blob(['%PDF']), 'card.pdf');
    expect(download).toHaveBeenCalled();
  });
});
