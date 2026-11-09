import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { SuperAdminDashboardComponent } from './super-admin-dashboard.component';
import { SchoolService } from '../../services/school.service';
import { LoggerService } from '../../services/logger.service';
import { ToastService } from '../../services/toast.service';
import { AdminService } from '../../services/admin.service';

/** Shared by the web and Android clients — keep the two copies identical. School edit payloads,
 * activation and per-school feature overrides behave the same from either client. */
describe('SuperAdminDashboardComponent — school administration', () => {
  let schoolService: any;
  let toast: any;
  let adminService: any;
  let c: SuperAdminDashboardComponent;

  beforeEach(() => {
    schoolService = jasmine.createSpyObj('SchoolService', ['updateSchoolAll', 'deleteSchool', 'onboardSchool',
      'setSuperAdminFeatureOverride', 'getSuperAdminSchoolFeatures']);
    schoolService.getSuperAdminSchoolFeatures.and.returnValue(of([]));
    toast = jasmine.createSpyObj('ToastService', ['success', 'error', 'warning', 'info', 'confirm']);
    adminService = jasmine.createSpyObj('AdminService', ['sendSetupLink']);
    TestBed.configureTestingModule({
      imports: [SuperAdminDashboardComponent],
      providers: [
        { provide: SchoolService, useValue: schoolService },
        { provide: LoggerService, useValue: jasmine.createSpyObj('LoggerService', ['error', 'warn', 'info']) },
        { provide: ToastService, useValue: toast },
        { provide: AdminService, useValue: adminService },
      ],
    });
    TestBed.overrideComponent(SuperAdminDashboardComponent, { set: { template: '' } });
    c = TestBed.createComponent(SuperAdminDashboardComponent).componentInstance;   // ngOnInit not run
  });

  it('generates the slug from the school name the same way on both clients', () => {
    (c as any).onboardForm.name = '  A & B Public School ';
    c.generateSlug();
    expect((c as any).onboardForm.slug).toBe('a-b-public-school');
  });

  it('a new school form has no assumed board', () => {
    expect((c as any).onboardForm.boardType).toBe('');
  });

  it('saving an edit sends the normalized payload, clears emptied fields and never sends activation', () => {
    const school = { id: 7, name: 'Green Valley', active: true } as any;
    schoolService.updateSchoolAll.and.returnValue(of(school));
    c.schools = [school];
    c.editingSchoolId = 7;
    (c as any).editForm = { ...(c as any).editForm, name: ' Green Valley ', slug: ' green-valley ', website: '  ',
      email: ' office@gv.in ', phone: '', boardType: '', active: false };
    c.saveEdit();
    const [id, payload] = schoolService.updateSchoolAll.calls.mostRecent().args;
    expect(id).toBe(7);
    expect(payload.name).toBe('Green Valley');
    expect(payload.slug).toBe('green-valley');
    expect(payload.website).toBe('');
    expect(payload.email).toBe('office@gv.in');
    expect(payload.boardType).toBeNull();
    expect('active' in payload).toBeFalse();
    expect('newAdminPassword' in payload).toBeFalse();
  });

  it('activation is its own confirmed action; cancelling changes nothing', async () => {
    const school = { id: 7, name: 'Green Valley', active: true } as any;
    c.schools = [school];
    toast.confirm.and.returnValue(Promise.resolve(false));
    c.confirmToggleActive(school);
    await Promise.resolve();
    expect(toast.confirm.calls.mostRecent().args[0].title).toBe('Deactivate School?');
    expect(schoolService.deleteSchool).not.toHaveBeenCalled();

    toast.confirm.and.returnValue(Promise.resolve(true));
    schoolService.deleteSchool.and.returnValue(of(undefined));
    c.confirmToggleActive(school);
    await new Promise((r) => setTimeout(r));
    expect(schoolService.deleteSchool).toHaveBeenCalledWith(7);
    expect(c.schools[0].active).toBeFalse();
    expect(toast.success).toHaveBeenCalledWith('Done', '"Green Valley" has been deactivated.');
  });

  it('the same feature in two schools saves independently', () => {
    const first = new Subject<any>();
    const second = new Subject<any>();
    schoolService.setSuperAdminFeatureOverride.and.returnValues(first, second);
    c.setSchoolFeatureOverride(1, 'TRANSPORT', 'ENABLED');
    c.setSchoolFeatureOverride(2, 'TRANSPORT', 'DISABLED');
    expect(c.isSavingFeature(1, 'TRANSPORT')).toBeTrue();
    expect(c.isSavingFeature(2, 'TRANSPORT')).toBeTrue();
    first.next({}); first.complete();
    expect(c.isSavingFeature(1, 'TRANSPORT')).toBeFalse();
    expect(c.isSavingFeature(2, 'TRANSPORT')).toBeTrue();
  });

  it('a second click on the same school + feature while saving is ignored', () => {
    schoolService.setSuperAdminFeatureOverride.and.returnValue(new Subject());
    c.setSchoolFeatureOverride(1, 'TRANSPORT', 'ENABLED');
    c.setSchoolFeatureOverride(1, 'TRANSPORT', 'ENABLED');
    expect(schoolService.setSuperAdminFeatureOverride).toHaveBeenCalledTimes(1);
  });

  it('a failed save releases the button and shows the server reason', () => {
    schoolService.setSuperAdminFeatureOverride.and.returnValue(throwError(() => ({ status: 400, error: 'Feature not found: X' })));
    c.setSchoolFeatureOverride(1, 'X', 'ENABLED');
    expect(c.isSavingFeature(1, 'X')).toBeFalse();
    expect(toast.error).toHaveBeenCalledWith('Error', 'Feature not found: X');
  });

  it('offers plan-aware actions', () => {
    expect(c.featureActions({ overrideState: 'DEFAULT', planGranted: true } as any)).toEqual({ enable: false, disable: true, reset: false });
    expect(c.featureActions({ overrideState: 'DEFAULT', planGranted: false } as any)).toEqual({ enable: true, disable: false, reset: false });
  });

  describe('administrator access: setup links, never shared passwords', () => {
    it('the edit form has no admin password, and saving never sets one', () => {
      expect('newAdminPassword' in (c as any).editForm).toBeFalse();
      expect((c as any).resetAdminPassword).toBeUndefined();
    });

    it('send setup link: one request per click burst, success names the masked address', () => {
      const pending = new Subject<any>();
      adminService.sendSetupLink.and.returnValue(pending);
      c.sendSetupLink('gv_admin');
      c.sendSetupLink('gv_admin'); // double click while the first is in flight
      expect(adminService.sendSetupLink).toHaveBeenCalledOnceWith('gv_admin');
      expect(c.sendingSetupLinkFor).toBe('gv_admin');
      pending.next({ status: 'SENT', sentTo: 'h••••@gv.in' });
      expect(c.sendingSetupLinkFor).toBeNull();
      expect(toast.success).toHaveBeenCalledWith('Setup link sent',
        'A secure setup link was emailed to h••••@gv.in. It works once and expires in 1 hour.');
    });

    it('send setup link: a server-side duplicate is explained, not reported as a second send', () => {
      adminService.sendSetupLink.and.returnValue(of({ status: 'RECENTLY_SENT', sentTo: 'h••••@gv.in' }));
      c.sendSetupLink('gv_admin');
      expect(toast.info).toHaveBeenCalledWith('Setup link already sent', jasmine.stringContaining('less than a minute ago'));
      expect(toast.success).not.toHaveBeenCalled();
    });

    it('send setup link: a refusal shows the server reason and releases the button', () => {
      adminService.sendSetupLink.and.returnValue(throwError(() => ({ status: 409,
        error: { message: 'This administrator account is inactive. Reactivate it before sending a setup link.' } })));
      c.sendSetupLink('gv_admin');
      expect(toast.error).toHaveBeenCalledWith('Setup link not sent', 'This administrator account is inactive. Reactivate it before sending a setup link.');
      expect(c.sendingSetupLinkFor).toBeNull();
    });

    it('no admin ID: nothing is requested', () => {
      c.sendSetupLink(null);
      expect(adminService.sendSetupLink).not.toHaveBeenCalled();
    });

    function fillOnboard(overrides: Record<string, unknown> = {}) {
      schoolService.onboardSchool.and.returnValue(of({ id: 9, name: 'New School' }));
      (c as any).onboardForm = { ...(c as any).onboardForm, name: 'New School', slug: 'new-school', adminName: 'Asha',
        adminUserId: 'ns_admin', adminEmail: 'admin@ns.in', adminPhone: '9876543210', adminDob: '1990-05-23',
        adminGender: 'Female', ...overrides };
    }

    function onboard() {
      fillOnboard();
      c.submitOnboard();
    }

    it('onboarding: needs no admin password and never sends one', () => {
      expect('adminPassword' in (c as any).onboardForm).toBeFalse();
      onboard();
      expect(toast.warning).not.toHaveBeenCalled();
      expect(schoolService.onboardSchool).toHaveBeenCalledTimes(1);
      const payload = schoolService.onboardSchool.calls.mostRecent().args[0];
      expect('adminPassword' in payload).toBeFalse();
      expect(payload).toEqual(jasmine.objectContaining({ adminUserId: 'ns_admin', adminEmail: 'admin@ns.in' }));
    });

    it('onboarding: an unselected admin gender is rejected before any request (backend requires it)', () => {
      for (const gender of ['', '   ']) {
        toast.warning.calls.reset();
        fillOnboard({ adminGender: gender });
        c.submitOnboard();
        expect(toast.warning).toHaveBeenCalledOnceWith('Validation Error', 'Admin gender is required.');
        expect(c.onboarding).toBeFalse();
      }
      expect(schoolService.onboardSchool).not.toHaveBeenCalled();
    });

    it('onboarding: a selected gender passes and the payload is unchanged', () => {
      onboard();
      expect(toast.warning).not.toHaveBeenCalled();
      expect(schoolService.onboardSchool).toHaveBeenCalledOnceWith({
        name: 'New School', slug: 'new-school', address: null, city: null, state: null, pincode: null,
        phone: null, email: null, website: null, boardType: null, academicYearStartMonth: 4,
        adminUserId: 'ns_admin', adminEmail: 'admin@ns.in', adminName: 'Asha', adminPhone: '9876543210',
        adminDob: '1990-05-23', adminGender: 'Female', trialPlanId: null, trialEndsAt: null,
      });
    });

    it('onboarding success says who was emailed and where the school signs in — no password or link', () => {
      schoolService.onboardSchool.and.returnValue(of({ id: 9, name: 'New School', slug: 'new-school', email: 'office@ns.in' }));
      (c as any).onboardForm = { ...(c as any).onboardForm, name: 'New School', slug: 'new-school', adminName: 'Asha',
        adminUserId: 'ns_admin', adminEmail: 'admin@ns.in', adminPhone: '9876543210', adminDob: '1990-05-23',
        adminGender: 'Female' };
      c.submitOnboard();
      const dialog = toast.confirm.calls.mostRecent().args[0];
      expect(dialog.title).toBe('School onboarded');
      expect(dialog.message).toContain('New School is set up on Edunexify');
      expect(dialog.message).toContain('setup email is being sent to the administrator (ns_admin) at admin@ns.in');
      expect(dialog.message).toContain('expires in 1 hour');
      expect(dialog.message).toContain('welcome email is being sent to the school at office@ns.in');
      expect(dialog.message).toContain('https://new-school.edunexify.co.in');
      expect(dialog.message.toLowerCase()).not.toContain('password:');
      expect(dialog.message).not.toContain('token');
    });
  });
});
