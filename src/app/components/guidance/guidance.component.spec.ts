import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { GuidanceComponent } from './guidance.component';
import { HelpService } from '../../help/help.service';
import { Guidance } from '../../guidance/guidance';

/** Shared by the web and Android clients — keep the two copies identical. */
describe('GuidanceComponent', () => {
  const prerequisite: Guidance = {
    kind: 'prerequisite', title: 'No subjects for Class 8 yet', message: 'Add them first.',
    actions: [{ label: 'Open Subject Configuration', path: 'subject-config' }],
    fallback: { default: 'Ask your school admin to set this up.', STUDENT: 'Please check again later.' },
  };

  function render(g: Guidance, help: Partial<HelpService> | null, audience = 'ADMIN', allowed: readonly unknown[] = []) {
    const service = help === null ? null : {
      audience: () => audience,
      allowedLinks: jasmine.createSpy('allowedLinks').and.returnValue(of(allowed)),
      go: jasmine.createSpy('go'),
      ...help,
    };
    TestBed.configureTestingModule({
      imports: [GuidanceComponent],
      providers: service ? [{ provide: HelpService, useValue: service }] : [],
    });
    const fixture = TestBed.createComponent(GuidanceComponent);
    fixture.componentRef.setInput('guidance', g);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, service };
  }

  it('shows the action when the viewer may open the page, instead of "ask someone"', () => {
    const { el, service } = render(prerequisite, {}, 'ADMIN', prerequisite.actions!);
    expect(el.querySelector('[data-guidance]')!.getAttribute('data-guidance')).toBe('prerequisite');
    expect(el.textContent).toContain('No subjects for Class 8 yet');
    const button = Array.from(el.querySelectorAll('button')).find(b => b.textContent!.includes('Open Subject Configuration'))!;
    expect(el.textContent).not.toContain('Ask your school admin');
    button.click();
    expect(service!.go).toHaveBeenCalledWith('subject-config', undefined);
  });

  it('without access: no action, and the audience\'s own fallback', () => {
    const teacher = render(prerequisite, {}, 'TEACHER', []);
    expect(teacher.el.querySelectorAll('button').length).toBe(0);
    expect(teacher.el.textContent).toContain('Ask your school admin to set this up.');
    TestBed.resetTestingModule();
    const student = render(prerequisite, {}, 'STUDENT', []);
    expect(student.el.textContent).toContain('Please check again later.');
  });

  it('a load error offers Retry, and is announced', () => {
    const { fixture, el } = render({ kind: 'load-error', title: "Couldn't load exams", message: 'Please try again.' }, {});
    let retried = 0;
    fixture.componentInstance.retry.subscribe(() => retried++);
    expect(el.querySelector('[role="alert"]')).not.toBeNull();
    (Array.from(el.querySelectorAll('button')).find(b => b.textContent!.includes('Retry')) as HTMLButtonElement).click();
    expect(retried).toBe(1);
  });

  it('no-match offers Clear filters', () => {
    const { fixture, el } = render({ kind: 'no-match', title: 'No leave applications match these filters' }, {});
    let cleared = 0;
    fixture.componentInstance.clearFilters.subscribe(() => cleared++);
    (Array.from(el.querySelectorAll('button')).find(b => b.textContent!.includes('Clear filters')) as HTMLButtonElement).click();
    expect(cleared).toBe(1);
  });

  it('renders on pages without the help machinery: no actions, default fallback', () => {
    const { el } = render(prerequisite, null);
    expect(el.textContent).toContain('No subjects for Class 8 yet');
    expect(el.textContent).toContain('Ask your school admin to set this up.');
    expect(el.querySelectorAll('button').length).toBe(0);
  });
});
