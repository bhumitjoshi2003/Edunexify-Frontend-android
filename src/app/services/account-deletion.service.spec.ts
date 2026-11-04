import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AccountDeletionService } from './account-deletion.service';
import { environment } from '../../environments/environment';

describe('AccountDeletionService', () => {
  let service: AccountDeletionService;
  let http: HttpTestingController;
  const base = `${environment.apiUrl}/account-deletion-requests`;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AccountDeletionService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sends only the confirmation, reason and platform — never a user or school id', () => {
    service.submit('  Moving schools ').subscribe();
    const req = http.expectOne(base);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ confirmed: true, reason: 'Moving schools', platform: 'WEB' });
    req.flush({ reference: 'DEL-1', status: 'PENDING', requestedAt: '', resolvedAt: null, userMessage: null });
  });

  it('sends no reason when it is blank', () => {
    service.submit('   ').subscribe();
    expect(http.expectOne(base).request.body.reason).toBeNull();
  });

  it('reads the signed-in user\'s own request', () => {
    let result: unknown = 'unset';
    service.mine().subscribe(r => result = r);
    http.expectOne(`${base}/mine`).flush(null, { status: 204, statusText: 'No Content' });
    expect(result).toBeNull();
  });
});
