import { ChangeDetectionStrategy, Component, Directive, computed, contentChildren } from '@angular/core';
import { NgIf } from '@angular/common';

/** Marks a sidebar entry. Matches every `.nav-item`, so existing links need no extra attribute. */
@Directive({ selector: '.nav-item', standalone: true })
export class NavItemDirective {}

/**
 * Sidebar group: renders its `.nav-section-label` heading only while it contains at least one
 * visible `.nav-item`. Role / feature / entitlement filters stay as `*ngIf`s on the items; when
 * they remove every item the heading goes too, so a group can never be left empty. The host is
 * `display: contents`, so an empty group also leaves no spacing behind.
 *
 *   <app-nav-group>
 *     <div class="nav-section-label">Fees</div>
 *     <a class="nav-item" *ngIf="hasFeature('FEE_MANAGEMENT')" …>
 */
@Component({
  selector: 'app-nav-group',
  standalone: true,
  imports: [NgIf],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host { display: contents; }'],
  template: `
    <ng-container *ngIf="hasItems()"><ng-content select=".nav-section-label"></ng-content></ng-container>
    <ng-content></ng-content>
  `,
})
export class NavGroupComponent {
  private readonly items = contentChildren(NavItemDirective, { descendants: true });
  readonly hasItems = computed(() => this.items().length > 0);
}
