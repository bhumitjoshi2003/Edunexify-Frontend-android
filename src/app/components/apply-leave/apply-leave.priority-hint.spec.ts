import { TestBed } from '@angular/core/testing';
import { ApplyLeaveComponent } from './apply-leave.component';
import { baselineTestProviders } from '../../../testing/baseline-test-providers';

/** Shared by the web and Android clients — keep the two copies identical. Priority is automatic:
 * the date field explains it and offers no Regular/Urgent choice. */
describe('ApplyLeaveComponent — automatic priority', () => {
  it('explains automatic prioritisation under the date field and has no priority selector', () => {
    TestBed.configureTestingModule({ providers: [...baselineTestProviders()], imports: [ApplyLeaveComponent] });
    const fixture = TestBed.createComponent(ApplyLeaveComponent);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;

    const hint = root.querySelector('#al-date-hint');
    expect(hint?.textContent?.trim()).toBe('Requests for today or tomorrow are automatically prioritised for review.');
    expect(root.querySelector('input[type="date"]')?.getAttribute('aria-describedby')).toBe('al-date-hint');
    expect(root.textContent).not.toContain('Leave Priority');
    expect(root.textContent).not.toContain('Regular Leave');
    expect(root.textContent).not.toContain('Urgent Leave');
    expect(root.querySelector('[class*="al-priority"]')).toBeNull();
  });
});
