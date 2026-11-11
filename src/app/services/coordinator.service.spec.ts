import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { CoordinatorService } from './coordinator.service';
import { AuthStateService } from '../auth/auth-state.service';
import { environment } from '../../environments/environment';
import { MyCoordinatorAppointment } from '../interfaces/coordinator';

/** Shared by the web and Android clients — keep the two copies identical. */
describe('CoordinatorService', () => {
  let service: CoordinatorService;
  let http: HttpTestingController;
  let authState: jasmine.SpyObj<AuthStateService>;

  const mine: MyCoordinatorAppointment = {
    id: 1, appointedAt: '2026-11-01T00:00:00Z', operations: ['ACADEMIC_CONFIGURATION_EDIT'], fullClassIds: [9],
    scope: [
      { classId: 8, className: '8', sectionId: 81, sectionName: 'A', streamId: null, streamName: null },
      { classId: 9, className: '9', sectionId: null, sectionName: null, streamId: null, streamName: null },
    ],
  };

  beforeEach(() => {
    authState = jasmine.createSpyObj('AuthStateService', ['isCoordinator', 'getUserId', 'getUserRole']);
    authState.getUserId.and.returnValue('T1');
    authState.getUserRole.and.returnValue('TEACHER');
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [{ provide: AuthStateService, useValue: authState }],
    });
    service = TestBed.inject(CoordinatorService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('leaves class lists untouched for anyone who is not a Coordinator', () => {
    authState.isCoordinator.and.returnValue(false);
    let names: string[] = [];
    service.restrictClassNames(['8', '9', '10']).subscribe(n => names = n);
    expect(names).toEqual(['8', '9', '10']);
    http.expectNone(`${environment.apiUrl}/coordinator/me`);
  });

  it('keeps only classes covered in full for class-wide configuration, loading the scope once', () => {
    authState.isCoordinator.and.returnValue(true);
    let names: string[] = [];
    let classes: { id: number }[] = [];
    service.restrictClassNames(['8', '9', '10']).subscribe(n => names = n);
    http.expectOne(`${environment.apiUrl}/coordinator/me`).flush(mine);
    service.restrictToFullClasses([{ id: 8 }, { id: 9 }]).subscribe(c => classes = c);
    expect(names).toEqual(['9']);
    expect(classes).toEqual([{ id: 9 }]);
  });

  it('shows nothing when the appointment cannot be read', () => {
    authState.isCoordinator.and.returnValue(true);
    let names: string[] = ['x'];
    service.restrictClassNames(['8']).subscribe(n => names = n);
    http.expectOne(`${environment.apiUrl}/coordinator/me`).flush({}, { status: 403, statusText: 'Forbidden' });
    expect(names).toEqual([]);
  });

  it('sends appointment changes and correction requests with their reasons', () => {
    service.remove(4, 'Moved to senior wing').subscribe();
    const remove = http.expectOne(`${environment.apiUrl}/coordinators/4/remove`);
    expect(remove.request.method).toBe('POST');
    expect(remove.request.body).toEqual({ reason: 'Moved to senior wing' });
    remove.flush({});

    service.requestCorrection(7, 81, 'Remarks missing', null).subscribe();
    const req = http.expectOne(`${environment.apiUrl}/coordinator/report-cards/7/correction-requests`);
    expect(req.request.body).toEqual({ sectionId: 81, reason: 'Remarks missing', studentId: null });
    req.flush({});
  });

  it('routes report-card review to the Principal API for a Principal and the Coordinator API otherwise', () => {
    authState.getUserRole.and.returnValue('PRINCIPAL');
    service.reportCards().subscribe();
    http.expectOne(`${environment.apiUrl}/principal/report-cards`).flush([]);
    service.requestCorrection(7, 81, 'Remarks missing', null).subscribe();
    http.expectOne(`${environment.apiUrl}/principal/report-cards/7/correction-requests`).flush({});

    authState.getUserRole.and.returnValue('TEACHER');
    service.reportCards().subscribe();
    http.expectOne(`${environment.apiUrl}/coordinator/report-cards`).flush([]);
  });
});
