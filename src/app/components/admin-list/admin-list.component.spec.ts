import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AdminListComponent } from './admin-list.component';
import { AdminService } from '../../services/admin.service';
import { AuthStateService } from '../../auth/auth-state.service';
import { LoggerService } from '../../services/logger.service';
import { ToastService } from '../../services/toast.service';

/** Shared by the web and Android clients — keep the two copies identical. */
describe('AdminListComponent — load states and deletion', () => {
  let adminService: any;
  let toast: any;

  function render() {
    toast = jasmine.createSpyObj('ToastService', ['success', 'error', 'confirm']);
    TestBed.configureTestingModule({
      imports: [AdminListComponent],
      providers: [
        { provide: AdminService, useValue: adminService },
        { provide: Router, useValue: jasmine.createSpyObj('Router', ['navigate']) },
        { provide: AuthStateService, useValue: { getUser: () => ({ role: 'SUPER_ADMIN', userId: 'sa1' }) } },
        { provide: LoggerService, useValue: jasmine.createSpyObj('LoggerService', ['error']) },
        { provide: ToastService, useValue: toast },
      ],
    });
    const fixture = TestBed.createComponent(AdminListComponent);
    fixture.detectChanges();
    return fixture;
  }
  const el = (fixture: any, id: string) => (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${id}"]`);

  it('a failed load shows an error with Retry, never "No administrators found"', () => {
    adminService = { getAllAdmins: jasmine.createSpy().and.returnValue(throwError(() => new Error('offline'))), deleteAdmin: jasmine.createSpy() };
    const fixture = render();
    expect(fixture.componentInstance.display).toBe('error');
    expect(el(fixture, 'list-empty')).toBeNull();
    adminService.getAllAdmins.and.returnValue(of([]));
    (el(fixture, 'list-error')!.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.componentInstance.display).toBe('empty');
    expect(el(fixture, 'list-empty')).not.toBeNull();
  });

  it('cancelling a delete removes nothing; the dialog has an explicit Cancel', async () => {
    adminService = { getAllAdmins: () => of([{ adminId: 'ad2', name: 'Bala' }]), deleteAdmin: jasmine.createSpy() };
    const fixture = render();
    toast.confirm.and.returnValue(Promise.resolve(false));
    fixture.componentInstance.deleteAdmin(new Event('click'), 'ad2');
    await Promise.resolve();
    expect(toast.confirm.calls.mostRecent().args[0].cancelText).toBe('Cancel');
    expect(adminService.deleteAdmin).not.toHaveBeenCalled();
    expect(fixture.componentInstance.admins.length).toBe(1);
  });
});
