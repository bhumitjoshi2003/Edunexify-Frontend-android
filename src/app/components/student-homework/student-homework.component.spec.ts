import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { StudentHomeworkComponent } from './student-homework.component';
import { HomeworkService } from '../../services/homework.service';
import { LoggerService } from '../../services/logger.service';
import { HomeworkClasswork } from '../../interfaces/homework';

describe('StudentHomeworkComponent', () => {
  let fixture: ComponentFixture<StudentHomeworkComponent>;
  let component: StudentHomeworkComponent;
  let homework: jasmine.SpyObj<HomeworkService>;

  const item = (overrides: Partial<HomeworkClasswork> = {}): HomeworkClasswork => ({
    id: 1, workDate: '2026-09-23', classId: 8, className: '8', sectionId: 3, sectionName: 'A', subjectName: 'Science',
    teacherId: 'T1', teacherName: 'Ms Rao', timetableEntryId: 100, classwork: 'Read chapter 4', homework: 'Exercise 4.1',
    dueDate: null, attachments: [],
    createdAt: '2026-09-23T09:00:00', updatedAt: '2026-09-23T09:00:00', canEdit: false, ...overrides,
  });

  beforeEach(() => {
    homework = jasmine.createSpyObj('HomeworkService', ['studentOn', 'studentUpcoming', 'studentRecent']);
    homework.studentOn.and.returnValue(of([item()]));
    homework.studentUpcoming.and.returnValue(of([item({ id: 2, subjectName: 'Maths' })]));
    homework.studentRecent.and.returnValue(of([]));
    TestBed.configureTestingModule({
      imports: [StudentHomeworkComponent],
      providers: [
        { provide: HomeworkService, useValue: homework },
        { provide: LoggerService, useValue: jasmine.createSpyObj('LoggerService', ['error']) },
      ],
    });
    fixture = TestBed.createComponent(StudentHomeworkComponent);
    component = fixture.componentInstance;
  });

  it("opens on Today and shows subject, teacher, classwork, homework and posted time", () => {
    fixture.detectChanges();
    expect(homework.studentOn).toHaveBeenCalledTimes(1);
    expect(homework.studentUpcoming).not.toHaveBeenCalled();
    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('Science');
    expect(text).toContain('Ms Rao');
    expect(text).toContain('Read chapter 4');
    expect(text).toContain('Exercise 4.1');
    expect(text).toContain('Posted');
  });

  it('loads Due soon and Recent lazily, once each', () => {
    fixture.detectChanges();
    component.select('upcoming');
    component.select('today');
    component.select('upcoming');
    fixture.detectChanges();
    expect(homework.studentUpcoming).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.textContent).toContain('Maths');

    component.select('recent');
    fixture.detectChanges();
    expect(homework.studentRecent).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.textContent).toContain('No earlier homework');
  });

  it('shows every attachment: image thumbnails and PDF tiles, each linking to the file', () => {
    homework.studentOn.and.returnValue(of([item({ attachments: [
      { id: 1, fileName: 'diagram.png', contentType: 'image/png', fileSize: 2048, type: 'IMAGE', url: 'https://cdn/img.png', objectKey: null },
      { id: 2, fileName: 'worksheet.pdf', contentType: 'application/pdf', fileSize: 3 * 1024 * 1024, type: 'PDF', url: 'https://cdn/sheet.pdf', objectKey: null },
      { id: 3, fileName: 'page2.jpg', contentType: 'image/jpeg', fileSize: 4096, type: 'IMAGE', url: 'https://cdn/page2.jpg', objectKey: null },
    ] })]));
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const tiles = el.querySelectorAll('.shw-gallery .shw-file');
    expect(tiles.length).toBe(3);
    expect(tiles[0].querySelector('img')?.getAttribute('src')).toBe('https://cdn/img.png');
    expect(tiles[1].getAttribute('href')).toBe('https://cdn/sheet.pdf');
    expect(tiles[1].querySelector('.shw-pdf')).toBeTruthy();
    expect(el.textContent).toContain('worksheet.pdf');
    expect(el.textContent).toContain('3.0 MB');
  });

  it('shows class, date and teacher, with Classwork and Homework in separate blocks', () => {
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.shw-meta')?.textContent).toContain('Class 8 – A');
    expect(el.querySelector('.shw-block.is-classwork')?.textContent).toContain('Read chapter 4');
    expect(el.querySelector('.shw-block.is-homework')?.textContent).toContain('Exercise 4.1');
  });

  it('shows the due label for homework with a due date', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const pad = (n: number) => String(n).padStart(2, '0');
    homework.studentOn.and.returnValue(of([item({ dueDate: `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}` })]));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Due tomorrow');
  });

  it('shows empty and error states with retry', () => {
    homework.studentOn.and.returnValue(of([]));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Nothing posted for today yet.');

    homework.studentOn.and.returnValue(throwError(() => new Error('offline')));
    component.load('today');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("Couldn't load");
  });
});
