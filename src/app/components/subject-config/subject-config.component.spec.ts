import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { SubjectConfigComponent } from './subject-config.component';
import { SubjectConfigService } from '../../services/subject-config.service';
import { SchoolService } from '../../services/school.service';
import { LoggerService } from '../../services/logger.service';
import { ToastService } from '../../services/toast.service';
import { AuthStateService } from '../../auth/auth-state.service';

/** Shared by the web and Android clients — keep the two copies identical. Class subjects are only
 *  ever read or created for one of the school's configured classes, never a hardcoded one. */
describe('SubjectConfigComponent — class subjects', () => {
  let examsResults = true;
  afterEach(() => examsResults = true);
  let service: jasmine.SpyObj<SubjectConfigService>;
  let toast: jasmine.SpyObj<ToastService>;

  function create(classes: string[]) {
    service = jasmine.createSpyObj('SubjectConfigService', ['getClassSubjects', 'addClassSubject', 'getStreams', 'addStream', 'getOptionalGroups']);
    service.getClassSubjects.and.callFake((c: string) => of(c === 'Class 9' ? [{ id: 1, className: 'Class 9', subjectName: 'English', optional: false } as any] : []));
    service.addClassSubject.and.callFake((c: string, s: string) => of({ id: 2, className: c, subjectName: s, optional: false } as any));
    service.getStreams.and.returnValue(of([]));
    service.addStream.and.callFake((n: string) => of({ id: 5, streamName: n, coreSubjects: [] } as any));
    service.getOptionalGroups.and.returnValue(of([]));
    toast = jasmine.createSpyObj('ToastService', ['error', 'success', 'warning', 'confirm']);
    TestBed.configureTestingModule({
      imports: [SubjectConfigComponent],
      providers: [
        { provide: AuthStateService, useValue: { hasFeature: (key: string) => examsResults || key !== 'EXAMS_RESULTS' } },
        { provide: SubjectConfigService, useValue: service },
        { provide: SchoolService, useValue: { getClasses: () => of(classes) } },
        { provide: LoggerService, useValue: { error: () => {} } },
        { provide: ToastService, useValue: toast },
      ],
    });
    const fixture = TestBed.createComponent(SubjectConfigComponent);
    fixture.detectChanges();
    return { fixture, c: fixture.componentInstance };
  }

  const addButton = (fixture: any): HTMLButtonElement =>
    [...fixture.nativeElement.querySelectorAll('button.btn-add')].find((b: HTMLButtonElement) => b.textContent?.trim() === '+ Add');

  it('class subjects work without Exams & Results; streams and optional groups are hidden and never fetched', () => {
    examsResults = false;
    const { fixture, c } = create(['Class 9']);
    expect(c.classSubjects.map((s) => s.subjectName)).toEqual(['English']);
    const tabs = [...fixture.nativeElement.querySelectorAll('.sc-tab')].map((b: HTMLElement) => b.textContent?.trim());
    expect(tabs).toEqual(['Class Subjects']);
    expect(service.getStreams).not.toHaveBeenCalled();
    expect(service.getOptionalGroups).not.toHaveBeenCalled();
  });

  it('starts on the first configured class and only fetches subjects for it — never a hardcoded "1"', () => {
    const { c } = create(['Class 9', 'Class 10', 'Class 11']);
    expect(c.selectedClass).toBe('Class 9');
    expect(service.getClassSubjects.calls.allArgs()).toEqual([['Class 9']]);
    expect(c.classSubjects.map((s) => s.subjectName)).toEqual(['English']);
  });

  it('with no configured classes: no subject fetch, Add disabled, and nothing is created', () => {
    const { fixture, c } = create([]);
    expect(c.selectedClass).toBe('');
    expect(service.getClassSubjects).not.toHaveBeenCalled();
    expect(addButton(fixture).disabled).toBeTrue();
    c.newSubjectName = 'English';
    c.addClassSubject();
    expect(service.addClassSubject).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Add classes in Class Management');
  });

  it('a value outside the configured classes is never fetched or submitted', () => {
    const { c } = create(['Class 9']);
    service.getClassSubjects.calls.reset();
    c.selectedClass = '1';
    c.onClassChange();
    expect(service.getClassSubjects).not.toHaveBeenCalled();
    c.newSubjectName = 'Probe';
    c.addClassSubject();
    expect(service.addClassSubject).not.toHaveBeenCalled();
  });

  it('switching class loads that class, and a new subject is created for the selected configured class', () => {
    const { fixture, c } = create(['Class 9', 'Class 10']);
    c.selectedClass = 'Class 10';
    c.onClassChange();
    expect(service.getClassSubjects).toHaveBeenCalledWith('Class 10');
    fixture.detectChanges();
    expect(addButton(fixture).disabled).toBeFalse();
    c.newSubjectName = ' Physics ';
    c.addClassSubject();
    expect(service.addClassSubject).toHaveBeenCalledOnceWith('Class 10', 'Physics', false, undefined);
  });

  it('keeps duplicate validation and stream creation unchanged', () => {
    const { c } = create(['Class 9']);
    c.newSubjectName = 'english';
    c.addClassSubject();
    expect(toast.error).toHaveBeenCalledWith('Duplicate Subject', 'This subject already exists for the selected class.');
    expect(service.addClassSubject).not.toHaveBeenCalled();
    c.newStreamName = 'Science';
    c.addStream();
    expect(service.addStream).toHaveBeenCalledOnceWith('Science');
  });
});
