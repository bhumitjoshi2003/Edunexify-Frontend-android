import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot } from '@angular/router';
import { isObservable } from 'rxjs';
import { principalCapabilityGuard } from './principal-capability.guard';
import { AuthStateService } from './auth-state.service';
import { ToastService } from '../services/toast.service';
import { environment } from '../../environments/environment';

describe('Principal operation navigation', () => {
  let role: string;
  let http: HttpTestingController;
  let toast: jasmine.SpyObj<ToastService>;
  const fallback = { principalFallback: true };
  beforeEach(() => {
    role = 'PRINCIPAL';
    toast = jasmine.createSpyObj('ToastService', ['error']);
    TestBed.configureTestingModule({providers: [provideHttpClient(), provideHttpClientTesting(),
      {provide: AuthStateService, useValue: { getUserRole: () => role }},
      {provide: Router, useValue: {createUrlTree: () => fallback}},
      {provide: ToastService, useValue: toast},
    ]});
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  function check(operation: string | undefined): unknown {
    return TestBed.runInInjectionContext(() => principalCapabilityGuard(
      {data: {principalOperation: operation}} as unknown as ActivatedRouteSnapshot, {} as RouterStateSnapshot));
  }
  it('requires the server operation and fails closed for forbidden operations', () => {
    let result: unknown;
    const response = check('FINANCE');
    if (!isObservable(response)) fail('Expected a server capability check');
    else response.subscribe(value => result = value);
    http.expectOne(`${environment.apiUrl}/principal/capabilities`).flush(['STUDENT_READ']);
    expect(result).toBe(fallback);
  });
  it('allows a permitted read and retains other roles existing guards', () => {
    let result: unknown;
    const response = check('STUDENT_READ');
    if (isObservable(response)) response.subscribe(value => result = value);
    http.expectOne(`${environment.apiUrl}/principal/capabilities`).flush(['STUDENT_READ']);
    expect(result).toBeTrue();
    role = 'TEACHER';
    expect(check(undefined)).toBeTrue();
  });
  it('does not mistake an unavailable contract for permission', () => {
    let result: unknown;
    const response = check('STUDENT_READ');
    if (isObservable(response)) response.subscribe(value => result = value);
    http.expectOne(`${environment.apiUrl}/principal/capabilities`).flush({}, {status: 503, statusText: 'Unavailable'});
    expect(result).toBe(fallback);
    expect(toast.error).toHaveBeenCalled();
    expect(check(undefined)).toBe(fallback);
  });
});
