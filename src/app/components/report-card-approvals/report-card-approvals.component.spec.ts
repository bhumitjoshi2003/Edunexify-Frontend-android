import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { Subject, of, throwError } from 'rxjs';
import { ReportCardApprovalsComponent } from './report-card-approvals.component';
import {
  ReportCardApprovalService,
  ApprovalItem,
  ReviewSummary,
} from '../../services/report-card-approval.service';
import { AuthStateService } from '../../auth/auth-state.service';
import { ToastService } from '../../services/toast.service';
import { ReportCardPdfDeliveryService } from '../../services/report-card-pdf-delivery.service';
import { routes } from '../../app.routes';

describe('Revision-bound report-card approval', () => {
  let api: jasmine.SpyObj<ReportCardApprovalService>,
    toast: jasmine.SpyObj<ToastService>;
  let component: ReportCardApprovalsComponent;
  const item: ApprovalItem = {
    setupId: 10,
    setupName: 'Annual',
    className: '8',
    sectionId: 20,
    sectionName: 'A',
    status: 'PENDING_TEACHER',
    stale: false,
  };
  const summary: ReviewSummary = {
    revisionId: 'rev-1',
    fingerprint: 'fingerprint',
    academicSession: '2026-2027',
    setupName: 'Annual',
    className: '8',
    sectionName: 'A',
    attendanceCutoff: '2026-11-07',
    includeIncomplete: false,
    totalStudents: 4,
    completeCards: 3,
    incompleteCards: 1,
    missingMarks: 2,
    excludedStudents: 1,
    includedStudents: 3,
    teacherUserId: 'teacher-a',
    students: [],
    state: {
      status: 'PENDING_TEACHER',
      stale: false,
      reviewRevisionId: null,
      stateVersion: 0,
      teacherUserId: null,
      principalUserId: null,
      returnReason: null,
    },
  };
  beforeEach(() => {
    api = jasmine.createSpyObj('ReportCardApprovalService', [
      'queue',
      'review',
      'act',
      'history',
      'preview',
    ]);
    api.queue.and.returnValue(of([item]));
    api.review.and.returnValue(of(structuredClone(summary)));
    api.history.and.returnValue(of([]));
    api.act.and.returnValue(
      of({
        ...summary.state,
        status: 'TEACHER_APPROVED',
        reviewRevisionId: 'rev-1',
        stateVersion: 1,
      })
    );
    toast = jasmine.createSpyObj('ToastService', [
      'confirm',
      'success',
      'error',
    ]);
    toast.confirm.and.resolveTo(true);
    TestBed.configureTestingModule({
      imports: [ReportCardApprovalsComponent],
      providers: [
        provideRouter([]),
        { provide: ReportCardApprovalService, useValue: api },
        {
          provide: AuthStateService,
          useValue: { getUserRole: () => 'TEACHER' },
        },
        { provide: ToastService, useValue: toast },
        {
          provide: MatDialog,
          useValue: jasmine.createSpyObj('MatDialog', ['open']),
        },
        { provide: ReportCardPdfDeliveryService, useValue: { native: false } },
      ],
    });
    const fixture = TestBed.createComponent(ReportCardApprovalsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });
  it('cannot approve before opening a review or after cancelling confirmation', async () => {
    await component.act('teacher-approve');
    expect(api.act).not.toHaveBeenCalled();
    component.review(item);
    toast.confirm.and.resolveTo(false);
    await component.act('teacher-approve');
    expect(api.act).not.toHaveBeenCalled();
  });
  it('confirms scope, counts and revision, and sends that exact revision', async () => {
    component.review(item);
    await component.act('teacher-approve');
    const message = toast.confirm.calls.mostRecent().args[0].message!;
    for (const text of [
      '2026-2027',
      'Annual',
      '8',
      'A',
      '3 included',
      '1 excluded',
      'rev-1',
    ])
      expect(message).toContain(text);
    expect(api.act.calls.mostRecent().args[2]).toBe('rev-1');
  });
  it('requires fresh review after 409 instead of silently retrying changed content', async () => {
    api.act.and.returnValue(throwError(() => ({ status: 409 })));
    component.review(item);
    await component.act('teacher-approve');
    expect(component.summary).toBeNull();
    await component.act('teacher-approve');
    expect(api.act).toHaveBeenCalledTimes(1);
  });
  it('reuses the request ID after an uncertain transport failure', async () => {
    api.act.and.returnValue(throwError(() => ({ status: 0 })));
    component.review(item);
    await component.act('teacher-approve');
    const first = api.act.calls.mostRecent().args[3];
    await component.act('teacher-approve');
    expect(api.act.calls.mostRecent().args[3]).toBe(first);
  });
  it('cancels stale review responses when another scope is opened', () => {
    const first = new Subject<ReviewSummary>(),
      second = new Subject<ReviewSummary>();
    api.review.and.returnValues(first, second);
    component.review(item);
    component.review({ ...item, sectionId: 21, sectionName: 'B' });
    second.next({ ...summary, revisionId: 'rev-b' });
    first.next(summary);
    expect(component.summary?.revisionId).toBe('rev-b');
  });
  it('does not submit a confirmation after the page is destroyed', async () => {
    let resolve!: (answer: boolean) => void;
    toast.confirm.and.returnValue(new Promise((r) => (resolve = r)));
    component.review(item);
    const result = component.act('teacher-approve');
    component.ngOnDestroy();
    resolve(true);
    await result;
    expect(api.act).not.toHaveBeenCalled();
  });
  it('uses native delivery for a frozen revision instead of an iframe', async () => {
    const delivery = TestBed.inject(
      ReportCardPdfDeliveryService
    ) as unknown as { native: boolean; share: jasmine.Spy };
    delivery.native = true;
    delivery.share = jasmine.createSpy('share').and.resolveTo();
    const blob = new Blob(['review-pdf'], { type: 'application/pdf' });
    api.preview.and.returnValue(of(blob));
    component.review(item);
    component.selectedStudent = 'student-a';
    component.preview();
    await Promise.resolve();
    expect(api.preview).toHaveBeenCalledWith(item, 'rev-1', 'student-a');
    expect(delivery.share).toHaveBeenCalledWith(
      blob,
      'Review_rev-1_student-a.pdf'
    );
  });
  it('does not expose Principal actions to teacher or Admin actions to Principal', async () => {
    component.review(item);
    await component.act('principal-approve');
    expect(api.act).not.toHaveBeenCalled();
    component.role = 'PRINCIPAL';
    component.summary = {
      ...summary,
      state: {
        ...summary.state,
        status: 'TEACHER_APPROVED',
        reviewRevisionId: 'rev-1',
      },
    };
    await component.act('teacher-approve');
    expect(api.act).not.toHaveBeenCalled();
    const dashboard = routes.find((r) => r.path === 'dashboard')!;
    expect(
      dashboard.children!.find((r) => r.path === 'report-card-approvals')!
        .data!['roles']
    ).toEqual(['ADMIN', 'TEACHER', 'PRINCIPAL']);
  });
});
