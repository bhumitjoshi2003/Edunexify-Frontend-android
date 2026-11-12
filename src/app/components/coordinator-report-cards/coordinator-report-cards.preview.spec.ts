import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { CoordinatorReportCardsComponent } from './coordinator-report-cards.component';
import { ReportCardPreviewDialogComponent } from './report-card-preview-dialog.component';
import { CoordinatorService } from '../../services/coordinator.service';
import { ReportCardV2Service } from '../../services/report-card-v2.service';
import { ReportCardPdfDeliveryService } from '../../services/report-card-pdf-delivery.service';
import { ToastService } from '../../services/toast.service';

/**
 * Shared by the web and Android clients — keep the two copies identical.
 * Preview shows the report card inside Edunexify (no download); Download is a separate action.
 */
describe('CoordinatorReportCardsComponent — preview and download', () => {
  const pdf = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
  const student = { studentId: 'S1', studentName: 'Ravi Kumar' } as any;
  let delivery: jasmine.SpyObj<ReportCardPdfDeliveryService>;
  let dialog: jasmine.SpyObj<MatDialog>;
  let cards: { previewPdf: jasmine.Spy };

  function create() {
    delivery = jasmine.createSpyObj('ReportCardPdfDeliveryService', ['open', 'saveToDevice', 'previewPages'], { native: false });
    delivery.saveToDevice.and.resolveTo();
    dialog = jasmine.createSpyObj('MatDialog', ['open']);
    cards = { previewPdf: jasmine.createSpy('previewPdf').and.returnValue(of(pdf)) };
    TestBed.configureTestingModule({
      imports: [CoordinatorReportCardsComponent],
      providers: [
        { provide: CoordinatorService, useValue: { reportCards: () => of([]), corrections: () => of([]) } },
        { provide: ReportCardV2Service, useValue: cards },
        { provide: ReportCardPdfDeliveryService, useValue: delivery },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['success', 'error']) },
      ],
    });
    TestBed.overrideProvider(MatDialog, { useValue: dialog });
    const c = TestBed.createComponent(CoordinatorReportCardsComponent).componentInstance;
    c.selected = { setupId: 7 } as any;
    return c;
  }

  it('Preview opens the in-app viewer for that student and downloads nothing', () => {
    const c = create();
    c.preview(student);
    expect(dialog.open).toHaveBeenCalledWith(ReportCardPreviewDialogComponent, jasmine.objectContaining({
      data: jasmine.objectContaining({ studentName: 'Ravi Kumar', fileName: 'Ravi_Kumar_Preview.pdf' }) }));
    expect(delivery.saveToDevice).not.toHaveBeenCalled();
    expect(delivery.open).not.toHaveBeenCalled();
  });

  it('Download saves the PDF and does not open the viewer', async () => {
    const c = create();
    c.download(student);
    await Promise.resolve(); await Promise.resolve();
    expect(cards.previewPdf).toHaveBeenCalledWith(7, 'S1');
    expect(delivery.saveToDevice).toHaveBeenCalledWith(pdf, 'Ravi_Kumar_Preview.pdf');
    expect(dialog.open).not.toHaveBeenCalled();
  });
});

describe('ReportCardPreviewDialogComponent', () => {
  it('renders the pages inside the app and downloads only on request', async () => {
    const pdf = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    const delivery = jasmine.createSpyObj('ReportCardPdfDeliveryService', ['previewPages', 'saveToDevice'], { native: false });
    delivery.previewPages.and.resolveTo(['data:image/jpeg;base64,AAAA']);
    delivery.saveToDevice.and.resolveTo();
    const { MAT_DIALOG_DATA, MatDialogRef } = await import('@angular/material/dialog');
    TestBed.configureTestingModule({
      imports: [ReportCardPreviewDialogComponent],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: { studentName: 'Ravi', fileName: 'Ravi_Preview.pdf', pdf: of(pdf) } },
        { provide: MatDialogRef, useValue: { close: jasmine.createSpy('close') } },
        { provide: ReportCardPdfDeliveryService, useValue: delivery },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['success', 'error']) },
      ],
    });
    const fixture = TestBed.createComponent(ReportCardPreviewDialogComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.pv-pages img').length).toBe(1);
    expect(el.querySelector('[aria-label="Back to report card review"]')).not.toBeNull();
    expect(delivery.saveToDevice).not.toHaveBeenCalled();
    await fixture.componentInstance.download();
    expect(delivery.saveToDevice).toHaveBeenCalledWith(pdf, 'Ravi_Preview.pdf');
  });
});
