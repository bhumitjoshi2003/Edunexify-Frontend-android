import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of, throwError } from 'rxjs';

import { FeeGenerationTargetComponent } from './fee-generation-target.component';
import {
  FeeGenerationService, FeeGenerationStudentPreviewRow, FeeGenerationStudentResult
} from '../../services/fee-generation.service';
import { AcademicSessionService } from '../../services/academic-session.service';
import { AcademicSession } from '../../interfaces/academic-session';
import { SchoolService, SchoolClass } from '../../services/school.service';
import { LoggerService } from '../../services/logger.service';
import { ToastService } from '../../services/toast.service';

/**
 * E5B: target-enrollment-driven fee generation admin page. Exercises the full
 * preview → select → confirm → generate → result workflow, stale-preview invalidation,
 * warning/blocking-error surfacing, and per-student partial-success result rendering.
 */
describe('FeeGenerationTargetComponent', () => {
  let component: FeeGenerationTargetComponent;
  let fixture: ComponentFixture<FeeGenerationTargetComponent>;
  let feeGenerationServiceSpy: jasmine.SpyObj<FeeGenerationService>;
  let academicSessionServiceSpy: jasmine.SpyObj<AcademicSessionService>;
  let schoolServiceSpy: jasmine.SpyObj<SchoolService>;
  let toastSpy: jasmine.SpyObj<ToastService>;
  let queryParamValue: string | null;

  const session = (id: number, label: string, startDate: string, endDate: string, current = false): AcademicSession =>
    ({ id, label, startDate, endDate, current });

  const CURRENT = session(1, '2025-2026', '2025-04-01', '2026-03-31', true);
  const TARGET = session(2, '2026-2027', '2026-04-01', '2027-03-31', false);
  const UNRELATED = session(3, '2024-2025', '2024-04-01', '2025-03-31', false);

  const schoolClass = (id: number, name: string, displayOrder: number): SchoolClass =>
    ({ id, name, displayOrder, active: true, streamEligible: false });

  function row(overrides: Partial<FeeGenerationStudentPreviewRow> = {}): FeeGenerationStudentPreviewRow {
    return {
      studentId: 'S1',
      studentName: 'Student One',
      targetEnrollmentId: 500,
      targetEnrollmentStatus: 'ACTIVE',
      targetClassId: 10,
      targetClassName: '9',
      targetSectionId: 20,
      targetSectionName: 'A',
      repeatingSameClass: null,
      totalDue: 12000,
      months: Array.from({ length: 12 }, (_, i) => ({
        month: i + 1, alreadyGenerated: false, willGenerate: true, baseAmountDue: 1000, discountAmount: 0, busFeeDue: 0, total: 1000, message: null
      })),
      alreadyGeneratedMonths: [],
      generatableMonths: Array.from({ length: 12 }, (_, i) => i + 1),
      warnings: [],
      blockingErrors: [],
      eligible: true,
      ...overrides,
    };
  }

  beforeEach(async () => {
    queryParamValue = null;
    feeGenerationServiceSpy = jasmine.createSpyObj('FeeGenerationService', ['getTargetPreview', 'generateTargetFees', 'getTargetDrift']);
    academicSessionServiceSpy = jasmine.createSpyObj('AcademicSessionService', ['getAllSessions']);
    schoolServiceSpy = jasmine.createSpyObj('SchoolService', ['getManagedClasses']);
    toastSpy = jasmine.createSpyObj('ToastService', ['success', 'error', 'warning', 'info', 'confirm']);

    academicSessionServiceSpy.getAllSessions.and.returnValue(of([CURRENT, TARGET, UNRELATED]));
    schoolServiceSpy.getManagedClasses.and.returnValue(of([schoolClass(10, '9', 1), schoolClass(11, '10', 2)]));

    await TestBed.configureTestingModule({
      imports: [FeeGenerationTargetComponent],
      providers: [
        { provide: FeeGenerationService, useValue: feeGenerationServiceSpy },
        { provide: AcademicSessionService, useValue: academicSessionServiceSpy },
        { provide: SchoolService, useValue: schoolServiceSpy },
        { provide: LoggerService, useValue: jasmine.createSpyObj('LoggerService', ['error', 'warn', 'info']) },
        { provide: ToastService, useValue: toastSpy },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({ ...(queryParamValue ? { targetSessionId: queryParamValue } : {}) }) } }
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(FeeGenerationTargetComponent);
    component = fixture.componentInstance;
  });

  // ─── Session loading + defaulting ───────────────────────────────────────

  it('loads sessions and classes, and defaults target to the session contiguous with the current one', () => {
    fixture.detectChanges();

    expect(academicSessionServiceSpy.getAllSessions).toHaveBeenCalled();
    expect(schoolServiceSpy.getManagedClasses).toHaveBeenCalled();
    expect(component.sessionsLoading).toBeFalse();
    expect(component.targetSessionId).toBe(TARGET.id);
  });

  it('leaves target unset when no existing session is contiguous with the current one', () => {
    academicSessionServiceSpy.getAllSessions.and.returnValue(of([CURRENT, UNRELATED]));
    fixture.detectChanges();

    expect(component.targetSessionId).toBeNull();
  });

  it('degrades safely on a session-loading error', () => {
    academicSessionServiceSpy.getAllSessions.and.returnValue(throwError(() => new Error('network error')));
    fixture.detectChanges();

    expect(component.sessionsLoading).toBeFalse();
    expect(toastSpy.error).toHaveBeenCalled();
  });

  it('prefers a deep-linked targetSessionId query param over the contiguous-session default', async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [FeeGenerationTargetComponent],
      providers: [
        { provide: FeeGenerationService, useValue: feeGenerationServiceSpy },
        { provide: AcademicSessionService, useValue: academicSessionServiceSpy },
        { provide: SchoolService, useValue: schoolServiceSpy },
        { provide: LoggerService, useValue: jasmine.createSpyObj('LoggerService', ['error', 'warn', 'info']) },
        { provide: ToastService, useValue: toastSpy },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({ targetSessionId: String(UNRELATED.id) }) } }
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(FeeGenerationTargetComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.targetSessionId).toBe(UNRELATED.id);
  });

  // ─── Preview loading ─────────────────────────────────────────────────────

  it('loads the preview and selects nobody by default, even eligible rows', () => {
    feeGenerationServiceSpy.getTargetPreview.and.returnValue(of([row(), row({ studentId: 'S2', eligible: false, blockingErrors: ['No fee rule configured'] })]));
    fixture.detectChanges();

    component.loadPreview();

    expect(feeGenerationServiceSpy.getTargetPreview).toHaveBeenCalledWith(TARGET.id, null, null);
    expect(component.preview.length).toBe(2);
    expect(component.selected.size).toBe(0);
    expect(component.canGenerate).toBeFalse();
    expect(component.canSelect(component.preview[0])).toBeTrue();
    expect(component.canSelect(component.preview[1])).toBeFalse();
  });

  it('a row with nothing to generate cannot be selected, even by select-all', () => {
    feeGenerationServiceSpy.getTargetPreview.and.returnValue(of([row({
      alreadyGeneratedMonths: Array.from({ length: 12 }, (_, i) => i + 1), generatableMonths: [] })]));
    fixture.detectChanges();
    component.loadPreview();

    component.selectAllGeneratable();
    component.toggleSelected(component.preview[0]);
    expect(component.isSelected('S1')).toBeFalse();
    expect(component.nothingToGenerateCount).toBe(1);
  });

  it('shows a toast and stops loading on a preview error', () => {
    feeGenerationServiceSpy.getTargetPreview.and.returnValue(throwError(() => new Error('boom')));
    fixture.detectChanges();
    component.loadPreview();

    expect(component.previewLoading).toBeFalse();
    expect(toastSpy.error).toHaveBeenCalled();
  });

  // ─── Stale-preview protection ────────────────────────────────────────────

  it('marks the preview stale the instant the target session or a filter changes', () => {
    feeGenerationServiceSpy.getTargetPreview.and.returnValue(of([row()]));
    fixture.detectChanges();
    component.loadPreview();
    expect(component.previewIsStale).toBeFalse();

    component.targetSessionId = UNRELATED.id;
    component.onTargetSessionChange();

    expect(component.previewIsStale).toBeTrue();
    expect(component.preview.length).toBe(0);
    expect(component.canGenerate).toBeFalse();
  });

  it('never allows generate while the preview is stale, even with selections present', () => {
    feeGenerationServiceSpy.getTargetPreview.and.returnValue(of([row()]));
    fixture.detectChanges();
    component.loadPreview();
    component.classFilter = 10;

    expect(component.previewIsStale).toBeTrue();
    expect(component.canGenerate).toBeFalse();
  });

  // ─── Selection ───────────────────────────────────────────────────────────

  it('toggles selection for an eligible row but ignores toggles on a blocked row', () => {
    const blocked = row({ studentId: 'S2', eligible: false, blockingErrors: ['No fee rule configured'] });
    feeGenerationServiceSpy.getTargetPreview.and.returnValue(of([row(), blocked]));
    fixture.detectChanges();
    component.loadPreview();

    component.toggleSelected(component.preview[0]);
    expect(component.isSelected('S1')).toBeTrue();
    component.toggleSelected(component.preview[0]);
    expect(component.isSelected('S1')).toBeFalse();

    component.toggleSelected(blocked);
    expect(component.isSelected('S2')).toBeFalse();
  });

  it('computes eligible/blocked counts and the selected-rows total', () => {
    feeGenerationServiceSpy.getTargetPreview.and.returnValue(of([
      row({ studentId: 'S1', totalDue: 1000 }),
      row({ studentId: 'S2', totalDue: 2000 }),
      row({ studentId: 'S3', eligible: false, blockingErrors: ['x'] }),
    ]));
    fixture.detectChanges();
    component.loadPreview();

    expect(component.eligibleCount).toBe(2);
    expect(component.blockedCount).toBe(1);
    expect(component.selectedRows.length).toBe(0);
    component.selectAllGeneratable();
    expect(component.selectedRows.length).toBe(2);
    expect(component.selectedMonthCount).toBe(24);
  });

  // ─── Warnings / PLANNED messaging ────────────────────────────────────────

  it('carries a PLANNED enrollment warning and a missing-transport-assignment warning through to the row without blocking it', () => {
    const planned = row({
      targetEnrollmentStatus: 'PLANNED',
      warnings: ['This enrollment is recorded for the upcoming session and is not yet active.',
        'No transport assignment recorded for the target session; current transport status will be used.']
    });
    feeGenerationServiceSpy.getTargetPreview.and.returnValue(of([planned]));
    fixture.detectChanges();
    component.loadPreview();

    expect(component.preview[0].eligible).toBeTrue();
    expect(component.preview[0].warnings.length).toBe(2);
    expect(component.canSelect(component.preview[0])).toBeTrue();
  });

  // ─── Confirmation + generate ─────────────────────────────────────────────

  it('does nothing when the admin cancels the confirmation dialog', async () => {
    feeGenerationServiceSpy.getTargetPreview.and.returnValue(of([row()]));
    fixture.detectChanges();
    component.loadPreview();
    component.selectAllGeneratable();
    toastSpy.confirm.and.returnValue(Promise.resolve(false));

    await component.confirmAndGenerate();

    expect(feeGenerationServiceSpy.generateTargetFees).not.toHaveBeenCalled();
  });

  it('builds the generate request from the loaded preview\'s authoritative IDs after confirmation', async () => {
    feeGenerationServiceSpy.getTargetPreview.and.returnValue(of([row({ targetEnrollmentId: 777, targetClassId: 42 })]));
    fixture.detectChanges();
    component.loadPreview();
    component.selectAllGeneratable();
    toastSpy.confirm.and.returnValue(Promise.resolve(true));
    feeGenerationServiceSpy.generateTargetFees.and.returnValue(of([
      { studentId: 'S1', outcome: 'GENERATED', generatedMonths: 12, skippedMonths: 0, message: 'Generation completed.' }
    ]));

    await component.confirmAndGenerate();

    expect(feeGenerationServiceSpy.generateTargetFees).toHaveBeenCalledWith({
      targetSessionId: TARGET.id,
      decisions: [{ studentId: 'S1', expectedTargetEnrollmentId: 777, expectedTargetClassId: 42 }],
    });
  });

  it('reloads the preview after a successful generate to reflect authoritative state', async () => {
    feeGenerationServiceSpy.getTargetPreview.and.returnValue(of([row()]));
    fixture.detectChanges();
    component.loadPreview();
    component.selectAllGeneratable();
    toastSpy.confirm.and.returnValue(Promise.resolve(true));
    feeGenerationServiceSpy.generateTargetFees.and.returnValue(of([
      { studentId: 'S1', outcome: 'GENERATED', generatedMonths: 12, skippedMonths: 0, message: 'Generation completed.' }
    ]));

    await component.confirmAndGenerate();

    expect(feeGenerationServiceSpy.getTargetPreview).toHaveBeenCalledTimes(2);
    expect(component.results?.length).toBe(1);
  });

  it('shows an error toast and never clears the preview on a generate failure', async () => {
    feeGenerationServiceSpy.getTargetPreview.and.returnValue(of([row()]));
    fixture.detectChanges();
    component.loadPreview();
    component.selectAllGeneratable();
    toastSpy.confirm.and.returnValue(Promise.resolve(true));
    feeGenerationServiceSpy.generateTargetFees.and.returnValue(throwError(() => new Error('boom')));

    await component.confirmAndGenerate();

    expect(toastSpy.error).toHaveBeenCalled();
    expect(component.executing).toBeFalse();
    expect(component.preview.length).toBe(1);
  });

  // ─── Double-submit prevention ────────────────────────────────────────────

  it('blocks a second generate call while one is already in flight', async () => {
    feeGenerationServiceSpy.getTargetPreview.and.returnValue(of([row()]));
    fixture.detectChanges();
    component.loadPreview();
    component.selectAllGeneratable();
    toastSpy.confirm.and.returnValue(Promise.resolve(true));
    feeGenerationServiceSpy.generateTargetFees.and.returnValue(of([]));

    component.executing = true;
    await component.confirmAndGenerate();

    expect(feeGenerationServiceSpy.generateTargetFees).not.toHaveBeenCalled();
  });

  // ─── Result rendering ────────────────────────────────────────────────────

  it('classifies outcomes and summarizes per-student results without a single generic toast', () => {
    component.results = [
      { studentId: 'S1', outcome: 'GENERATED', generatedMonths: 12, skippedMonths: 0, message: 'Generation completed.' },
      { studentId: 'S2', outcome: 'ALREADY_GENERATED', generatedMonths: 0, skippedMonths: 12, message: 'All months already generated.' },
      { studentId: 'S3', outcome: 'ENROLLMENT_CHANGED', generatedMonths: 0, skippedMonths: 0, message: 'Target class has changed since preview.' },
    ] as FeeGenerationStudentResult[];

    expect(component.isSuccessOutcome('GENERATED')).toBeTrue();
    expect(component.isSuccessOutcome('PARTIALLY_GENERATED')).toBeTrue();
    expect(component.isInfoOutcome('ALREADY_GENERATED')).toBeTrue();
    expect(component.isSuccessOutcome('ENROLLMENT_CHANGED')).toBeFalse();
    expect(component.isInfoOutcome('ENROLLMENT_CHANGED')).toBeFalse();

    const summary = component.summaryEntries();
    expect(summary).toContain({ code: 'GENERATED', count: 1 });
    expect(summary).toContain({ code: 'ALREADY_GENERATED', count: 1 });
    expect(summary).toContain({ code: 'ENROLLMENT_CHANGED', count: 1 });
  });

  it('dismisses results without touching the loaded preview', () => {
    feeGenerationServiceSpy.getTargetPreview.and.returnValue(of([row()]));
    fixture.detectChanges();
    component.loadPreview();
    component.results = [{ studentId: 'S1', outcome: 'GENERATED', generatedMonths: 12, skippedMonths: 0, message: 'ok' }];

    component.dismissResults();

    expect(component.results).toBeNull();
    expect(component.preview.length).toBe(1);
  });

  // ─── E5C read-only drift review ───

  const driftRow = (status: any = 'CLASS_MISMATCH') => ({
    studentId: status === 'CLEAN' ? 'S-CLEAN' : 'S-DRIFT', studentName: 'Student',
    targetSessionId: TARGET.id, targetSessionLabel: TARGET.label,
    authoritativeEnrollmentId: 500, authoritativeEnrollmentStatus: 'PLANNED',
    enrollmentClassId: 10, enrollmentClassName: '9', generatedClassId: status === 'CLEAN' ? 10 : 11,
    generatedClassName: status === 'CLEAN' ? '9' : '10', generatedClassIds: [status === 'CLEAN' ? 10 : 11],
    generatedClassNames: [status === 'CLEAN' ? '9' : '10'], generatedMonths: [1, 2],
    expectedMonths: Array.from({ length: 12 }, (_, i) => i + 1), missingMonths: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    driftStatus: status, warnings: status === 'CLEAN' ? [] : ['Generated fee class evidence differs.'],
  });

  it('loads drift using the selected session, class, and student filters', () => {
    feeGenerationServiceSpy.getTargetDrift.and.returnValue(of([driftRow()]));
    fixture.detectChanges();
    component.classFilter = 10; component.studentIdFilter = ' S1 ';

    component.loadDrift();

    expect(feeGenerationServiceSpy.getTargetDrift).toHaveBeenCalledWith(TARGET.id, 10, 'S1');
    expect(component.driftLoading).toBeFalse();
    expect(component.driftRows.length).toBe(1);
  });

  it('filters drift status and renders clean/action-needed guidance without a fix button', () => {
    feeGenerationServiceSpy.getTargetDrift.and.returnValue(of([driftRow('CLEAN'), driftRow()]));
    fixture.detectChanges(); component.toggleDriftReview(); fixture.detectChanges();
    let text = (fixture.nativeElement as HTMLElement).textContent || '';
    expect(text).toContain('Clean'); expect(text).toContain('action-needed');
    expect(text).toContain("Review this student's enrollment and use the existing explicit fee recalculation workflow if correction is required.");
    expect(text).not.toContain('Fix');

    component.driftStatusFilter = 'CLEAN'; fixture.detectChanges();
    expect(component.visibleDriftRows.length).toBe(1);
  });

  it('surfaces drift API errors and leaves the workflow read-only', () => {
    feeGenerationServiceSpy.getTargetDrift.and.returnValue(throwError(() => new Error('offline')));
    fixture.detectChanges(); component.loadDrift();
    expect(component.driftLoading).toBeFalse();
    expect(toastSpy.error).toHaveBeenCalledWith('Error', 'Failed to load fee and enrollment mismatches.');
    expect(feeGenerationServiceSpy.generateTargetFees).not.toHaveBeenCalled();
  });

  // ─── Shared by the web and Android clients — keep the two copies identical. ───

  it('classifies every drift status: no target enrollment is informational, mismatches need action', () => {
    expect(component.driftLevel('CLEAN')).toBe('clean');
    expect(component.driftLevel('NO_TARGET_ENROLLMENT')).toBe('informational');
    expect(component.driftLevel('CLASS_MISMATCH')).toBe('action-needed');
    expect(component.driftLevel('PARTIAL_GENERATION')).toBe('action-needed');
    expect(component.driftLevel('CANCELLED_TARGET_WITH_FEES')).toBe('action-needed');
    expect(component.driftLabel('NO_TARGET_ENROLLMENT')).toBe('No Target Enrollment');
  });

  it('failed and unconfigured outcomes are neither success nor info, and are counted per code', () => {
    component.results = [
      { studentId: 'S1', outcome: 'PARTIALLY_GENERATED', generatedMonths: 6, skippedMonths: 6, message: 'Some months already existed.' },
      { studentId: 'S2', outcome: 'FAILED', generatedMonths: 0, skippedMonths: 0, message: 'Unexpected error.' },
      { studentId: 'S3', outcome: 'NO_RULE_CONFIGURED', generatedMonths: 0, skippedMonths: 0, message: 'No fee rule.' },
    ] as FeeGenerationStudentResult[];
    expect(component.isSuccessOutcome('FAILED')).toBeFalse();
    expect(component.isInfoOutcome('FAILED')).toBeFalse();
    expect(component.isSuccessOutcome('NO_RULE_CONFIGURED')).toBeFalse();
    const summary = component.summaryEntries();
    expect(summary).toContain({ code: 'PARTIALLY_GENERATED', count: 1 });
    expect(summary).toContain({ code: 'FAILED', count: 1 });
    expect(summary).toContain({ code: 'NO_RULE_CONFIGURED', count: 1 });
  });

  it('a row with some months already generated stays selectable, and those months are not counted again', () => {
    const partial = row({ alreadyGeneratedMonths: [1, 2, 3], totalDue: 9000 });
    feeGenerationServiceSpy.getTargetPreview.and.returnValue(of([partial]));
    fixture.detectChanges();
    component.loadPreview();
    expect(component.canSelect(component.preview[0])).toBeTrue();
    expect(component.nothingToGenerateCount).toBe(0);
  });

  // ─── FA-2: only eligible periods, explicit scope, single confirmation ────

  function currentSessionRow(): FeeGenerationStudentPreviewRow {
    // Seven months into the session: Apr–Oct skipped, Nov already generated, Dec–Mar will generate.
    return row({
      studentId: 'S2', studentName: 'Isha Verma', totalDue: 5200,
      months: Array.from({ length: 12 }, (_, i) => ({
        month: i + 1, alreadyGenerated: i === 7, willGenerate: i > 7,
        baseAmountDue: i >= 7 ? 1000 : 0, discountAmount: 0, busFeeDue: i >= 7 ? 300 : 0, total: i >= 7 ? 1300 : 0,
        message: i < 7 ? "Before this class's fee rules take effect." : i === 7 ? 'Already generated' : null,
      })),
      alreadyGeneratedMonths: [8], generatableMonths: [9, 10, 11, 12],
    });
  }

  it('renders skipped months without amounts, with their reason, and the exact scope that will be generated', () => {
    feeGenerationServiceSpy.getTargetPreview.and.returnValue(of([currentSessionRow()]));
    fixture.detectChanges();
    component.loadPreview();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const cells = Array.from(el.querySelectorAll('.fg-month-cell'));
    expect(cells.filter(c => c.classList.contains('fg-month-skipped')).length).toBe(7);
    expect(cells.slice(0, 7).every(c => c.querySelector('.fg-month-amount')!.textContent!.trim() === '—')).toBeTrue();
    expect(el.querySelector('.fg-skip-list')!.textContent).toContain("Skipped M1, M2, M3, M4, M5, M6, M7: Before this class's fee rules take effect.");
    expect(el.querySelector('[data-testid=generatable-scope]')!.textContent).toContain('December 2026 – March 2027 (4 months)');
    expect((el.querySelector('.fg-checkbox-wrap input') as HTMLInputElement).checked).toBeFalse();
  });

  it('the confirmation states the month count and per-student scope, and the request carries only the student decision', async () => {
    feeGenerationServiceSpy.getTargetPreview.and.returnValue(of([currentSessionRow()]));
    fixture.detectChanges();
    component.loadPreview();
    component.toggleSelected(component.preview[0]);
    toastSpy.confirm.and.returnValue(Promise.resolve(true));
    feeGenerationServiceSpy.generateTargetFees.and.returnValue(of([
      { studentId: 'S2', outcome: 'PARTIALLY_GENERATED', generatedMonths: 4, skippedMonths: 8, message: 'Generation completed.' }
    ]));

    await component.confirmAndGenerate();

    const html = (toastSpy.confirm.calls.mostRecent().args[0] as { html: string }).html;
    expect(html).toContain('<strong>4</strong> month(s)');
    expect(html).toContain('Isha Verma: December 2026 – March 2027 (4 months)');
    expect(feeGenerationServiceSpy.generateTargetFees).toHaveBeenCalledOnceWith({
      targetSessionId: TARGET.id,
      decisions: [{ studentId: 'S2', expectedTargetEnrollmentId: 500, expectedTargetClassId: 10 }],
    });
  });

  it('lists every month when the generatable months are not contiguous', () => {
    feeGenerationServiceSpy.getTargetPreview.and.returnValue(of([row({ generatableMonths: [7, 10, 11, 12] })]));
    fixture.detectChanges();
    component.loadPreview();
    expect(component.generatableScope(component.preview[0]))
      .toBe('October 2026, January 2027, February 2027, March 2027 (4 months)');
  });

  it('a second click while the confirmation is open never opens another dialog or submits twice', async () => {
    feeGenerationServiceSpy.getTargetPreview.and.returnValue(of([row()]));
    fixture.detectChanges();
    component.loadPreview();
    component.selectAllGeneratable();
    let resolve!: (v: boolean) => void;
    toastSpy.confirm.and.returnValue(new Promise<boolean>(r => resolve = r));
    feeGenerationServiceSpy.generateTargetFees.and.returnValue(of([]));

    const first = component.confirmAndGenerate();
    await component.confirmAndGenerate();
    resolve(true);
    await first;

    expect(toastSpy.confirm).toHaveBeenCalledTimes(1);
    expect(feeGenerationServiceSpy.generateTargetFees).toHaveBeenCalledTimes(1);
  });

  it('shows the in-flight spinner and disables selection while generating', () => {
    feeGenerationServiceSpy.getTargetPreview.and.returnValue(of([row()]));
    fixture.detectChanges();
    component.loadPreview();
    component.selectAllGeneratable();
    component.executing = true;
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.fg-execute-btn .fg-btn-spinner')).not.toBeNull();
    expect((el.querySelector('.fg-execute-btn') as HTMLButtonElement).disabled).toBeTrue();
    expect((el.querySelector('.fg-checkbox-wrap input') as HTMLInputElement).disabled).toBeTrue();
  });

  it('summarises created and skipped months across the run', () => {
    component.results = [
      { studentId: 'S1', outcome: 'ALREADY_GENERATED', generatedMonths: 0, skippedMonths: 12, message: 'Nothing to generate.' },
      { studentId: 'S2', outcome: 'PARTIALLY_GENERATED', generatedMonths: 4, skippedMonths: 8, message: 'Generation completed.' },
      { studentId: 'S3', outcome: 'NOT_ELIGIBLE', generatedMonths: 0, skippedMonths: 12, message: 'Excluded from fees.' },
    ] as FeeGenerationStudentResult[];
    fixture.detectChanges();

    expect(component.resultTotals).toEqual({ created: 4, skipped: 32 });
    expect(component.isInfoOutcome('NOT_ELIGIBLE')).toBeTrue();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid=result-totals]')!.textContent)
      .toContain('4 months created');
  });
});
