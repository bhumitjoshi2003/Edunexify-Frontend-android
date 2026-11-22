import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { of } from 'rxjs';
import { HelpPanelComponent } from './help-panel.component';
import { HelpService, ResolvedHelp } from '../../help/help.service';
import { HelpButtonComponent } from '../help-button/help-button.component';

/** Shared by the web and Android clients — keep the two copies identical. */
describe('Contextual help — button and panel', () => {
  const resolved = (over: Partial<ResolvedHelp> = {}): ResolvedHelp => ({
    id: 'timetable', title: 'Timetable', audience: 'ADMIN', unavailable: false, parentNote: false, principalNote: false,
    about: [{ text: 'Weekly periods.' }], prerequisites: [{ text: 'A current session.' }],
    workflows: [{ title: 'Add a period', steps: ['Choose the class.', 'Press + Add Period.'] }],
    problems: [{ problem: 'No subjects.', solution: 'Add them first.' }],
    links: [{ label: 'Subject Configuration', path: 'subject-config' }],
    support: [{ label: 'Report a problem', path: 'report-problem' }],
    ...over,
  });

  function renderPanel(help: ResolvedHelp) {
    const service = jasmine.createSpyObj<HelpService>('HelpService', ['resolve', 'go']);
    service.resolve.and.returnValue(of(help));
    const dialogRef = jasmine.createSpyObj('MatDialogRef', ['close']);
    TestBed.configureTestingModule({
      imports: [HelpPanelComponent],
      providers: [
        { provide: HelpService, useValue: service },
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: { topicId: help.id } },
      ],
    });
    const fixture = TestBed.createComponent(HelpPanelComponent);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, service, dialogRef };
  }

  it('shows the sections in order, with a labelled close button', () => {
    const { el } = renderPanel(resolved());
    const headings = Array.from(el.querySelectorAll('h3')).map(h => h.textContent!.trim());
    expect(headings).toEqual(['What this is', 'Before you start', 'How to', "If something isn't working", 'Related pages', 'Still need help?']);
    expect(el.querySelector('h2')!.textContent).toContain('Timetable');
    expect(el.querySelector('.hp-close')!.getAttribute('aria-label')).toBe('Close help');
    expect(el.querySelectorAll('.hp-card ol li').length).toBe(2);
  });

  it('a related page closes the panel, then opens the page', () => {
    const { el, service, dialogRef } = renderPanel(resolved());
    (el.querySelector('.hp-body .hp-link') as HTMLButtonElement).click();
    expect(dialogRef.close).toHaveBeenCalled();
    expect(service.go).toHaveBeenCalledWith('subject-config');
  });

  it('hides empty sections, and says when the feature is not in the school plan', () => {
    const { el } = renderPanel(resolved({ unavailable: true, prerequisites: [], workflows: [], problems: [], links: [] }));
    expect(el.textContent).toContain("is not part of your school's current plan");
    expect(el.textContent).not.toContain('How to');
    expect(el.textContent).not.toContain('Related pages');
  });

  it('tells the Principal that steps depend on granted permissions', () => {
    const { el } = renderPanel(resolved({ audience: 'PRINCIPAL', principalNote: true }));
    expect(el.textContent).toContain('need a permission your school gives the Principal');
  });

  it('tells parents to choose the child first', () => {
    const { el } = renderPanel(resolved({ audience: 'PARENT', parentNote: true, links: [] }));
    expect(el.textContent).toContain('Choose your child in the parent portal first');
  });

  it('the header button opens this page\'s help and names it for screen readers', () => {
    const service = jasmine.createSpyObj<HelpService>('HelpService', ['open']);
    TestBed.configureTestingModule({ imports: [HelpButtonComponent], providers: [{ provide: HelpService, useValue: service }] });
    const fixture = TestBed.createComponent(HelpButtonComponent);
    fixture.componentRef.setInput('topic', 'fees');
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(button.getAttribute('aria-label')).toBe('Help: Fees');
    expect(button.type).toBe('button');
    button.click();
    expect(service.open).toHaveBeenCalledWith('fees');
  });
});
