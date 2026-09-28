import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

interface VerifyRcResult {
  valid: boolean;
  schoolName?: string;
  className?: string;
  session?: string;
  publishedAt?: string;
  publishedBy?: string;
  message?: string;
  // Report Card V2 documents only (absent for legacy report cards).
  title?: string;
  studentName?: string;
  reference?: string;
  version?: number;
  status?: 'VALID' | 'SUPERSEDED' | 'WITHDRAWN';
}

@Component({
  selector: 'app-verify-rc',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './verify-rc.component.html',
  styleUrl: './verify-rc.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VerifyRcComponent implements OnInit {
  loading = true;
  result: VerifyRcResult | null = null;

  constructor(
    private route: ActivatedRoute,
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    const token = this.route.snapshot.queryParamMap.get('token') ?? '';
    if (!token) {
      this.result = { valid: false, message: 'No verification token found in this link.' };
      this.loading = false;
      this.cdr.markForCheck();
      return;
    }

    this.http
      .get<VerifyRcResult>(`${environment.apiUrl}/public/verify-rc`, { params: { token } })
      .subscribe({
        next: (res) => {
          this.result = res;
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.result = { valid: false, message: 'Unable to verify. Please check your internet connection and try again.' };
          this.loading = false;
          this.cdr.markForCheck();
        }
      });
  }

  /** A Report Card V2 document that is no longer current (replaced or withdrawn by the school). */
  get retired(): boolean {
    return !!this.result && !this.result.valid && (this.result.status === 'SUPERSEDED' || this.result.status === 'WITHDRAWN');
  }

  get formattedDate(): string {
    if (!this.result?.publishedAt) return '—';
    try {
      return new Date(this.result.publishedAt).toLocaleDateString('en-IN', {
        day: 'numeric', month: 'long', year: 'numeric'
      });
    } catch { return this.result.publishedAt; }
  }
}
