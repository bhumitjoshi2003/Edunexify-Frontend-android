import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DemoService } from './demo.service';
import { environment } from '../../environments/environment';

describe('DemoService submission response', () => {
  let service: DemoService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(DemoService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  [true, false].forEach(notificationSent => {
    it(`reads SMTP acceptance ${notificationSent} from the backend`, () => {
      service.submitRequest({ schoolName: 'School', contactName: 'Head', email: 'h@s.test', phone: '123' })
        .subscribe(result => expect(result.notificationSent).toBe(notificationSent));
      const req = http.expectOne(`${environment.apiUrl}/demo-requests`);
      expect(req.request.method).toBe('POST');
      req.flush(JSON.stringify({ notificationSent }), { status: 201, statusText: 'Created' });
    });
  });
  it('accepts the old backend response during rollout', () => {
    service.submitRequest({ schoolName: 'School', contactName: 'Head', email: 'h@s.test', phone: '123' })
      .subscribe(result => expect(result.notificationSent).toBeNull());
    http.expectOne(`${environment.apiUrl}/demo-requests`).flush('Demo request received successfully.');
  });
});
