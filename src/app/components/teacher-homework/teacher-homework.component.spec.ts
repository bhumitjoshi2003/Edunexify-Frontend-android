import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of, throwError } from 'rxjs';
import { TeacherHomeworkComponent } from './teacher-homework.component';
import { HomeworkService } from '../../services/homework.service';
import { TimetableService } from '../../services/timetable.service';
import { TeacherSubstitutionService } from '../../services/teacher-substitution.service';
import { AuthStateService } from '../../auth/auth-state.service';
import { ToastService } from '../../services/toast.service';
import { LoggerService } from '../../services/logger.service';
import { HomeworkAttachment, HomeworkClasswork, localDateKey } from '../../interfaces/homework';
import { todayDayCode } from '../../utils/teacher-timetable-today.util';

describe('TeacherHomeworkComponent', () => {
  let fixture: ComponentFixture<TeacherHomeworkComponent>;
  let component: TeacherHomeworkComponent;
  let homework: jasmine.SpyObj<HomeworkService>;
  let toast: jasmine.SpyObj<ToastService>;
  let queryEntry: string | null;

  // A fixed Wednesday: the component reads the real clock for "today", so pin it to keep the
  // weekday filtering (period 101 is on SUNDAY) independent of the day the suite runs.
  const NOW = new Date(2026, 9, 7, 10, 0, 0);
  const today = localDateKey(NOW);
  const day = todayDayCode(NOW);

  const post = (overrides: Partial<HomeworkClasswork> = {}): HomeworkClasswork => ({
    id: 500, workDate: today, classId: 8, className: '8', sectionId: 3, sectionName: 'A', subjectName: 'Science',
    teacherId: 'T1', teacherName: 'Ms Rao', timetableEntryId: 100, classwork: 'Read ch 4', homework: null,
    dueDate: null, attachments: [],
    createdAt: `${today}T09:00:00`, updatedAt: `${today}T09:00:00`, canEdit: true, ...overrides,
  });

  const stored = (id: number, key: string, type: 'IMAGE' | 'PDF'): HomeworkAttachment => ({
    id, fileName: key.split('/').pop()!, contentType: type === 'PDF' ? 'application/pdf' : 'image/png', fileSize: 2048,
    type, url: `https://cdn/${key}`, objectKey: key,
  });

  function pick(...files: File[]): void {
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { value: files });
    component.onFilesSelected({ target: input } as unknown as Event);
  }

  function build(): void {
    homework = jasmine.createSpyObj('HomeworkService', ['myPostsOn', 'myRecent', 'create', 'update', 'delete', 'uploadAttachmentDirect']);
    homework.myPostsOn.and.returnValue(of([]));
    homework.myRecent.and.returnValue(of([]));
    toast = jasmine.createSpyObj('ToastService', ['success', 'error', 'warning', 'confirm']);
    const timetable = jasmine.createSpyObj('TimetableService', ['getTeacherTimetable']);
    timetable.getTeacherTimetable.and.returnValue(of([
      { id: 100, className: '8', sectionName: 'A', day, periodNumber: 2, startTime: '09:00', endTime: '09:40', subjectName: 'Science', teacherId: 'T1' },
      { id: 101, className: '9', sectionName: null, day: 'SUNDAY', periodNumber: 1, startTime: '08:00', endTime: '08:40', subjectName: 'Maths', teacherId: 'T1' },
    ]));
    const substitutions = jasmine.createSpyObj('TeacherSubstitutionService', ['getMine']);
    substitutions.getMine.and.returnValue(of([
      { id: 7, timetableEntryId: 300, className: '7', sectionName: 'B', subjectName: 'English', periodNumber: 4,
        startTime: '11:00', endTime: '11:40', status: 'ACTIVE' },
    ]));

    TestBed.configureTestingModule({
      imports: [TeacherHomeworkComponent],
      providers: [
        { provide: HomeworkService, useValue: homework },
        { provide: TimetableService, useValue: timetable },
        { provide: TeacherSubstitutionService, useValue: substitutions },
        { provide: AuthStateService, useValue: { getUser: () => ({ userId: 'T1', role: 'TEACHER' }) } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(queryEntry ? { entry: queryEntry } : {}) } } },
        { provide: ToastService, useValue: toast },
        { provide: LoggerService, useValue: jasmine.createSpyObj('LoggerService', ['error']) },
      ],
    });
    fixture = TestBed.createComponent(TeacherHomeworkComponent);
    component = fixture.componentInstance;
  }

  beforeEach(() => {
    queryEntry = null;
    jasmine.clock().install();
    jasmine.clock().mockDate(NOW);
  });

  afterEach(() => jasmine.clock().uninstall());

  it("lists today's own periods and covered periods, not other weekdays", () => {
    build();
    fixture.detectChanges();
    expect(component.periods.map(p => p.timetableEntryId)).toEqual([100, 300]);
    expect(component.periods[1].isSubstitution).toBeTrue();
    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('Class 8 – A');
    expect(text).toContain('Arrangement');
    expect(text).toContain('Add Homework / Classwork');
  });

  it('prefills the form from the timetable period passed by the dashboard (?entry=)', () => {
    queryEntry = '100';
    build();
    fixture.detectChanges();
    expect(component.form?.mode).toBe('create');
    expect(component.form?.period?.subjectName).toBe('Science');
    expect(component.form?.period?.className).toBe('8');
  });

  it('opens Edit instead of Add when the period already has a post today', () => {
    build();
    homework.myPostsOn.and.returnValue(of([post()]));
    fixture.detectChanges();
    component.openCreate(component.periods[0]);
    expect(component.form?.mode).toBe('edit');
    expect(component.form?.classwork).toBe('Read ch 4');
  });

  it('requires classwork or homework before posting', () => {
    build();
    fixture.detectChanges();
    component.openCreate(component.periods[0]);
    expect(component.canSave).toBeFalse();
    component.save();
    expect(toast.warning).toHaveBeenCalled();
    expect(homework.create).not.toHaveBeenCalled();
  });

  it('creates with the period id only (class/subject come from the server) and drops a due date without homework', () => {
    build();
    fixture.detectChanges();
    component.openCreate(component.periods[0]);
    component.form!.classwork = '  Read chapter 4  ';
    component.form!.dueDate = '2099-01-01';
    homework.create.and.returnValue(of(post()));

    component.save();

    expect(homework.create).toHaveBeenCalledWith({
      timetableEntryId: 100, classwork: 'Read chapter 4', homework: null, dueDate: null, attachments: [],
    });
    expect(toast.success).toHaveBeenCalled();
    expect(component.form).toBeNull();
    expect(component.todayPosts.length).toBe(1);
  });

  it('uploads several new files and posts them in the order shown', () => {
    build();
    fixture.detectChanges();
    component.openCreate(component.periods[1]);
    component.form!.homework = 'Essay';
    pick(new File(['%PDF'], 'sheet.pdf', { type: 'application/pdf' }), new File(['png'], 'diagram.png', { type: 'image/png' }));
    expect(component.form!.attachments.map(a => a.fileName)).toEqual(['sheet.pdf', 'diagram.png']);
    expect(component.form!.attachments[0].isPdf).toBeTrue();
    homework.uploadAttachmentDirect.and.callFake((file: File) => of({ objectKey: `k/${file.name}`, displayUrl: '' }));
    homework.create.and.returnValue(of(post({ id: 501, timetableEntryId: 300 })));

    component.save();

    expect(homework.uploadAttachmentDirect).toHaveBeenCalledTimes(2);
    expect(homework.create).toHaveBeenCalledWith(jasmine.objectContaining({
      timetableEntryId: 300,
      attachments: [{ objectKey: 'k/sheet.pdf', fileName: 'sheet.pdf' }, { objectKey: 'k/diagram.png', fileName: 'diagram.png' }],
    }));
  });

  it('shows the selected files before saving, with remove, and renders the file list', () => {
    build();
    fixture.detectChanges();
    component.openCreate(component.periods[0]);
    pick(new File(['%PDF'], 'sheet.pdf', { type: 'application/pdf' }), new File(['png'], 'diagram.png', { type: 'image/png' }));
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('.thw-pick-tile').length).toBe(2);
    expect(el.textContent).toContain('sheet.pdf');
    expect(el.textContent).toContain('2 / 5');

    component.removeAttachment(component.form!.attachments[0]);
    fixture.detectChanges();
    expect(component.form!.attachments.map(a => a.fileName)).toEqual(['diagram.png']);
    expect(el.querySelectorAll('.thw-pick-tile').length).toBe(1);
  });

  it('rejects unsupported and oversized files and stops at five attachments', () => {
    build();
    fixture.detectChanges();
    component.openCreate(component.periods[0]);
    pick(new File(['x'], 'a.docx', { type: 'application/msword' }), new File([new Uint8Array(11 * 1024 * 1024)], 'big.png', { type: 'image/png' }));
    expect(component.form!.attachments.length).toBe(0);
    expect(toast.error).toHaveBeenCalledTimes(2);

    const six = Array.from({ length: 6 }, (_, i) => new File(['p'], `p${i}.png`, { type: 'image/png' }));
    pick(...six);
    expect(component.form!.attachments.length).toBe(5);
    expect(toast.warning).toHaveBeenCalled();
  });

  it('edits keeping existing attachments without re-uploading, and can mix in and reorder new ones', () => {
    build();
    fixture.detectChanges();
    component.openEdit(post({ homework: 'Old', attachments: [stored(1, 'k/old.png', 'IMAGE'), stored(2, 'k/notes.pdf', 'PDF')] }));
    expect(component.form!.attachments.map(a => a.kind)).toEqual(['existing', 'existing']);
    component.removeAttachment(component.form!.attachments[1]);
    pick(new File(['png'], 'new.png', { type: 'image/png' }));
    component.form!.homework = 'New homework';
    homework.uploadAttachmentDirect.and.returnValue(of({ objectKey: 'k/new.png', displayUrl: '' }));
    homework.update.and.returnValue(of(post({ homework: 'New homework' })));

    component.save();

    expect(homework.uploadAttachmentDirect).toHaveBeenCalledTimes(1);
    expect(homework.update).toHaveBeenCalledWith(500, jasmine.objectContaining({
      homework: 'New homework',
      attachments: [{ objectKey: 'k/old.png', fileName: 'old.png' }, { objectKey: 'k/new.png', fileName: 'new.png' }],
    }));
  });

  it('a failed upload aborts the save and keeps the form open', () => {
    build();
    fixture.detectChanges();
    component.openCreate(component.periods[0]);
    component.form!.classwork = 'x';
    pick(new File(['png'], 'a.png', { type: 'image/png' }));
    homework.uploadAttachmentDirect.and.returnValue(throwError(() => new Error('network')));

    component.save();

    expect(homework.create).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Unable to upload attachments', jasmine.any(String));
    expect(component.form?.saving).toBeFalse();
  });

  it('shows Posted / Not posted status chips and the posted count', () => {
    build();
    homework.myPostsOn.and.returnValue(of([post({ attachments: [stored(1, 'k/a.png', 'IMAGE')] })]));
    fixture.detectChanges();
    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('1 of 2 posted');
    expect(text).toContain('Posted');
    expect(text).toContain('Not posted');
    expect(text).toContain('1 attachment');
  });

  it('shows recent posts with separate Classwork/Homework blocks and an attachment gallery', () => {
    build();
    homework.myRecent.and.returnValue(of([post({ homework: 'Exercise 4.1',
      attachments: [stored(1, 'k/a.png', 'IMAGE'), stored(2, 'k/b.pdf', 'PDF')] })]));
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.thw-block.is-classwork')?.textContent).toContain('Read ch 4');
    expect(el.querySelector('.thw-block.is-homework')?.textContent).toContain('Exercise 4.1');
    expect(el.querySelectorAll('.thw-gallery .thw-file-tile').length).toBe(2);
    expect(el.querySelector('.thw-gallery img')?.getAttribute('src')).toBe('https://cdn/k/a.png');
    expect(el.querySelector('.thw-gallery .thw-pdf')).toBeTruthy();
  });

  it('deletes after confirmation and removes the post from the lists', async () => {
    build();
    homework.myRecent.and.returnValue(of([post()]));
    fixture.detectChanges();
    toast.confirm.and.returnValue(Promise.resolve(true));
    homework.delete.and.returnValue(of(undefined));

    await component.remove(component.recent[0]);

    expect(homework.delete).toHaveBeenCalledWith(500);
    expect(component.recent.length).toBe(0);
  });

  it('shows the server message when posting fails and keeps the form open', () => {
    build();
    fixture.detectChanges();
    component.openCreate(component.periods[0]);
    component.form!.classwork = 'x';
    homework.create.and.returnValue(throwError(() => ({ status: 409, error: { message: 'Already posted for this period today.' } })));

    component.save();

    expect(toast.error).toHaveBeenCalledWith('Unable to post', 'Already posted for this period today.');
    expect(component.form?.saving).toBeFalse();
  });
});
