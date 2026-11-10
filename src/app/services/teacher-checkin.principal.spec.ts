import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TeacherCheckinService } from './teacher-checkin.service';
import { AuthStateService } from '../auth/auth-state.service';
import { environment } from '../../environments/environment';

/** Shared by the web and Android clients — keep the two copies identical. */
describe('TeacherCheckinService — Principal staff attendance endpoints', () => {
  let role = 'PRINCIPAL';
  let http: HttpTestingController;
  let service: TeacherCheckinService;
  const api = environment.apiUrl;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: AuthStateService, useValue: { getUserRole: () => role } }],
    });
    http = TestBed.inject(HttpTestingController);
    service = TestBed.inject(TeacherCheckinService);
  });
  afterEach(() => http.verify());

  it('reads and corrects through the audited Principal endpoints', () => {
    role = 'PRINCIPAL';
    service.getByDate('2026-11-06').subscribe();
    service.getMarkableTeachers('2026-11-06').subscribe();
    service.getSchoolTiming().subscribe();
    service.getSummary(11, 2026, 'T1').subscribe();
    service.principalCorrect({ teacherId: 'T1', date: '2026-11-06', status: 'LATE', reason: 'r' }).subscribe();
    service.getCorrectionHistory('T1', '2026-11-06').subscribe();
    service.getOwnTeacherIds().subscribe();
    http.expectOne(`${api}/principal/staff-attendance/date/2026-11-06`).flush([]);
    http.expectOne(`${api}/principal/staff-attendance/date/2026-11-06/markable-teachers`).flush([]);
    http.expectOne(`${api}/principal/staff-attendance/school-timing`).flush({});
    http.expectOne(r => r.url === `${api}/principal/staff-attendance/summary` && r.params.get('teacherId') === 'T1').flush({});
    const post = http.expectOne(`${api}/principal/staff-attendance/corrections`);
    expect(post.request.method).toBe('POST');
    expect(post.request.body.reason).toBe('r');
    post.flush({});
    http.expectOne(r => r.url === `${api}/principal/staff-attendance/corrections` && r.method === 'GET'
      && r.params.get('teacherId') === 'T1' && r.params.get('date') === '2026-11-06').flush([]);
    http.expectOne(`${api}/principal/staff-attendance/self`).flush({ teacherIds: [] });
  });

  it('keeps Admin on the existing teacher-checkin endpoints', () => {
    role = 'ADMIN';
    service.getByDate('2026-11-06').subscribe();
    service.adminMark({ teacherId: 'T1', date: '2026-11-06', status: 'LATE' }).subscribe();
    http.expectOne(`${api}/teacher-checkin/date/2026-11-06`).flush([]);
    http.expectOne(`${api}/teacher-checkin/admin-mark`).flush({});
  });
});
