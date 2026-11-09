import { of } from 'rxjs';
import { EventService } from '../../services/event.service';
import { ToastService } from '../../services/toast.service';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EventCalendarComponent } from './event-calendar.component';
import { baselineTestProviders } from '../../../testing/baseline-test-providers';

describe('EventCalendarComponent', () => {
  let component: EventCalendarComponent;
  let fixture: ComponentFixture<EventCalendarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [...baselineTestProviders()],
      imports: [EventCalendarComponent]
    })
      .compileComponents();

    fixture = TestBed.createComponent(EventCalendarComponent);
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
    // re-prefixed every value with environment.apiUrl, corrupting the presigned URL into a
    // broken <img src> (the reported "broken image icon" bug).
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
  describe('deferred delete confirmation', () => {
    const event = (id: number) => ({ id, title: 'Event ' + id, description: 'Info', startDate: '2026-10-18', category: 'School', targetAudience: ['ALL'] });
    let resolve: (value: boolean) => void;
    let api: EventService;
    let toast: ToastService;
    beforeEach(() => {
      api = TestBed.inject(EventService); toast = TestBed.inject(ToastService);
      spyOn(toast, 'confirm').and.returnValue(new Promise<boolean>(done => resolve = done));
      spyOn(api, 'deleteEvent').and.returnValue(of(void 0));
      component.selectedEvent = event(1);
    });
    it('does not delete a changed selection after confirmation', async () => {
      const pending = component.deleteCurrentEvent(); component.selectedEvent = event(2); resolve(true); await pending;
      expect(api.deleteEvent).not.toHaveBeenCalled(); expect(component.deletingEvent).toBeFalse();
    });
    it('does not delete after the selected event closes', async () => {
      const pending = component.deleteCurrentEvent(); component.closeSidebar(); resolve(true); await pending;
      expect(api.deleteEvent).not.toHaveBeenCalled();
    });
    it('coalesces duplicate clicks and deletes the captured event once', async () => {
      const pending = component.deleteCurrentEvent(); await component.deleteCurrentEvent(); resolve(true); await pending;
      expect(toast.confirm).toHaveBeenCalledTimes(1); expect(api.deleteEvent).toHaveBeenCalledOnceWith(1);
    });
    it('does not resume deletion after component destruction', async () => {
      const pending = component.deleteCurrentEvent(); component.ngOnDestroy(); resolve(true); await pending;
      expect(api.deleteEvent).not.toHaveBeenCalled();
    });
    describe('from the open details sidebar', () => {
      const sidebarParts = () => fixture.nativeElement.querySelectorAll('.event-sidebar, .backdrop').length;
      beforeEach(() => {
        component.showEventDetails(event(1) as any, new MouseEvent('click'));
        fixture.detectChanges();
      });
      it('removes the sidebar and its backdrop while the confirmation is open', async () => {
        expect(sidebarParts()).toBe(2);
        const pending = component.deleteCurrentEvent(); fixture.detectChanges();
        expect(toast.confirm).toHaveBeenCalledTimes(1);
        expect(component.showSidebar).toBeFalse();
        expect(sidebarParts()).toBe(0);
        resolve(false); await pending;
      });
      it('Cancel deletes nothing and brings the same event details back', async () => {
        const pending = component.deleteCurrentEvent(); resolve(false); await pending; fixture.detectChanges();
        expect(api.deleteEvent).not.toHaveBeenCalled();
        expect(component.selectedEvent?.id).toBe(1);
        expect(component.showSidebar).toBeTrue();
        expect(sidebarParts()).toBe(2);
      });
      it('Confirm deletes exactly once and leaves the sidebar closed', async () => {
        const pending = component.deleteCurrentEvent(); resolve(true); await pending; fixture.detectChanges();
        expect(api.deleteEvent).toHaveBeenCalledOnceWith(1);
        expect(component.selectedEvent).toBeNull();
        expect(sidebarParts()).toBe(0);
      });
    });
    it('renders backend-authorized parent events without a second role filter', () => {
      component.currentUserRole = 'PARENT'; component.allEvents = [event(1)];
      (component as any).populateEvents();
      expect((component as any).eventMap.size).toBeGreaterThan(0);
    });
  });

  describe('real delete confirmation over the details sidebar', () => {
    afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach(c => c.innerHTML = ''));
    it('is the top-most element under its Delete button and deletes once when clicked', async () => {
      const api = TestBed.inject(EventService);
      spyOn(api, 'deleteEvent').and.returnValue(of(void 0));
      component.showEventDetails({ id: 7, title: 'Fair', description: 'Info', startDate: '2026-11-14', category: 'Academic', targetAudience: ['ALL'] } as any,
        new MouseEvent('click'));
      fixture.detectChanges();
      const pending = component.deleteCurrentEvent();
      fixture.detectChanges(); await fixture.whenStable(); await new Promise(done => setTimeout(done, 300));
      const button = document.querySelector('mat-dialog-container button.cd-btn-confirm') as HTMLElement;
      const box = button.getBoundingClientRect();
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      expect(button.contains(hit)).withContext(`top element was ${hit?.tagName}.${hit?.className}`).toBeTrue();
      (hit as HTMLElement).click();
      await pending;
      expect(api.deleteEvent).toHaveBeenCalledOnceWith(7);
    });
  });

});
