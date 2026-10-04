import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { ParentAccessEditorComponent } from './parent-access-editor.component';
import { ParentPortalService } from '../../services/parent-portal.service';
import { StudentService } from '../../services/student.service';
import { ToastService } from '../../services/toast.service';
import { GuardianLink, ParentProfile } from '../../interfaces/parent-portal';

/** Parent Lifecycle Phase 1: Primary Guardian defaults and the explicit, confirmed takeover. */
describe('ParentAccessEditorComponent (primary guardian)', () => {
  let fixture: ComponentFixture<ParentAccessEditorComponent>;
  let component: ParentAccessEditorComponent;
  let parents: jasmine.SpyObj<ParentPortalService>;
  let toast: jasmine.SpyObj<ToastService>;

  const profile: ParentProfile = {
    parent: { parentId: 'par_2', name: 'Dad', email: 'dad@x.test', phoneNumber: '9800000002', active: true, linkedChildren: 1 },
    children: [],
  };
  const primary = (o: Partial<GuardianLink> = {}): GuardianLink => ({
    relationshipId: 1, parentId: 'par_1', parentName: 'Mum', phoneNumber: '9800000001', email: null, relationshipType: 'MOTHER',
    primaryGuardian: true, linkStatus: 'ACTIVE', effectiveFrom: '2026-04-01', effectiveUntil: null, canViewAttendance: true,
    canViewFees: true, canPayFees: true, canViewResults: true, canViewTimetable: true, canManageLeave: true,
    parentActive: true, loginState: 'ACTIVE', ...o,
  });

  function setup(guardians: GuardianLink[]): void {
    parents = jasmine.createSpyObj('ParentPortalService', ['getGuardians', 'linkStudent']);
    parents.getGuardians.and.returnValue(of(guardians));
    parents.linkStudent.and.returnValue(of(profile));
    toast = jasmine.createSpyObj('ToastService', ['confirm', 'success', 'error', 'warning', 'info']);
    TestBed.configureTestingModule({
      imports: [ParentAccessEditorComponent],
      providers: [
        { provide: ParentPortalService, useValue: parents },
        { provide: StudentService, useValue: jasmine.createSpyObj('StudentService', ['searchStudents']) },
        { provide: ToastService, useValue: toast },
      ],
    });
    fixture = TestBed.createComponent(ParentAccessEditorComponent);
    component = fixture.componentInstance;
    component.parentId = 'par_2';
    component.parentName = 'Dad';
    fixture.detectChanges();
    component.chooseStudent({ studentId: 'stu_1', name: 'Aarav', className: '5' } as any);
    fixture.detectChanges();
  }

  it('the first guardian of a child defaults to primary', () => {
    setup([]);
    expect(parents.getGuardians).toHaveBeenCalledWith('stu_1');
    expect(component.linkForm.controls.primaryGuardian.value).toBeTrue();
  });

  it('a second guardian defaults to non-primary and links without touching the primary', fakeAsync(() => {
    setup([primary()]);
    expect(component.linkForm.controls.primaryGuardian.value).toBeFalse();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Mum is the current primary guardian');

    component.submit();
    tick();

    expect(toast.confirm).not.toHaveBeenCalled();
    const sent = parents.linkStudent.calls.mostRecent().args[1];
    expect(sent.primaryGuardian).toBeFalse();
    expect(sent.replacePrimary).toBeFalse();
  }));

  it('ticking primary asks first, and only a confirmed takeover is sent', fakeAsync(() => {
    setup([primary()]);
    component.linkForm.controls.primaryGuardian.setValue(true);
    toast.confirm.and.resolveTo(false);

    component.submit();
    tick();
    expect(toast.confirm.calls.mostRecent().args[0].message)
      .toBe('Mum is currently the primary guardian. Make Dad the primary guardian instead?');
    expect(parents.linkStudent).not.toHaveBeenCalled();

    toast.confirm.and.resolveTo(true);
    component.submit();
    tick();
    const sent = parents.linkStudent.calls.mostRecent().args[1];
    expect(sent.primaryGuardian).toBeTrue();
    expect(sent.replacePrimary).toBeTrue();
  }));

  it('if someone became primary meanwhile, the server conflict is confirmed and retried as a takeover', fakeAsync(() => {
    setup([]);
    parents.linkStudent.and.returnValues(
      throwError(() => ({ status: 409, error: { message: 'Mum is currently the primary guardian. Make Dad the primary guardian instead?' } })),
      of(profile));
    toast.confirm.and.resolveTo(true);

    component.submit();
    tick();

    expect(toast.confirm).toHaveBeenCalled();
    expect(parents.linkStudent.calls.count()).toBe(2);
    expect(parents.linkStudent.calls.argsFor(0)[1].replacePrimary).toBeFalse();
    expect(parents.linkStudent.calls.argsFor(1)[1].replacePrimary).toBeTrue();
  }));
});
