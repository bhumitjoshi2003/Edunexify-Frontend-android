import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { environment } from '../../environments/environment';

export interface FestivalCampaign {
  id: string;
  enabled: boolean;
  active: boolean;
  title: string;
  message: string;
  startsOn: string;
  endsOn: string;
}

@Injectable({ providedIn: 'root' })
export class FestivalCampaignService {
  private readonly url = `${environment.apiUrl}/festival-campaign`;

  // Optional for isolated shell/component tests that intentionally omit HttpClient.
  private readonly http = inject(HttpClient, { optional: true });

  getCurrent(): Observable<FestivalCampaign | null> {
    return this.http ? this.http.get<FestivalCampaign>(this.url) : of(null);
  }

  setEnabled(enabled: boolean): Observable<FestivalCampaign> {
    return this.http
      ? this.http.put<FestivalCampaign>(`${this.url}/enabled`, { enabled })
      : throwError(() => new Error('HTTP client is unavailable'));
  }
}
