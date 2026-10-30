import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NgIf } from '@angular/common';
import { NavGroupComponent, NavItemDirective } from './nav-group.component';

@Component({
  standalone: true,
  imports: [NgIf, NavGroupComponent, NavItemDirective],
  template: `
    <nav>
      <app-nav-group>
        <div class="nav-section-label">Fees</div>
        <a class="nav-item" *ngIf="fees">My Fees</a>
        <a class="nav-item" *ngIf="payments">Payment History</a>
      </app-nav-group>
      <app-nav-group>
        <div class="nav-section-label">Main</div>
        <a class="nav-item">Dashboard</a>
      </app-nav-group>
      <app-nav-group>
        <div class="nav-section-label">Nested</div>
        <ng-container *ngIf="nested"><a class="nav-item">Deep</a></ng-container>
      </app-nav-group>
    </nav>`,
})
class Host { fees = false; payments = false; nested = false; }

describe('NavGroupComponent', () => {
  let fixture: ComponentFixture<Host>;
  const labels = () => Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.nav-section-label')).map(e => e.textContent!.trim());
  const refresh = () => { fixture.detectChanges(); };

  beforeEach(() => {
    fixture = TestBed.createComponent(Host);
    refresh();
  });

  it('drops the heading of a group whose items were all filtered out', () => {
    expect(labels()).not.toContain('Fees');
    expect(labels()).toContain('Main');
  });

  it('shows the heading as soon as one item is visible, and removes it again', () => {
    fixture.componentInstance.payments = true; refresh();
    expect(labels()).toContain('Fees');
    fixture.componentInstance.payments = false; refresh();
    expect(labels()).not.toContain('Fees');
  });

  it('counts items nested inside a wrapper', () => {
    expect(labels()).not.toContain('Nested');
    fixture.componentInstance.nested = true; refresh();
    expect(labels()).toContain('Nested');
  });

  it('leaves an empty group with no layout box of its own', () => {
    const group = (fixture.nativeElement as HTMLElement).querySelector('app-nav-group') as HTMLElement;
    expect(getComputedStyle(group).display).toBe('contents');
    expect(group.textContent!.trim()).toBe('');
  });
});
