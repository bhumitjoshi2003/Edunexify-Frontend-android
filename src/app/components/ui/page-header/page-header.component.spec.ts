import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PageHeaderComponent } from './page-header.component';

@Component({
  standalone: true,
  imports: [PageHeaderComponent],
  template: `
    <app-page-header title="Attendance" subtitle="Daily presence" icon="fact_check" [variant]="variant">
      <span phMeta class="meta">Admin</span>
      <button class="act">Export</button>
    </app-page-header>`,
})
class Host { variant: 'plain' | 'hero' = 'plain'; }

describe('PageHeaderComponent', () => {
  let fixture: ComponentFixture<Host>;
  const el = () => fixture.nativeElement as HTMLElement;

  beforeEach(() => {
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
  });

  it('renders the title as the page h1 with subtitle', () => {
    expect(el().querySelector('h1')?.textContent?.trim()).toBe('Attendance');
    expect(el().querySelector('.ph-sub')?.textContent).toContain('Daily presence');
  });

  it('projects meta and actions', () => {
    expect(el().querySelector('.ph-meta .meta')?.textContent).toBe('Admin');
    expect(el().querySelector('.ph-actions .act')).toBeTruthy();
  });

  it('is plain by default and hero when asked', () => {
    expect(el().querySelector('.ph-hero')).toBeNull();
    fixture.componentInstance.variant = 'hero';
    fixture.detectChanges();
    expect(el().querySelector('.ph-hero')).toBeTruthy();
  });

  it('hides the icon from assistive tech', () => {
    expect(el().querySelector('.ph-icon')?.getAttribute('aria-hidden')).toBe('true');
  });
});
