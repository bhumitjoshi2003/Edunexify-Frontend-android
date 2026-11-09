import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BehaviorSubject, Subject, throwError } from 'rxjs';
import { LoggerService } from '../../services/logger.service';
import { SchoolService, SchoolSetupHealth } from '../../services/school.service';
import { SchoolSetupComponent } from './school-setup.component';

describe('SchoolSetupComponent', () => {
  let fixture: ComponentFixture<SchoolSetupComponent>;
  let response$: BehaviorSubject<SchoolSetupHealth>;
  let schoolService: jasmine.SpyObj<SchoolService>;

  const health: SchoolSetupHealth = {
    completionPercentage: 60,
    completedRequired: 3,
    totalRequired: 5,
    status: 'IN_PROGRESS',
    items: [
      { key: 'SCHOOL_PROFILE', title: 'School profile', description: 'Complete', status: 'COMPLETED', importance: 'REQUIRED' },
      { key: 'TEACHERS', title: 'Teachers', description: 'Add teachers', status: 'INCOMPLETE', importance: 'REQUIRED' },
      { key: 'SCHOOL_LOGO', title: 'School logo', description: 'Upload logo', status: 'INCOMPLETE', importance: 'RECOMMENDED' },
      { key: 'FEE_CONFIGURATION', title: 'Fee configuration', description: 'Optional', status: 'INCOMPLETE', importance: 'OPTIONAL' },
      { key: 'PARENT_CONTACTS', title: 'Parent contacts', description: 'Later', status: 'NOT_APPLICABLE', importance: 'OPTIONAL' },
    ]
  };

  beforeEach(async () => {
    response$ = new BehaviorSubject(health);
    schoolService = jasmine.createSpyObj<SchoolService>('SchoolService', ['getSetupHealth']);
    schoolService.getSetupHealth.and.returnValue(response$);
    await TestBed.configureTestingModule({
      imports: [SchoolSetupComponent],
      providers: [
        provideRouter([]),
        { provide: SchoolService, useValue: schoolService },
        { provide: LoggerService, useValue: jasmine.createSpyObj('LoggerService', ['error']) },
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(SchoolSetupComponent);
  });

  it('shows loading until the backend responds', () => {
    const pending$ = new Subject<SchoolSetupHealth>();
    schoolService.getSetupHealth.and.returnValue(pending$);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Checking school readiness');
  });

  it('renders backend progress and all importance groups', () => {
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('60%');
    expect(text).toContain('3 of 5 required items complete');
    expect(text).toContain('Recommended');
    expect(text).toContain('Optional modules');
  });

  it('renders completed, incomplete and not-applicable items with the right CTA', () => {
    fixture.detectChanges();
    const links = Array.from(fixture.nativeElement.querySelectorAll('.setup-item a')) as HTMLAnchorElement[];
    expect(links.map(link => link.textContent?.trim())).toContain('Add teachersarrow_forward');
    expect(fixture.componentInstance.actionFor(health.items[0])).toBeNull();
    expect(fixture.componentInstance.actionFor(health.items[4])).toBeNull();
  });

  it('shows a recoverable backend error', () => {
    schoolService.getSetupHealth.and.returnValue(throwError(() => new Error('offline')));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Setup status could not be loaded');
    expect(fixture.nativeElement.textContent).toContain('Retry');
  });

  it('reloads the backend state when refreshed', () => {
    fixture.detectChanges();
    fixture.componentInstance.load();
    expect(schoolService.getSetupHealth).toHaveBeenCalledTimes(2);
  });

  it('the "Add teachers" CTA deep-links to the teacher registration form, not the default student one', () => {
    fixture.detectChanges();
    const link = Array.from(fixture.nativeElement.querySelectorAll('.setup-item a') as NodeListOf<HTMLAnchorElement>)
      .find(a => a.textContent?.includes('Add teachers'));
    expect(link?.getAttribute('href')).toContain('type=teacher');
  });

  it('disables the manual refresh button while a request is already in flight', () => {
    // First load completes normally so the button exists at all (it's inside *ngIf="health").
    fixture.detectChanges();
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('.setup-refresh');
    expect(button.disabled).toBeFalse();

    // Clicking Refresh starts a second, still-pending request.
    const pending$ = new Subject<SchoolSetupHealth>();
    schoolService.getSetupHealth.and.returnValue(pending$);
    button.click();
    fixture.detectChanges();
    expect(button.disabled).toBeTrue();

    pending$.next(health);
    pending$.complete();
    fixture.detectChanges();
    expect(button.disabled).toBeFalse();
  });

  // ─── Shared by the web and Android clients — keep the two copies identical. ───
  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  it('setup not started: shows the server status and 0%', () => {
    response$.next({ completionPercentage: 0, completedRequired: 0, totalRequired: 5, status: 'NOT_STARTED',
      items: [{ key: 'TEACHERS', title: 'Teachers', description: 'Add teachers', status: 'INCOMPLETE', importance: 'REQUIRED' }] });
    fixture.detectChanges();
    expect(text()).toContain('0%');
    expect(text()).toContain('0 of 5 required items complete');
    expect(text()).toContain('Add teachers');
  });

  it('all required steps complete: READY wording, no required CTA, recommended steps still offered', () => {
    response$.next({ completionPercentage: 100, completedRequired: 2, totalRequired: 2, status: 'READY', items: [
      { key: 'SCHOOL_PROFILE', title: 'School profile', description: 'Done', status: 'COMPLETED', importance: 'REQUIRED' },
      { key: 'TEACHERS', title: 'Teachers', description: 'Done', status: 'COMPLETED', importance: 'REQUIRED' },
      { key: 'SCHOOL_LOGO', title: 'School logo', description: 'Upload logo', status: 'INCOMPLETE', importance: 'RECOMMENDED' },
    ] });
    fixture.detectChanges();
    const component = fixture.componentInstance;
    expect(text()).toContain('Your essential school setup is ready.');
    expect(component.items('REQUIRED').every(item => component.actionFor(item) === null)).toBeTrue();
    expect(component.actionFor(component.items('RECOMMENDED')[0])?.label).toBe('Upload logo');
  });

  it('progress comes from the server as-is (no client-side score)', () => {
    response$.next({ ...health, completionPercentage: 37 });
    fixture.detectChanges();
    expect(text()).toContain('37%');
  });

  it('a failed request can be retried and then shows the checklist', () => {
    schoolService.getSetupHealth.and.returnValue(throwError(() => new Error('offline')));
    fixture.detectChanges();
    expect(text()).toContain('Setup status could not be loaded');
    schoolService.getSetupHealth.and.returnValue(response$);
    (Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find(b => b.textContent?.includes('Retry')) as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.componentInstance.error).toBeFalse();
    expect(text()).toContain('60%');
  });
});
