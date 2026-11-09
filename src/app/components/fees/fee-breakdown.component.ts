import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MonthBreakdownDetails } from './fees.component';
import { InrPaisePipe, InrPipe } from '../../pipes/inr.pipe';

/**
 * The CURRENT selection's checkout quote, in integer PAISE exactly as the backend returned it —
 * never re-priced here. Null until the quote for the current selection has arrived.
 */
export interface SelectionQuoteSummary {
  monthNames: string[];
  /** School fee for the selection, without late fee or leave charges. */
  schoolFeePaise: number;
  lateFeePaise: number;
  leaveChargesPaise: number;
  convenienceFeePaise: number;
  totalPaise: number;
}

/**
 * Pre-payment summary for the selected months. Shared by the web and Android clients — keep the
 * TypeScript and template identical (styles are per platform). It is not a receipt: money comes
 * from the whole-selection quote, and one month's fee-head lines are always labelled as that month.
 */
@Component({
  selector: 'app-fee-breakdown',
  standalone: true,
  imports: [CommonModule, InrPipe, InrPaisePipe],
  templateUrl: './fee-breakdown.component.html',
  styleUrl: './fee-breakdown.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeeBreakdownComponent {
  /** Fee-head lines for one selected month (rupees, from the backend month breakdown). */
  @Input() details: MonthBreakdownDetails | null = null;
  @Input() selectedMonthCount: number = 0;
  @Input() quote: SelectionQuoteSummary | null = null;

  get multiMonth(): boolean {
    return this.selectedMonthCount > 1;
  }
}
