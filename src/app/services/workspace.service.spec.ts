import { TestBed } from '@angular/core/testing';
import { WorkspaceService } from './workspace.service';
import { AuthStateService } from '../auth/auth-state.service';

/** Shared by the web and Android clients — keep the two copies identical. */
describe('WorkspaceService', () => {
  let service: WorkspaceService;
  let user: { userId: string; role: string; schoolSlug: string | null; coordinator: boolean } | null;
  const auth = {
    getUser: () => user,
    getUserRole: () => user?.role ?? '',
    isCoordinator: () => user?.role === 'TEACHER' && user?.coordinator === true,
  };

  const as = (userId: string, schoolSlug: string | null, coordinator: boolean, role = 'TEACHER') =>
    user = { userId, role, schoolSlug, coordinator };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [{ provide: AuthStateService, useValue: auth }] });
    service = TestBed.inject(WorkspaceService);
  });
  afterEach(() => localStorage.clear());

  it('gives an ordinary teacher the Teacher workspace and no switcher', () => {
    as('T1', 'a', false);
    expect(service.hasChoice()).toBeFalse();
    expect(service.active()).toBe('TEACHER');
    expect(service.select('COORDINATOR')).toBe('TEACHER');
    expect(service.active()).toBe('TEACHER');
    expect(localStorage.length).toBe(0);
  });

  it('opens the Coordinator workspace on the first login after an appointment', () => {
    as('T1', 'a', true);
    expect(service.hasChoice()).toBeTrue();
    expect(service.active()).toBe('COORDINATOR');
    expect(service.homeRoute()).toBe('/dashboard/coordinator-dashboard');
  });

  it('remembers the last choice on this device across sessions', () => {
    as('T1', 'a', true);
    service.select('TEACHER');
    expect(service.active()).toBe('TEACHER');
    expect(service.homeRoute()).toBe('/dashboard/teacher-dashboard');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: AuthStateService, useValue: auth }] });
    expect(TestBed.inject(WorkspaceService).active()).toBe('TEACHER');
    service.select('COORDINATOR');
    expect(TestBed.inject(WorkspaceService).active()).toBe('COORDINATOR');
  });

  it('keeps preferences separate per user and per school', () => {
    as('T1', 'a', true);
    service.select('TEACHER');
    as('T2', 'a', true);
    expect(service.active()).toBe('COORDINATOR');
    as('T1', 'b', true);
    expect(service.active()).toBe('COORDINATOR');
    as('T1', 'a', true);
    expect(service.active()).toBe('TEACHER');
  });

  it('returns to the Teacher workspace when the appointment ends, and forgets the stale choice', () => {
    as('T1', 'a', true);
    service.select('COORDINATOR');
    as('T1', 'a', false);
    expect(service.hasChoice()).toBeFalse();
    expect(service.active()).toBe('TEACHER');
    expect(localStorage.length).toBe(0);
    as('T1', 'a', true);               // appointed again later: starts in Coordinator
    expect(service.active()).toBe('COORDINATOR');
  });

  it('ignores a tampered stored value', () => {
    as('T1', 'a', true);
    localStorage.setItem('edunexify.workspace.v1.a.T1', 'ADMIN');
    expect(service.active()).toBe('COORDINATOR');
  });

  it('is only a preference: a stored Coordinator choice grants nothing to a non-coordinator', () => {
    as('T1', 'a', false);
    localStorage.setItem('edunexify.workspace.v1.a.T1', 'COORDINATOR');
    expect(service.active()).toBe('TEACHER');
    expect(service.hasChoice()).toBeFalse();
  });

  it('never gives other roles a workspace choice', () => {
    as('P1', 'a', true, 'PRINCIPAL');
    expect(service.hasChoice()).toBeFalse();
    expect(service.active()).toBe('TEACHER');
  });

  it('maps URLs to the workspace they belong to, leaving shared pages alone', () => {
    expect(WorkspaceService.workspaceOf('/dashboard/teacher-dashboard')).toBe('TEACHER');
    expect(WorkspaceService.workspaceOf('/dashboard/coordinator-people?x=1')).toBe('COORDINATOR');
    expect(WorkspaceService.workspaceOf('/dashboard/report-card-review')).toBe('COORDINATOR');
    expect(WorkspaceService.workspaceOf('/dashboard/staff-attendance')).toBe('COORDINATOR');
    expect(WorkspaceService.workspaceOf('/dashboard/mark-entry')).toBeNull();
    expect(WorkspaceService.workspaceOf('/dashboard/view-leaves')).toBeNull();
  });

  it('survives unavailable storage', () => {
    as('T1', 'a', true);
    spyOn(Storage.prototype, 'setItem').and.throwError('blocked');
    spyOn(Storage.prototype, 'getItem').and.throwError('blocked');
    service.select('TEACHER');
    expect(service.active()).toBe('TEACHER');
  });
});
