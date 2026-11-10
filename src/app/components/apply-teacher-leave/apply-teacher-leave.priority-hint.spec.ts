import { TestBed } from '@angular/core/testing';
import { ApplyTeacherLeaveComponent } from './apply-teacher-leave.component';
import { baselineTestProviders } from '../../../testing/baseline-test-providers';

/** Shared by the web and Android clients — keep the two copies identical. */
describe('ApplyTeacherLeaveComponent — automatic priority', () => {
  it('explains automatic prioritisation under the dates and has no priority selector', () => {
    TestBed.configureTestingModule({ providers: [...baselineTestProviders()], imports: [ApplyTeacherLeaveComponent] });
    const fixture = TestBed.createComponent(ApplyTeacherLeaveComponent);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;

    expect(root.textContent).toContain('Requests for today or tomorrow are automatically prioritised for review.');
    expect(root.textContent).not.toContain('Leave Priority');
    expect(root.textContent).not.toContain('Regular Leave');
    expect(root.querySelector('[class*="al-priority"]')).toBeNull();
  });
});
