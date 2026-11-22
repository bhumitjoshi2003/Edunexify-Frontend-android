import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { AssessmentManageComponent } from './assessment-manage.component';
import { AssessmentService } from '../../services/assessment.service';
import { AuthStateService } from '../../auth/auth-state.service';
import { ToastService } from '../../services/toast.service';
import { LoggerService } from '../../services/logger.service';
import { Assessment, AssessmentContextClass, assessmentDateKey } from '../../interfaces/assessment';

describe('AssessmentManageComponent', () => {
  let fixture: ComponentFixture<AssessmentManageComponent>;
  let component: AssessmentManageComponent;
  let service: jasmine.SpyObj<AssessmentService>;
  let toast: jasmine.SpyObj<ToastService>;

  const inDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return assessmentDateKey(d); };

  const contexts: AssessmentContextClass[] = [
    { classId: 8, className: '8', sections: [
      { sectionId: 3, sectionName: 'A', subjects: ['Maths', 'Science'] },
      { sectionId: 4, sectionName: 'B', subjects: ['Science'] },
    ] },
    { classId: 10, className: '10', sections: [{ sectionId: null, sectionName: null, subjects: ['Physics'] }] },
  ];

  const item = (overrides: Partial<Assessment> = {}): Assessment => ({
    id: 500, assessmentType: 'UNIT_TEST', typeLabel: 'Unit Test', title: 'Unit Test 2', classId: 8, className: '8',
    sectionId: 3, sectionName: 'A', subjectName: 'Science', assessmentDate: inDays(3), startTime: '10:00:00', endTime: '11:00:00',
    syllabus: 'Chapters 3–4', instructions: 'Bring a calculator', attachment: null, createdByUserId: 'T1', createdByName: 'Ms Rao',
    createdByRole: 'TEACHER', createdAt: '2026-09-20T09:00:00', updatedAt: '2026-09-20T09:00:00', canEdit: true,
    canDelete: true, createdByCurrentUser: true, ...overrides,
  });

  function build(role = 'TEACHER', upcoming: Assessment[] = [], ctx = contexts): void {
    service = jasmine.createSpyObj('AssessmentService', ['contexts', 'manage', 'create', 'update', 'delete', 'uploadAttachmentDirect']);
    service.contexts.and.returnValue(of(ctx));
    service.manage.and.callFake(scope => of(scope === 'upcoming' ? upcoming : [item({ id: 9, assessmentDate: inDays(-5), title: 'Old test' })]));
    service.create.and.returnValue(of(item({ id: 501 })));
    service.update.and.returnValue(of(item()));
    service.delete.and.returnValue(of(void 0));
    toast = jasmine.createSpyObj('ToastService', ['success', 'error', 'warning', 'confirm']);
    TestBed.configureTestingModule({
      imports: [AssessmentManageComponent],
      providers: [
        { provide: AssessmentService, useValue: service },
        { provide: AuthStateService, useValue: { getUser: () => ({ userId: 'T1', role }) } },
        { provide: ToastService, useValue: toast },
        { provide: LoggerService, useValue: jasmine.createSpyObj('LoggerService', ['error']) },
      ],
    });
    fixture = TestBed.createComponent(AssessmentManageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  afterEach(() => fixture?.destroy());

  function fillValid(): void {
    component.openCreate();
    component.selectClass(contexts[0]);
    component.selectSection(contexts[0].sections[0]);
    component.form!.subject = 'Science';
    component.form!.title = ' Unit Test 2 ';
    component.form!.date = inDays(7);
    component.form!.start = '10:00';
    component.form!.end = '11:00';
    component.form!.syllabus = ' Chapters 3–4 ';
  }

  it('lists upcoming assessments with date tile, type, subject, time, portion and countdown', () => {
    build('TEACHER', [item()]);
    const el: HTMLElement = fixture.nativeElement;
    expect(service.manage).toHaveBeenCalledOnceWith('upcoming');
    expect(el.querySelector('.asm-type')!.textContent).toContain('Unit Test');
    expect(el.querySelector('.asm-chip.is-subject')!.textContent).toContain('Science');
    expect(el.textContent).toContain('10:00 AM – 11:00 AM');
    expect(el.textContent).toContain('Chapters 3–4');
    expect(el.querySelector('.asm-countdown')!.textContent).toContain('In 3 days');
    expect(el.querySelector('.asm-date-day')).toBeTruthy();
    expect(el.querySelectorAll('button[aria-label="Edit assessment"]').length).toBe(1);
  });

  it('hides edit/delete when the caller cannot edit and loads Past lazily', () => {
    build('TEACHER', [item({ canEdit: false, canDelete: false, createdByCurrentUser: false })]);
    expect(fixture.nativeElement.querySelector('button[aria-label="Edit assessment"]')).toBeNull();
    const past = Array.from(fixture.nativeElement.querySelectorAll('.asm-segments button') as NodeListOf<HTMLButtonElement>)
      .find(b => b.textContent!.includes('Past'))!;
    past.click();
    fixture.detectChanges();
    expect(service.manage).toHaveBeenCalledWith('past');
    expect(fixture.nativeElement.textContent).toContain('Old test');
  });

  it('schedules with class, section and subject chosen from the contexts', () => {
    build();
    fillValid();
    expect(component.canSave).toBeTrue();
    component.save();
    expect(service.create).toHaveBeenCalledOnceWith({
      assessmentType: 'CLASS_TEST', title: 'Unit Test 2', assessmentDate: inDays(7), startTime: '10:00', endTime: '11:00',
      syllabus: 'Chapters 3–4', instructions: null, attachment: null, classId: 8, sectionId: 3, subjectName: 'Science',
    });
    expect(toast.success).toHaveBeenCalledWith('Scheduled', 'Students in this class have been notified.');
    expect(component.form).toBeNull();
  });

  it('auto-picks a single section and a single subject', () => {
    build();
    component.openCreate();
    component.selectClass(contexts[1]);
    expect(component.form!.sectionKey).toBe('whole');
    expect(component.form!.subject).toBe('Physics');
  });

  it('requires class, section, subject, title, date and syllabus', () => {
    build();
    component.openCreate();
    expect(component.canSave).toBeFalse();
    fillValid();
    component.form!.syllabus = '  ';
    expect(component.canSave).toBeFalse();
  });

  it('rejects an end time before the start and a past date', () => {
    build();
    fillValid();
    component.form!.end = '09:00';
    component.save();
    fillValid();
    component.form!.start = '';
    component.save();
    fillValid();
    component.form!.date = inDays(-1);
    component.save();
    expect(service.create).not.toHaveBeenCalled();
    expect(toast.warning).toHaveBeenCalledTimes(3);
  });

  it('edits keeping class/subject fixed and the existing attachment', () => {
    const existing = item({ attachment: { fileName: 'paper.pdf', contentType: 'application/pdf', fileSize: 2048, type: 'PDF', url: 'https://cdn/p.pdf', objectKey: 'k/p.pdf' } });
    build('TEACHER', [existing]);
    component.openEdit(existing);
    expect(component.form!.start).toBe('10:00');
    component.form!.title = 'Renamed';
    component.save();
    expect(service.update).toHaveBeenCalledOnceWith(500, jasmine.objectContaining({
      title: 'Renamed', startTime: '10:00', attachment: { objectKey: 'k/p.pdf', fileName: 'paper.pdf' },
    }));
    expect(service.update.calls.mostRecent().args[1]).not.toEqual(jasmine.objectContaining({ classId: jasmine.anything() }));
  });

  it('uploads a picked file before scheduling', () => {
    build();
    service.uploadAttachmentDirect.and.returnValue(of({ objectKey: 'schools/1/assessments/new/attachments/x.pdf' } as any));
    fillValid();
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { value: [new File(['x'], 'paper.pdf', { type: 'application/pdf' })] });
    component.onFileSelected({ target: input } as unknown as Event);
    component.save();
    expect(service.create.calls.mostRecent().args[0].attachment)
      .toEqual({ objectKey: 'schools/1/assessments/new/attachments/x.pdf', fileName: 'paper.pdf' });
  });

  it('deletes only after confirmation', async () => {
    build('TEACHER', [item()]);
    toast.confirm.and.returnValue(Promise.resolve(false));
    await component.remove(component.state.upcoming.items[0]);
    expect(service.delete).not.toHaveBeenCalled();
    toast.confirm.and.returnValue(Promise.resolve(true));
    await component.remove(component.state.upcoming.items[0]);
    expect(service.delete).toHaveBeenCalledOnceWith(500);
    expect(component.state.upcoming.items.length).toBe(0);
  });

  it('shows the creator to admins and admin wording', () => {
    build('ADMIN', [item({ createdByCurrentUser: false })]);
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('School assessments');
    expect(el.querySelector('.asm-by')!.textContent).toContain('Ms Rao');
  });

  it('shows the source of each card and follows the server permissions for actions', () => {
    build('TEACHER', [
      item({ id: 1, title: 'Mine' }),
      item({ id: 2, title: 'Admin set', createdByRole: 'ADMIN', createdByName: 'Principal', createdByUserId: 'A1',
        canEdit: false, canDelete: false, createdByCurrentUser: false }),
      item({ id: 3, title: 'Colleague set', createdByName: 'Mr Sharma', createdByUserId: 'T2',
        canEdit: false, canDelete: false, createdByCurrentUser: false }),
    ]);
    const cards = fixture.nativeElement.querySelectorAll('.asm-card') as NodeListOf<HTMLElement>;
    expect(cards.length).toBe(3);

    expect(cards[0].querySelector('.asm-by')!.textContent).toContain('Created by you');
    expect(cards[0].querySelector('button[aria-label="Edit assessment"]')).toBeTruthy();
    expect(cards[0].querySelector('button[aria-label="Delete assessment"]')).toBeTruthy();
    expect(cards[0].querySelector('.asm-view-only')).toBeNull();

    expect(cards[1].querySelector('.asm-by')!.textContent).toContain('Created by Admin');
    expect(cards[1].querySelector('button[aria-label="Edit assessment"]')).toBeNull();
    expect(cards[1].querySelector('button[aria-label="Delete assessment"]')).toBeNull();
    expect(cards[1].querySelector('.asm-view-only')!.textContent).toContain('View only');
    expect(cards[1].textContent).toContain('Chapters 3–4');

    expect(cards[2].querySelector('.asm-by')!.textContent).toContain('Created by Mr Sharma');
    expect(cards[2].querySelector('button[aria-label="Edit assessment"]')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Assessments for my classes');
  });

  it('shows only the actions the server allows', () => {
    build('TEACHER', [item({ canEdit: true, canDelete: false })]);
    expect(fixture.nativeElement.querySelector('button[aria-label="Edit assessment"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('button[aria-label="Delete assessment"]')).toBeNull();
  });

  it('explains when there is nothing to schedule for and hides the button', () => {
    build('TEACHER', [], []);
    expect(fixture.nativeElement.textContent).toContain('No classes found in your timetable');
    expect(fixture.nativeElement.querySelector('.asm-new')).toBeNull();
  });

  it('shows an error state with retry', () => {
    service = jasmine.createSpyObj('AssessmentService', ['contexts', 'manage']);
    service.contexts.and.returnValue(of(contexts));
    service.manage.and.returnValue(throwError(() => new Error('offline')));
    TestBed.configureTestingModule({
      imports: [AssessmentManageComponent],
      providers: [
        { provide: AssessmentService, useValue: service },
        { provide: AuthStateService, useValue: { getUser: () => ({ userId: 'T1', role: 'TEACHER' }) } },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['error']) },
        { provide: LoggerService, useValue: jasmine.createSpyObj('LoggerService', ['error']) },
      ],
    });
    fixture = TestBed.createComponent(AssessmentManageComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("Couldn't load");
  });
});
