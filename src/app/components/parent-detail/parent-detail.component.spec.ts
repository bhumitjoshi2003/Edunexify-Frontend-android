import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { Location } from '@angular/common';
import { of } from 'rxjs';

import { ParentDetailComponent } from './parent-detail.component';
import { ParentPortalService } from '../../services/parent-portal.service';
import { StudentService } from '../../services/student.service';
import { ToastService } from '../../services/toast.service';
import { ParentProfile } from '../../interfaces/parent-portal';

/** Parent Lifecycle Phase 1 on Parent Details: edit name/email/phone, resend the setup link, no linking while disabled. */
describe('ParentDetailComponent (lifecycle)', () => {
  let fixture: ComponentFixture<ParentDetailComponent>;
  let component: ParentDetailComponent;
  let parents: jasmine.SpyObj<ParentPortalService>;
  let toast: jasmine.SpyObj<ToastService>;

  const profile = (o: Partial<ParentProfile['parent']> = {}): ParentProfile => ({
    parent: { parentId: 'par_1', name: 'Mum', email: 'mum@x.test', phoneNumber: '9800000001', active: true, linkedChildren: 0, ...o },
    children: [],
  });

  function setup(p: ParentProfile): void {
    parents = jasmine.createSpyObj('ParentPortalService', ['getParent', 'updateParent', 'resendSetupLink', 'getGuardians', 'linkStudent']);
    parents.getParent.and.returnValue(of(p));
    parents.getGuardians.and.returnValue(of([]));
    toast = jasmine.createSpyObj('ToastService', ['confirm', 'success', 'error', 'warning', 'info']);
    toast.confirm.and.resolveTo(true);
    TestBed.configureTestingModule({
      imports: [ParentDetailComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ parentId: 'par_1' }) } } },
        { provide: Location, useValue: jasmine.createSpyObj('Location', ['back']) },
        { provide: ParentPortalService, useValue: parents },
        { provide: StudentService, useValue: jasmine.createSpyObj('StudentService', ['searchStudents']) },
        { provide: ToastService, useValue: toast },
      ],
    });
    fixture = TestBed.createComponent(ParentDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  const button = (label: string) => Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'))
    .find(b => b.textContent?.trim().endsWith(label)) as HTMLButtonElement | undefined;

  it('edits only name, email and phone, and warns when the login email changes', () => {
    setup(profile());
    parents.updateParent.and.returnValue(of(profile({ name: 'Mum Joshi', email: 'new@x.test' })));
    button('Edit details')!.click();
    fixture.detectChanges();
    component.editDetails = { name: ' Mum Joshi ', email: 'new@x.test', phoneNumber: '+91 98000 00001' };

    component.saveDetails();

    expect(parents.updateParent).toHaveBeenCalledWith('par_1', { name: 'Mum Joshi', email: 'new@x.test', phoneNumber: '+91 98000 00001' });
    expect(Object.keys(parents.updateParent.calls.mostRecent().args[1]).sort()).toEqual(['email', 'name', 'phoneNumber']);
    expect(toast.success.calls.mostRecent().args[1]).toContain('login email changed');
    expect(component.profile?.parent.name).toBe('Mum Joshi');
  });

  it('resends the setup link without asking for a password', fakeAsync(() => {
    setup(profile());
    parents.resendSetupLink.and.returnValue(of({ parentId: 'par_1', status: 'sent' }));

    button('Resend setup link')!.click();
    tick();

    expect(toast.confirm.calls.mostRecent().args[0].message).toContain('72 hours');
    expect(parents.resendSetupLink).toHaveBeenCalledWith('par_1');
  }));

  it('a disabled parent offers no setup link and cannot start linking a student', () => {
    setup(profile({ active: false }));
    expect(button('Resend setup link')).toBeUndefined();

    component.startLinking();

    expect(component.showAccessEditor).toBeFalse();
    expect(toast.warning).toHaveBeenCalledWith('Parent account is disabled', 'Reactivate this parent account before linking a student.');
  });
});
