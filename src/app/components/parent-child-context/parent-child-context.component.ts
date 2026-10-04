import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { take } from 'rxjs';
import { AuthStateService } from '../../auth/auth-state.service';
import { ChildAccess } from '../../interfaces/parent-portal';
import { ParentChildContextService } from '../../services/parent-child-context.service';
import { ParentPortalService } from '../../services/parent-portal.service';

@Component({
  selector: 'app-parent-child-context', standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './parent-child-context.component.html',
  styleUrl: './parent-child-context.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ParentChildContextComponent implements OnChanges {
  @Input({ required: true }) studentId = '';
  /** Set false on pages whose content is identical for every linked child (e.g. Fee Structure —
   *  a class-wide grid, not per-student) — switching child there wouldn't change anything, so
   *  the tab row is suppressed and this always renders as the plain single-child badge. */
  @Input() showSwitcher = true;
  /** The ChildAccess permission flag this page's content actually requires (e.g.
   *  'canViewAttendance' on the attendance page). When set, a linked child who lacks it is
   *  never offered as a tab — the parent has no access to this feature for that child, so
   *  showing them here as a switchable option would only lead to a dead-end click. */
  @Input() requiredPermission?: keyof ChildAccess;
  /** Fires when the parent picks a different child from the tab row. The shared service is
   *  updated (select()) only when the pick is actually eligible (passes requiredPermission,
   *  if set) — an ineligible pick never touches the shared selection, so the sidebar/dashboard
   *  never flips to a child the click didn't actually succeed for. The host page still gets
   *  this event either way and is responsible for its own eligibility check + user feedback. */
  @Output() childSelected = new EventEmitter<ChildAccess>();

  children: ChildAccess[] = [];
  child: ChildAccess | null = null;
  invalid = false;
  readonly isParent: boolean;

  constructor(
    authState: AuthStateService,
    private parentPortal: ParentPortalService,
    private context: ParentChildContextService,
    private cdr: ChangeDetectorRef
  ) { this.isParent = authState.getUserRole() === 'PARENT'; }

  ngOnChanges(): void {
    if (!this.isParent || !this.studentId) return;
    this.parentPortal.getMyProfile().pipe(take(1)).subscribe({
      next: profile => {
        this.children = profile.children;
        this.child = profile.children.find(child => child.studentId === this.studentId) ?? null;
        this.invalid = !this.child;
        this.child ? this.context.select(this.child) : this.context.clear();
        this.cdr.markForCheck();
      },
      error: () => { this.children = []; this.child = null; this.context.clear(); this.invalid = true; this.cdr.markForCheck(); }
    });
  }

  /** Tabs offered to switch to — a linked child without requiredPermission is excluded
   *  entirely rather than shown as a tab that always errors when clicked. */
  get visibleChildren(): ChildAccess[] {
    if (!this.requiredPermission) return this.children;
    return this.children.filter(c => !!c[this.requiredPermission!]);
  }

  selectChild(child: ChildAccess): void {
    if (child.studentId === this.studentId) return;
    // Belt-and-suspenders alongside visibleChildren's filtering: even if this were somehow
    // invoked for an ineligible child, the shared (sidebar-driving) selection must never move
    // to a child the switch didn't actually succeed for. The host page's own onChildTabSelected
    // still receives the event and shows its own denial message.
    if (this.requiredPermission && !child[this.requiredPermission]) {
      this.childSelected.emit(child);
      return;
    }
    this.context.select(child);
    this.childSelected.emit(child);
  }

  trackByStudentId(_: number, child: ChildAccess): string { return child.studentId; }
}
