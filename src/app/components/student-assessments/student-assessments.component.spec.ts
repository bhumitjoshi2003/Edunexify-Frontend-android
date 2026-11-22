import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { StudentAssessmentsComponent } from './student-assessments.component';
import { AssessmentService } from '../../services/assessment.service';
import { LoggerService } from '../../services/logger.service';
import {
  Assessment,
  assessmentDateKey,
  assessmentTimeRange,
  countdownLabel,
  countdownTone,
  formatAssessmentTime,
} from '../../interfaces/assessment';

describe('StudentAssessmentsComponent', () => {
  let fixture: ComponentFixture<StudentAssessmentsComponent>;
  let component: StudentAssessmentsComponent;
  let service: jasmine.SpyObj<AssessmentService>;

  const inDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return assessmentDateKey(d); };

  const item = (overrides: Partial<Assessment> = {}): Assessment => ({
    id: 1, assessmentType: 'PRACTICAL', typeLabel: 'Practical', title: 'Titration practical', classId: 8, className: '8',
    sectionId: 3, sectionName: 'A', subjectName: 'Chemistry', assessmentDate: inDays(1), startTime: '09:30', endTime: null,
    syllabus: 'Acid-base titration', instructions: 'Bring your lab coat', attachment: null, createdByUserId: 'T1',
    createdByName: 'Ms Rao', createdByRole: 'TEACHER', createdAt: '2026-09-20T09:00:00', updatedAt: '2026-09-20T09:00:00',
    canEdit: false, canDelete: false, createdByCurrentUser: false, ...overrides,
  });

  beforeEach(() => {
    service = jasmine.createSpyObj('AssessmentService', ['studentUpcoming', 'studentMonth', 'studentPast']);
    service.studentUpcoming.and.returnValue(of([item(), item({ id: 2, title: 'Maths unit test', subjectName: 'Maths', assessmentDate: inDays(4) })]));
    service.studentMonth.and.returnValue(of([]));
    service.studentPast.and.returnValue(of([item({ id: 3, title: 'Old quiz', assessmentDate: inDays(-2) })]));
    TestBed.configureTestingModule({
      imports: [StudentAssessmentsComponent],
      providers: [
        { provide: AssessmentService, useValue: service },
        { provide: LoggerService, useValue: jasmine.createSpyObj('LoggerService', ['error']) },
      ],
    });
    fixture = TestBed.createComponent(StudentAssessmentsComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => fixture?.destroy());

  const tab = (label: string) => Array.from(fixture.nativeElement.querySelectorAll('.sas-tabs button') as NodeListOf<HTMLButtonElement>)
    .find(b => b.textContent!.includes(label))!;

  it('shows type, subject, title, date, time, portion, instructions and countdown, highlighting the next one', () => {
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const cards = el.querySelectorAll('.sas-card');
    expect(cards.length).toBe(2);
    expect(cards[0].classList).toContain('is-next');
    expect(cards[0].textContent).toContain('Next up');
    expect(cards[0].querySelector('.sas-type')!.textContent).toContain('Practical');
    expect(cards[0].querySelector('.sas-chip.is-subject')!.textContent).toContain('Chemistry');
    expect(cards[0].textContent).toContain('Titration practical');
    expect(cards[0].textContent).toContain('9:30 AM');
    expect(cards[0].textContent).toContain('Acid-base titration');
    expect(cards[0].textContent).toContain('Bring your lab coat');
    expect(cards[0].querySelector('.sas-countdown')!.textContent).toContain('Tomorrow');
    expect(cards[1].querySelector('.sas-countdown')!.textContent).toContain('In 4 days');
    expect(el.querySelector('.sas-date-day')).toBeTruthy();
  });

  it('loads This month and Past lazily, once each, and navigates months', () => {
    fixture.detectChanges();
    tab('This month').click();
    fixture.detectChanges();
    expect(service.studentMonth).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.textContent).toContain('No assessments in');
    const firstMonth = service.studentMonth.calls.mostRecent().args[0]!;
    expect(firstMonth).toMatch(/^\d{4}-\d{2}$/);
    (fixture.nativeElement.querySelector('button[aria-label="Next month"]') as HTMLButtonElement).click();
    expect(service.studentMonth.calls.mostRecent().args[0]).not.toBe(firstMonth);

    tab('Past').click();
    tab('Upcoming').click();
    tab('Past').click();
    fixture.detectChanges();
    expect(service.studentPast).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.textContent).toContain('Old quiz');
    expect(fixture.nativeElement.querySelector('.sas-countdown')!.textContent).toContain('2 days ago');
  });

  it('links the attachment', () => {
    service.studentUpcoming.and.returnValue(of([item({ attachment: { fileName: 'sheet.pdf', contentType: 'application/pdf',
      fileSize: 3 * 1024 * 1024, type: 'PDF', url: 'https://cdn/sheet.pdf', objectKey: null } })]));
    fixture.detectChanges();
    const file = fixture.nativeElement.querySelector('.sas-file');
    expect(file.getAttribute('href')).toBe('https://cdn/sheet.pdf');
    expect(file.textContent).toContain('3.0 MB');
  });

  it('shows empty and error states with retry', () => {
    service.studentUpcoming.and.returnValue(of([]));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No upcoming assessments.');
    service.studentUpcoming.and.returnValue(throwError(() => new Error('offline')));
    component.load('upcoming');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("Couldn't load");
  });

  it('countdown and time helpers', () => {
    const today = new Date(2026, 8, 25);
    expect(countdownLabel('2026-09-25', today)).toBe('Today');
    expect(countdownLabel('2026-09-26', today)).toBe('Tomorrow');
    expect(countdownLabel('2026-09-28', today)).toBe('In 3 days');
    expect(countdownLabel('2026-09-24', today)).toBe('Yesterday');
    expect(countdownLabel('2026-09-20', today)).toBe('5 days ago');
    expect(countdownTone('2026-10-10', today)).toBe('later');
    expect(countdownTone('2026-09-30', today)).toBe('soon');
    expect(formatAssessmentTime('00:05:00')).toBe('12:05 AM');
    expect(formatAssessmentTime('13:30')).toBe('1:30 PM');
    expect(assessmentTimeRange('09:00', '10:15:00')).toBe('9:00 AM – 10:15 AM');
    expect(assessmentTimeRange(null, null)).toBeNull();
  });
});
