import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { CoordinatorReportCardsComponent } from './coordinator-report-cards.component';
import { CoordinatorService } from '../../services/coordinator.service';
import { ReportCardV2Service } from '../../services/report-card-v2.service';
import { ReportCardPdfDeliveryService } from '../../services/report-card-pdf-delivery.service';
import { ToastService } from '../../services/toast.service';
import { CoordinatorReportCardProgress } from '../../interfaces/coordinator';

/** Shared by the web and Android clients — keep the two copies identical. */
describe('CoordinatorReportCardsComponent', () => {
  let fixture: ComponentFixture<CoordinatorReportCardsComponent>;
  let component: CoordinatorReportCardsComponent;
  let coordinators: jasmine.SpyObj<CoordinatorService>;

  const row: CoordinatorReportCardProgress = {
    setupId: 7, setupName: 'Term 1', classId: 8, className: '8', sectionId: 81, sectionName: 'A', students: 2,
    complete: 1, incomplete: 1, noResult: 0, missingTeacherRemarks: 1, approvalStatus: 'NOT_REQUIRED', correctionRequests: 0,
  };

  beforeEach(() => {
    coordinators = jasmine.createSpyObj('CoordinatorService', ['reportCards', 'corrections', 'requestCorrection']);
    coordinators.reportCards.and.returnValue(of([row, { ...row, setupId: 8, complete: 2, incomplete: 0, missingTeacherRemarks: 0 }]));
    coordinators.corrections.and.returnValue(of([]));
    coordinators.requestCorrection.and.returnValue(of({ id: 1, setupId: 7, sectionId: 81, studentId: 'S1', studentName: 'Ravi',
      teacherId: 'T8A', teacherName: 'Class teacher', requestedBy: 'C1', reason: 'Maths missing', createdAt: '' }));
    const cards = { getSummary: () => of({ setupId: 7, setupName: 'Term 1', resultMode: 'TOTAL', className: '8', sessionLabel: '2026-2027',
      sectionId: 81, teacherView: true, readiness: { draftExams: [], students: 1, incomplete: 1, noResult: 0, missingTeacherRemarks: 1,
        missingPrincipalRemarks: 0, missingCoScholastic: 0, missingPhotos: 0 },
      students: [{ studentId: 'S1', studentName: 'Ravi', sectionId: 81, sectionName: 'A', percentage: null, grade: null, rank: null,
        status: 'INCOMPLETE', marksMissing: 2, hasTeacherRemark: false, hasPrincipalRemark: false, coScholasticComplete: true, hasPhoto: true }] }) };
    TestBed.configureTestingModule({
      imports: [CoordinatorReportCardsComponent],
      providers: [
        { provide: CoordinatorService, useValue: coordinators },
        { provide: ReportCardV2Service, useValue: cards },
        { provide: ReportCardPdfDeliveryService, useValue: jasmine.createSpyObj('ReportCardPdfDeliveryService', ['open']) },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['success', 'error']) },
      ],
    });
    fixture = TestBed.createComponent(CoordinatorReportCardsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('separates complete and pending sections', () => {
    component.filter = 'pending';
    expect(component.visible.map(r => r.setupId)).toEqual([7]);
    component.filter = 'complete';
    expect(component.visible.map(r => r.setupId)).toEqual([8]);
  });

  it('lists what is missing per student and offers no approval or publication action', () => {
    component.open(row);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('2 marks missing');
    expect(text).toContain('no teacher remark');
    expect(text).not.toMatch(/Approve|Publish|Sign/);
  });

  it('sends a correction request only with a reason, for the chosen student', () => {
    component.open(row);
    component.ask('S1', 'Ravi');
    component.reason = ' ';
    component.send();
    expect(coordinators.requestCorrection).not.toHaveBeenCalled();
    component.reason = 'Maths missing';
    component.send();
    expect(coordinators.requestCorrection).toHaveBeenCalledWith(7, 81, 'Maths missing', 'S1');
    expect(component.requestFor).toBeNull();
  });
});
