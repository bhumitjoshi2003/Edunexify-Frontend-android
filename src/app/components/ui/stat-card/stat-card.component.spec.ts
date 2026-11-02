import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StatCardComponent } from './stat-card.component';

@Component({
  standalone: true,
  imports: [StatCardComponent],
  template: `
    <app-stat-card label="Present" icon="check_circle" tone="success">42<span scFoot class="foot">incl. 2 on leave</span></app-stat-card>
    <app-stat-card label="Plain">7</app-stat-card>`,
})
class Host {}

describe('StatCardComponent', () => {
  let fixture: ComponentFixture<Host>;
  const cards = () => Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.sc'));

  beforeEach(() => {
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
  });

  it('shows label and the projected value', () => {
    const [first] = cards();
    expect(first.querySelector('.sc-label')?.textContent).toBe('Present');
    expect(first.querySelector('.sc-value')?.textContent).toContain('42');
  });

  it('applies the tone and projects the footer', () => {
    const [first] = cards();
    expect(first.getAttribute('data-tone')).toBe('success');
    expect(first.querySelector('.sc-foot .foot')?.textContent).toContain('incl. 2 on leave');
  });

  it('defaults to the brand tone and omits the icon when none is given', () => {
    const second = cards()[1];
    expect(second.getAttribute('data-tone')).toBe('brand');
    expect(second.querySelector('.sc-icon')).toBeNull();
  });
});
