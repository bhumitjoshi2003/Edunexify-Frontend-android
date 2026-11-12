import { TestBed } from '@angular/core/testing';
import { HTTP_INTERCEPTORS, HttpClient, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment';
import { AuthStateService } from '../auth/auth-state.service';
import { WORKSPACE_HEADER, WorkspaceInterceptor } from './workspace.interceptor';

/** Shared by the web and Android clients — keep the two copies identical. */
describe('WorkspaceInterceptor', () => {
  const user = { userId: 'emp_1', role: 'TEACHER', coordinator: true, schoolSlug: 'demo' };
  const key = 'edunexify.workspace.v1.demo.emp_1';
  let coordinator = true;
  let url = '/dashboard/manage-assessments';
  let http: HttpClient;
  let backend: HttpTestingController;

  beforeEach(() => {
    coordinator = true;
    url = '/dashboard/manage-assessments';
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        { provide: HTTP_INTERCEPTORS, useClass: WorkspaceInterceptor, multi: true },
        { provide: AuthStateService, useValue: {
          isCoordinator: () => coordinator, getUser: () => (coordinator ? user : { ...user, coordinator: false }), getUserRole: () => 'TEACHER' } },
        { provide: Router, useValue: { getCurrentNavigation: () => null, get url() { return url; } } },
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => { backend.verify(); localStorage.removeItem(key); });

  function headerFor(path = '/assessments/manage'): string | null {
    let sent: string | null = null;
    http.get(environment.apiUrl + path).subscribe();
    const req = backend.expectOne(environment.apiUrl + path);
    sent = req.request.headers.get(WORKSPACE_HEADER);
    req.flush([]);
    return sent;
  }

  it('marks API calls from the Teacher workspace so the server applies ordinary teacher rules', () => {
    localStorage.setItem(key, 'TEACHER');
    expect(headerFor()).toBe('TEACHER');
  });

  it('sends nothing from the Coordinator workspace (the default)', () => {
    expect(headerFor()).toBeNull();
    localStorage.setItem(key, 'COORDINATOR');
    expect(headerFor()).toBeNull();
  });

  it('lets the page decide: Coordinator pages keep Coordinator authority, teaching pages never get it', () => {
    localStorage.setItem(key, 'TEACHER');
    url = '/dashboard/report-card-review';
    expect(headerFor()).toBeNull();
    localStorage.setItem(key, 'COORDINATOR');
    url = '/dashboard/teacher-attendance';
    expect(headerFor()).toBe('TEACHER');
  });

  it('never touches requests of other users or other hosts', () => {
    coordinator = false;
    localStorage.setItem(key, 'TEACHER');
    expect(headerFor()).toBeNull();
    coordinator = true;
    http.get('https://example.test/data').subscribe();
    const other = backend.expectOne('https://example.test/data');
    expect(other.request.headers.has(WORKSPACE_HEADER)).toBeFalse();
    other.flush({});
  });
});
