import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { ParentChildContextComponent } from './parent-child-context.component';
import { ParentChildContextService } from '../../services/parent-child-context.service';
import { ParentPortalService } from '../../services/parent-portal.service';
import { AuthStateService } from '../../auth/auth-state.service';
import { ChildAccess, ParentProfile } from '../../interfaces/parent-portal';

/** Parent Lifecycle Phase 1: a deep link to a child the parent can no longer access never silently shows another child. */
describe('ParentChildContextComponent (inaccessible child)', () => {
  let fixture: ComponentFixture<ParentChildContextComponent>;
  let component: ParentChildContextComponent;
  let context: ParentChildContextService;

  const child = (id: string, name: string, o: Partial<ChildAccess> = {}): ChildAccess => ({
    relationshipId: 1, studentId: id, studentName: name, className: '5', sectionName: 'A', relationshipType: 'MOTHER',
    primaryGuardian: true, canViewAttendance: true, canViewFees: true, canPayFees: true, canViewResults: true,
    canViewTimetable: true, canManageLeave: true, effectiveFrom: '2026-04-01', effectiveUntil: null, ...o,
  });
  const profile: ParentProfile = {
    parent: { parentId: 'par_1', name: 'Mum', email: null, phoneNumber: '9800000001', active: true, linkedChildren: 2 },
    children: [child('S1', 'Aarav'), child('S2', 'Diya', { canViewFees: false, canPayFees: false })],
  };

  beforeEach(() => {
    try { localStorage.removeItem('edunexify.parent.selected-child'); } catch { /* ignore */ }
    TestBed.configureTestingModule({
      imports: [ParentChildContextComponent],
      providers: [
        { provide: ParentPortalService, useValue: { getMyProfile: () => of(profile) } },
        { provide: AuthStateService, useValue: { getUserRole: () => 'PARENT', getUserId: () => 'par_1' } },
      ],
    });
    fixture = TestBed.createComponent(ParentChildContextComponent);
    component = fixture.componentInstance;
    context = TestBed.inject(ParentChildContextService);
  });

  function open(studentId: string, requiredPermission?: keyof ChildAccess): HTMLElement {
    component.studentId = studentId;
    component.requiredPermission = requiredPermission;
    component.ngOnChanges();
    fixture.detectChanges();
    return fixture.nativeElement;
  }

  it('says the student is no longer accessible and offers the accessible children, selecting none of them', () => {
    let selected: ChildAccess | null | undefined;
    context.selectedChild$.subscribe(c => selected = c);
    const emitted: ChildAccess[] = [];
    component.childSelected.subscribe(c => emitted.push(c));

    const el = open('S-GONE', 'canViewFees');

    expect(el.textContent).toContain('You no longer have access to this student.');
    const choices = Array.from(el.querySelectorAll('.child-tab')).map(b => b.textContent);
    expect(choices.length).toBe(1);                          // Diya has no fee access, so only Aarav is offered
    expect(choices[0]).toContain('Aarav');
    expect(selected).toBeNull();
    expect(emitted).toEqual([]);

    (el.querySelector('.child-tab') as HTMLButtonElement).click();
    expect(emitted.map(c => c.studentId)).toEqual(['S1']);   // only an explicit choice switches
  });

  it('an accessible child shows normally', () => {
    const el = open('S1');
    expect(el.textContent).not.toContain('You no longer have access');
    expect(el.textContent).toContain('Aarav');
  });

  it('reconcile never substitutes another child for a requested one the parent cannot access', () => {
    expect(context.reconcile(profile, 'S-GONE')).toBeNull();
    expect(context.reconcile(profile, 'S2')?.studentId).toBe('S2');
    expect(context.reconcile(profile)?.studentId).toBe('S2');  // no request: the last selected child
  });
});
