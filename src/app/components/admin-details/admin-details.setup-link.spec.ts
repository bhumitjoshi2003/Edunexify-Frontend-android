import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { AdminDetailsComponent } from './admin-details.component';
import { AdminService } from '../../services/admin.service';
import { AuthService } from '../../auth/auth.service';
import { AuthStateService } from '../../auth/auth-state.service';
import { ToastService } from '../../services/toast.service';

/** Shared by the web and Android clients — keep the two copies identical. Another administrator gets
 * a setup link, never a password chosen by whoever is helping them. */
describe('AdminDetailsComponent — send setup link', () => {
  let adminService: any;
  let toast: any;

  function create(role: string, me: string, viewing: string): AdminDetailsComponent {
    adminService = jasmine.createSpyObj('AdminService', ['getAdminById', 'sendSetupLink', 'deleteAdmin', 'updateAdmin']);
    adminService.getAdminById.and.returnValue(of({ adminId: viewing, name: 'Head', email: 'h@s.in' }));
    toast = jasmine.createSpyObj('ToastService', ['success', 'error', 'warning', 'info', 'confirm']);
    TestBed.configureTestingModule({
      imports: [AdminDetailsComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { params: of({ adminId: viewing }) } },
        { provide: Router, useValue: jasmine.createSpyObj('Router', ['navigate']) },
        { provide: AdminService, useValue: adminService },
        { provide: AuthService, useValue: jasmine.createSpyObj('AuthService', ['changePassword']) },
        { provide: AuthStateService, useValue: { getUser: () => ({ role, userId: me }) } },
        { provide: ToastService, useValue: toast },
      ],
    });
    TestBed.overrideComponent(AdminDetailsComponent, { set: { template: '' } });
    const fixture = TestBed.createComponent(AdminDetailsComponent);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('is offered for another admin (super admin or school admin), never for yourself or other roles', () => {
    expect(create('SUPER_ADMIN', 'root', 'A1').canSendSetupLink()).toBeTrue();
    TestBed.resetTestingModule();
    expect(create('ADMIN', 'A2', 'A1').canSendSetupLink()).toBeTrue();
    TestBed.resetTestingModule();
    expect(create('ADMIN', 'A1', 'A1').canSendSetupLink()).toBeFalse();
    TestBed.resetTestingModule();
    expect(create('TEACHER', 'T1', 'A1').canSendSetupLink()).toBeFalse();
  });

  it('a double click sends one request; the result is reported once', () => {
    const c = create('SUPER_ADMIN', 'root', 'A1');
    const pending = new Subject<any>();
    adminService.sendSetupLink.and.returnValue(pending);
    c.sendSetupLink();
    c.sendSetupLink();
    expect(adminService.sendSetupLink).toHaveBeenCalledOnceWith('A1');
    pending.next({ status: 'SENT', sentTo: 'h••••@s.in' });
    expect(toast.success).toHaveBeenCalledWith('Setup link sent', jasmine.stringContaining('h••••@s.in'));
    expect(c.sendingSetupLink).toBeFalse();
  });

  it('another school\'s admin (404 from the server) is reported plainly', () => {
    const c = create('ADMIN', 'A2', 'B9');
    adminService.sendSetupLink.and.returnValue(throwError(() => ({ status: 404 })));
    c.sendSetupLink();
    expect(toast.error).toHaveBeenCalledWith('Setup link not sent', 'Administrator not found.');
  });
});
