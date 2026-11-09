import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { CalendarEvent, EventWriteRequest } from '../interfaces/event-calendar.component';
import { UploadRequestResponse, UploadCompleteResponse } from '../interfaces/upload';

@Injectable({
  providedIn: 'root'
})
export class EventService {

  private apiUrl = `${environment.apiUrl}/events`;
  private fileUploadApiUrl = `${environment.apiUrl}/files`;

  constructor(private http: HttpClient) { }

  // Changed 'Event' to 'CalendarEvent'
  createEvent(event: CalendarEvent, requestId: string): Observable<CalendarEvent> {
    return this.http.post<CalendarEvent>(this.apiUrl, { ...this.writeFields(event), requestId });
  }

  // Changed 'Event' to 'CalendarEvent'
  getEventById(id: number): Observable<CalendarEvent> {
    return this.http.get<CalendarEvent>(`${this.apiUrl}/${id}`);
  }

  // Changed 'Event[]' to 'CalendarEvent[]'
  getEventsForMonthAndYear(year: number, month: number): Observable<CalendarEvent[]> {
    return this.http.get<CalendarEvent[]>(`${this.apiUrl}/month/${month}/year/${year}`);
  }

  updateEvent(id: number, event: CalendarEvent): Observable<CalendarEvent> {
    return this.http.put<CalendarEvent>(`${this.apiUrl}/${id}`, this.writeFields(event));
  }

  /** Strict write contract: never round-trip server id/tenant/audit metadata. */
  private writeFields(event: CalendarEvent): EventWriteRequest {
    const { title, description, startDate, endDate, startTime, endTime, location, category,
      targetAudience, videoLinks, imageUrl } = event;
    return { title, description, startDate, endDate: endDate || null, startTime: startTime || null,
      endTime: endTime || null, location, category, targetAudience,
      videoLinks: (videoLinks ?? []).filter(link => link.trim().length > 0), imageUrl };
  }

  deleteEvent(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  /**
   * Direct-to-object-storage upload, replacing the retired POST /api/files/uploadEventImage.
   * eventId is null when creating a brand new event (the image is uploaded before the event
   * itself exists yet — the backend accepts a fixed "new" sentinel entityId for exactly this
   * case) or the real event id when replacing an existing event's image.
   */
  uploadEventImageDirect(file: File, eventId: number | null): Observable<UploadCompleteResponse> {
    const uploadRequestUrl = `${this.fileUploadApiUrl}/upload-request`;
    const completeUrl = `${this.fileUploadApiUrl}/complete`;
    const entityId = eventId !== null ? String(eventId) : 'new';

    return this.http
      .post<UploadRequestResponse>(uploadRequestUrl, {
        purpose: 'EVENT_IMAGE',
        entityId,
        fileName: file.name,
        contentType: file.type,
        size: file.size,
      })
      .pipe(
        switchMap((uploadRequest) => {
          const headers = new HttpHeaders(uploadRequest.requiredHeaders);
          return this.http.put(uploadRequest.uploadUrl, file, { headers }).pipe(
            switchMap(() =>
              this.http.post<UploadCompleteResponse>(completeUrl, {
                objectKey: uploadRequest.objectKey,
                purpose: 'EVENT_IMAGE',
                entityId,
              }),
            ),
          );
        }),
      );
  }
}