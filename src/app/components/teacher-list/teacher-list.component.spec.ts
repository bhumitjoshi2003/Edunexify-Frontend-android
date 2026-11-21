import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { TeacherListComponent } from './teacher-list.component';
import { TeacherService } from '../../services/teacher.service';
import { AuthStateService } from '../../auth/auth-state.service';
import { LoggerService } from '../../services/logger.service';

/** Shared by the web and Android clients — keep the two copies identical. */
describe('TeacherListComponent — load states', () => {
  let teacherService: any;

  function render() {
    TestBed.configureTestingModule({
      imports: [TeacherListComponent],
      providers: [
        { provide: TeacherService, useValue: teacherService },
        { provide: Router, useValue: jasmine.createSpyObj('Router', ['navigate']) },
        { provide: AuthStateService, useValue: { getUser: () => ({ role: 'ADMIN', userId: 'a1' }), hasFeature: () => false } },
        { provide: LoggerService, useValue: jasmine.createSpyObj('LoggerService', ['error']) },
      ],
    });
    const fixture = TestBed.createComponent(TeacherListComponent);
    fixture.detectChanges();
    return fixture;
  }
  const el = (fixture: any, id: string) => (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${id}"]`);

  it('a failed load shows an error with Retry — never "No teachers found" — and Retry recovers', () => {
    teacherService = { getAllTeachers: jasmine.createSpy().and.returnValue(throwError(() => new Error('offline'))) };
    const fixture = render();
    expect(fixture.componentInstance.display).toBe('error');
    expect(el(fixture, 'list-error')).not.toBeNull();
    expect(el(fixture, 'list-empty')).toBeNull();

    teacherService.getAllTeachers.and.returnValue(of([{ teacherId: 'T1', name: 'Asha' }]));
    (el(fixture, 'list-error')!.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.componentInstance.display).toBe('list');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Asha');
  });

  it('an empty school shows the empty state', () => {
    teacherService = { getAllTeachers: () => of([]) };
    const fixture = render();
    expect(fixture.componentInstance.display).toBe('empty');
    expect(el(fixture, 'list-empty')).not.toBeNull();
  });
});
