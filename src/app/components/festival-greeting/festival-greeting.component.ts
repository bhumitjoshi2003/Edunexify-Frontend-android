import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, catchError, interval, of, startWith, switchMap, takeUntil } from 'rxjs';
import { FestivalCampaign, FestivalCampaignService } from '../../services/festival-campaign.service';

@Component({
  selector: 'app-festival-greeting',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './festival-greeting.component.html',
  styleUrl: './festival-greeting.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FestivalGreetingComponent implements OnInit, OnDestroy {
  @Input() userId = '';
  @Input() role = '';
  @Input() schoolSlug = '';
  campaign: FestivalCampaign | null = null;
  open = false;
  private readonly destroyed$ = new Subject<void>();

  constructor(private festivals: FestivalCampaignService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    interval(60_000).pipe(
      startWith(0),
      switchMap(() => this.festivals.getCurrent().pipe(catchError(() => of(null)))),
      takeUntil(this.destroyed$),
    ).subscribe(campaign => {
      if (!campaign?.active) {
        this.campaign = null;
        this.open = false;
      } else {
        this.campaign = campaign;
        this.open = this.open || (!this.wasSeen(campaign.id) && !!this.userId);
      }
      this.cdr.markForCheck();
    });
  }

  showGreeting(): void { this.open = true; }

  dismiss(): void {
    this.open = false;
    if (this.campaign) {
      try { localStorage.setItem(this.storageKey(this.campaign.id), '1'); } catch {}
    }
    this.cdr.markForCheck();
  }

  private storageKey(id: string): string {
    return `edunexify.festival.${id}.${this.schoolSlug}.${this.role}.${this.userId}`;
  }

  private wasSeen(id: string): boolean {
    try { return localStorage.getItem(this.storageKey(id)) === '1'; } catch { return false; }
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
  }
}
