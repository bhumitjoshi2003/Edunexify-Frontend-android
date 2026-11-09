import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EventFormComponent } from './event-form.component';
import { baselineTestProviders } from '../../../testing/baseline-test-providers';

describe('EventFormComponent', () => {
  let component: EventFormComponent;
  let fixture: ComponentFixture<EventFormComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [...baselineTestProviders()],
      imports: [EventFormComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EventFormComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('getFullImageUrl', () => {
    // Regression for the event-image display bug: object-storage images arrive as an
    // already-absolute, short-lived presigned URL (see EventService.resolveImageUrl on the
    // backend) and must be used exactly as-is — the old implementation unconditionally
    // re-prefixed every value with environment.apiUrl (or a dead /files/event-images/ path),
    // corrupting the presigned URL into a broken <img src>.
    it('returns an object-storage presigned URL completely unchanged', () => {
      const presignedUrl = 'https://storage.example.com/bucket/schools/1/events/5/images/uuid.jpg?X-Amz-Signature=abc';
      expect(component.getFullImageUrl(presignedUrl)).toBe(presignedUrl);
    });

    it('prefixes a legacy relative /uploads/events/images/... path with apiUrl', () => {
      const result = component.getFullImageUrl('/uploads/events/images/legacy.jpg');
      expect(result.endsWith('/uploads/events/images/legacy.jpg')).toBeTrue();
      expect(result.startsWith('http')).toBeTrue();
    });

    it('returns empty string for null/undefined', () => {
      expect(component.getFullImageUrl(null)).toBe('');
      expect(component.getFullImageUrl(undefined)).toBe('');
    });
  });
  it('reuses a creation intent after an HTTP failure and blocks a duplicate click', () => {
    const http = TestBed.inject(HttpTestingController);
    spyOn((component as any).router, 'navigate').and.returnValue(Promise.resolve(true));
    component.eventForm.patchValue({ title: 'Day', description: 'Info', startDate: '2099-10-18', endDate: '', category: 'School', targetAudience: ['ALL'] });
    expect(component.eventForm.valid).toBeTrue();
    component.onSubmit(); component.onSubmit();
    const first = http.expectOne(r => r.method === 'POST' && r.url.endsWith('/events'));
    const key = first.request.body.requestId;
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
    first.flush('Temporary failure', { status: 503, statusText: 'Unavailable' });
    expect(component.submitting).toBeFalse(); component.onSubmit();
    const retry = http.expectOne(r => r.method === 'POST' && r.url.endsWith('/events'));
    expect(retry.request.body.requestId).toBe(key); retry.flush({ id: 1 });
  });
  it('uses a fresh creation intent when a failed draft changes', () => {
    const http = TestBed.inject(HttpTestingController);
    component.eventForm.patchValue({ title: 'Day', description: 'Info', startDate: '2099-10-18', category: 'School', targetAudience: ['ALL'] });
    component.onSubmit(); const first = http.expectOne(r => r.method === 'POST' && r.url.endsWith('/events')); const key = first.request.body.requestId;
    first.flush('Temporary failure', { status: 503, statusText: 'Unavailable' });
    component.eventForm.patchValue({ title: 'New day' }); component.onSubmit();
    const next = http.expectOne(r => r.method === 'POST' && r.url.endsWith('/events'));
    expect(next.request.body.requestId).not.toBe(key); next.flush('Failed', { status: 503, statusText: 'Unavailable' });
  });

});
