import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
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

  constructor(private http: HttpClient) {}

  getCurrent(): Observable<FestivalCampaign> {
    return this.http.get<FestivalCampaign>(this.url);
  }

  setEnabled(enabled: boolean): Observable<FestivalCampaign> {
    return this.http.put<FestivalCampaign>(`${this.url}/enabled`, { enabled });
  }
}
