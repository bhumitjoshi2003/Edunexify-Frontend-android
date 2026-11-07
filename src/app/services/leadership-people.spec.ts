import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { AuthStateService } from '../auth/auth-state.service';
import { StudentService } from './student.service';
import { TeacherService } from './teacher.service';
import { SchoolService } from './school.service';
import { environment } from '../../environments/environment';

describe('Leadership academic API projections', () => {
  let role: string;
  let http: HttpTestingController;
  beforeEach(() => {
    role = 'PRINCIPAL';
    TestBed.configureTestingModule({providers: [provideHttpClient(), provideHttpClientTesting(),
      {provide: AuthStateService, useValue: {getUserRole: () => role}},
    ]});
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('uses academic Principal projections and never requests administrative profile data', () => {
    TestBed.inject(StudentService).getStudent('s1').subscribe();
    TestBed.inject(StudentService).searchStudents('Asha').subscribe();
    TestBed.inject(TeacherService).getTeacher('t1').subscribe();
    TestBed.inject(TeacherService).getAllTeachers().subscribe();
    TestBed.inject(SchoolService).getAcademicContext().subscribe();
    const request = http.expectOne(`${environment.apiUrl}/principal/students/s1`);
    expect(request.request.method).toBe('GET');
    request.flush({studentId:'s1'});
    http.expectOne(r => r.url === `${environment.apiUrl}/principal/students` && r.params.get('q') === 'Asha').flush([]);
    http.expectOne(`${environment.apiUrl}/principal/teachers/t1`).flush({teacherId:'t1'});
    http.expectOne(`${environment.apiUrl}/principal/teachers`).flush([]);
    http.expectOne(`${environment.apiUrl}/principal/school-context`).flush({name:'School'});
    http.expectNone(r => /pending-dues|fees|payments|login|school\/settings/.test(r.url));
  });
  it('preserves Admin read URLs', () => {
    role = 'ADMIN';
    TestBed.inject(StudentService).getStudent('s1').subscribe();
    TestBed.inject(TeacherService).getAllTeachers().subscribe();
    const request = http.expectOne(`${environment.apiUrl}/students/s1`);
    expect(request.request.method).toBe('GET');
    request.flush({studentId:'s1'});
    http.expectOne(`${environment.apiUrl}/teachers`).flush([]);
  });
});
