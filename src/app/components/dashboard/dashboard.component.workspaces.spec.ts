import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { Router } from '@angular/router';
import { WorkspaceService } from '../../services/workspace.service';
import { RouterTestingModule } from '@angular/router/testing';
import { DashboardComponent } from './dashboard.component';
import { AuthService } from '../../auth/auth.service';
import { AuthStateService } from '../../auth/auth-state.service';
import { StudentService } from '../../services/student.service';
import { TeacherService } from '../../services/teacher.service';
import { AdminService } from '../../services/admin.service';
import { NotificationStateService } from '../../services/notification-state.service';
import { PushNotificationService } from '../../services/push-notification.service';
import { NotificationService } from '../../services/notification.service';
import { NotificationNavigationService } from '../../services/notification-navigation.service';
import { ToastService } from '../../services/toast.service';
import { AdoptionMetadataService } from '../../services/adoption-metadata.service';
import { SchoolService } from '../../services/school.service';
import { TenantService } from '../../services/tenant.service';
import { ParentPortalService } from '../../services/parent-portal.service';
import { ParentChildContextService } from '../../services/parent-child-context.service';
import { LoggerService } from '../../services/logger.service';

/**
 * One teacher account, two workspaces: the Teacher workspace keeps the original teacher sidebar, the
 * Coordinator workspace shows Principal-style academic oversight only. Switching never reloads or
 * logs out, and an ordinary teacher never sees the switcher. Android copy: the shell's providers differ from the website's.
 */
describe('DashboardComponent — Teacher / Coordinator workspaces', () => {
  let fixture: ComponentFixture<DashboardComponent>;
  let router: Router;
  let workspace: WorkspaceService;

  function build(coordinator: boolean, userId = 'T1', school = 'a'): void {
    const authState = jasmine.createSpyObj('AuthStateService', [
      'getUser', 'getUserRole', 'isCoordinator', 'isLoggedIn', 'isUnauthenticated', 'loadCurrentUser', 'mustChangePassword',
      'getSubscriptionStatus', 'hasFeature', 'isSubscriptionWarning',
    ]);
    authState.getUser.and.returnValue({ role: 'TEACHER', userId, schoolSlug: school, coordinator } as any);
    authState.getUserRole.and.returnValue('TEACHER');
    authState.isCoordinator.and.returnValue(coordinator);
    authState.isLoggedIn.and.returnValue(true);
    authState.isUnauthenticated.and.returnValue(false);
    authState.loadCurrentUser.and.returnValue(Promise.resolve());
    authState.getSubscriptionStatus.and.returnValue(null);
    authState.hasFeature.and.callFake((key: string) => key !== 'AI_COPILOT');
    authState.isSubscriptionWarning.and.returnValue(false);

    TestBed.configureTestingModule({
      imports: [DashboardComponent, RouterTestingModule],
      providers: [
        { provide: AuthStateService, useValue: authState },
        { provide: AuthService, useValue: {} },
        { provide: StudentService, useValue: {} },
        { provide: TeacherService, useValue: { getTeacher: () => of({ name: 'Asha Rao', classTeacher: '8-A' }) } },
        { provide: AdminService, useValue: {} },
        { provide: NotificationService, useValue: { getUnreadNotificationCount: () => of(0) } },
        { provide: PushNotificationService, useValue: { init: () => Promise.resolve() } },
        { provide: NotificationStateService, useValue: { unreadCount$: of(0), refreshUnread: () => {} } },
        { provide: NotificationNavigationService, useValue: {} },
        { provide: ToastService, useValue: {} },
        { provide: AdoptionMetadataService, useValue: { reportAndroidVersionOnce: () => {} } },
        { provide: SchoolService, useValue: {} },
        { provide: TenantService, useValue: { school: null, loadSchoolBySlug: () => Promise.resolve() } },
        { provide: ParentPortalService, useValue: { getMyProfile: () => of(null) } },
        { provide: ParentChildContextService, useValue: { selectedChild$: of(null), reconcile: () => {} } },
        { provide: LoggerService, useValue: { error: () => {} } },
      ],
    }).compileComponents();
    router = TestBed.inject(Router);
    spyOn(router, 'navigateByUrl').and.resolveTo(true);
    spyOn(router, 'navigate').and.resolveTo(true);
    workspace = TestBed.inject(WorkspaceService);
    fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
  }

  const link = (path: string) => fixture.nativeElement.querySelector(`a[routerLink="/dashboard/${path}"]`);
  const teaching = ['teacher-dashboard', 'teacher-checkin', 'apply-teacher-leave'];
  const coordinating = ['coordinator-dashboard', 'coordinator-people', 'report-card-review', 'staff-attendance'];

  beforeEach(() => localStorage.clear());
  afterEach(() => { fixture.destroy(); localStorage.clear(); });

  it('shows an ordinary teacher only the Teacher workspace and no switcher', () => {
    build(false);
    const cmp = fixture.componentInstance;
    expect(cmp.hasWorkspaceChoice()).toBeFalse();
    for (const p of teaching) expect(link(p)).withContext(p).toBeTruthy();
    for (const p of coordinating) expect(link(p)).withContext(p).toBeNull();
    cmp.switchWorkspace('COORDINATOR');
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('opens a newly appointed coordinator in the Coordinator workspace: oversight only, no teaching items', () => {
    build(true);
    expect(fixture.componentInstance.isCoordinator()).toBeTrue();
    for (const p of coordinating) expect(link(p)).withContext(p).toBeTruthy();
    for (const p of [...teaching, 'view-leaves', 'my-signature']) expect(link(p)).withContext(p).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('My Teaching');
    expect(fixture.componentInstance.getRoleLabel()).toBe('Academic Coordinator');
  });

  it('switches to the original Teacher sidebar and back without a reload, remembering the choice', () => {
    build(true);
    const cmp = fixture.componentInstance;
    cmp.switchWorkspace('TEACHER');
    fixture.detectChanges();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard/teacher-dashboard');
    for (const p of teaching) expect(link(p)).withContext(p).toBeTruthy();
    for (const p of coordinating) expect(link(p)).withContext(p).toBeNull();
    expect(cmp.getRoleLabel()).toBe('Teacher');
    expect(workspace.active()).toBe('TEACHER');

    cmp.switchWorkspace('COORDINATOR');
    fixture.detectChanges();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard/coordinator-dashboard');
    for (const p of coordinating) expect(link(p)).withContext(p).toBeTruthy();
    expect(link('teacher-checkin')).toBeNull();
  });

  it('follows the URL: Back to a Teacher or Coordinator page restores that workspace', () => {
    build(true);
    const cmp = fixture.componentInstance as any;
    cmp.followUrlWorkspace('/dashboard/teacher-dashboard');
    expect(workspace.active()).toBe('TEACHER');
    cmp.followUrlWorkspace('/dashboard/mark-entry');          // shared page: unchanged
    expect(workspace.active()).toBe('TEACHER');
    cmp.followUrlWorkspace('/dashboard/coordinator-people');
    expect(workspace.active()).toBe('COORDINATOR');
  });

  it('keeps the class-teacher leave approval entry in the Teacher workspace', () => {
    build(true);
    fixture.componentInstance.switchWorkspace('TEACHER');
    fixture.detectChanges();
    expect(link('view-leaves')).toBeTruthy();
  });

  it('puts the switcher in the profile menu with the active workspace marked', () => {
    build(true);
    (fixture.nativeElement.querySelector('.hdr-profile-pill') as HTMLElement).click();
    fixture.detectChanges();
    const panel = document.querySelector('[data-testid="workspace-switcher"]') as HTMLElement;
    expect(panel).withContext('switcher').toBeTruthy();
    expect(panel.querySelector('[data-testid="workspace-coordinator"]')?.getAttribute('aria-current')).toBe('true');
    expect(panel.querySelector('[data-testid="workspace-teacher"]')?.getAttribute('aria-current')).toBeNull();
  });

  it('never renders the switcher for an ordinary teacher', () => {
    build(false);
    (fixture.nativeElement.querySelector('.hdr-profile-pill') as HTMLElement).click();
    fixture.detectChanges();
    expect(document.querySelector('[data-testid="workspace-switcher"]')).toBeNull();
  });

  it('keeps preferences separate per user and school', () => {
    build(true, 'T1', 'a');
    fixture.componentInstance.switchWorkspace('TEACHER');
    fixture.destroy();
    TestBed.resetTestingModule();
    build(true, 'T2', 'a');
    expect(fixture.componentInstance.isCoordinator()).toBeTrue();
    fixture.destroy();
    TestBed.resetTestingModule();
    build(true, 'T1', 'b');
    expect(fixture.componentInstance.isCoordinator()).toBeTrue();
  });
});
