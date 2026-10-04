import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { AuthStateService } from '../auth/auth-state.service';
import { ChildAccess, ParentProfile } from '../interfaces/parent-portal';

const STORAGE_KEY = 'edunexify.parent.selected-child';

@Injectable({ providedIn: 'root' })
export class ParentChildContextService {
  private readonly selectedSubject = new BehaviorSubject<ChildAccess | null>(null);
  readonly selectedChild$ = this.selectedSubject.asObservable();

  constructor(private authState: AuthStateService) {}

  /**
   * Picks the selected child. An explicitly requested child (a deep link) is used only if this
   * parent can still access it — otherwise nothing is selected (null), never silently another
   * child: the page shows "You no longer have access to this student." and lets the parent choose.
   * Without a request, the last selected child (same parent) or the first one is used.
   */
  reconcile(profile: ParentProfile, requestedStudentId?: string | null): ChildAccess | null {
    const validChildren = profile.children;
    if (requestedStudentId) {
      const requested = validChildren.find(child => child.studentId === requestedStudentId) ?? null;
      requested ? this.select(requested) : this.selectedSubject.next(null);
      return requested;
    }
    const stored = this.readStored();
    const selected = (stored?.parentId === profile.parent.parentId
        ? validChildren.find(child => child.studentId === stored.studentId)
        : undefined)
      ?? validChildren[0]
      ?? null;
    selected ? this.select(selected) : this.clear();
    return selected;
  }

  select(child: ChildAccess): void {
    this.selectedSubject.next(child);
    if (typeof localStorage !== 'undefined' && this.authState.getUserRole() === 'PARENT') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        parentId: this.authState.getUserId(), studentId: child.studentId
      }));
    }
  }

  clear(): void {
    this.selectedSubject.next(null);
    if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY);
  }

  private readStored(): { parentId: string; studentId: string } | null {
    if (typeof localStorage === 'undefined') return null;
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'); }
    catch { localStorage.removeItem(STORAGE_KEY); return null; }
  }
}
