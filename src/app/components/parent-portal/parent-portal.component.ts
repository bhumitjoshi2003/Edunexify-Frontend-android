import { WisdomCardsComponent } from '../wisdom/wisdom-cards.component';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router } from '@angular/router';
import { ParentChildContextComponent } from '../parent-child-context/parent-child-context.component';
import { catchError, debounceTime, distinctUntilChanged, finalize, of, Subject, switchMap, takeUntil, tap } from 'rxjs';
import { AuthStateService } from '../../auth/auth-state.service';
import {
  ChildAccess, ParentDirectoryStats, ParentLinkedFilter, ParentProfile, ParentStatusFilter, ParentSummary,
} from '../../interfaces/parent-portal';
import { ParentPortalService } from '../../services/parent-portal.service';
import { ToastService } from '../../services/toast.service';
import { StudentService } from '../../services/student.service';
import { Student } from '../../interfaces/student';
import { ParentChildContextService } from '../../services/parent-child-context.service';

/**
 * Serves two very different audiences at the same route, exactly as before the
 * directory/detail split: for ADMIN this is the paginated parent directory only (selecting a
 * row navigates to /dashboard/parent-portal/:parentId, a separate route/component — see
 * ParentDetailComponent); for PARENT this remains their own read-only multi-child portal view.
 */
@Component({
  selector: 'app-parent-portal',
  standalone: true,
  imports: [WisdomCardsComponent, CommonModule, ReactiveFormsModule, MatIconModule, ParentChildContextComponent],
  templateUrl: './parent-portal.component.html',
  styleUrl: './parent-portal.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ParentPortalComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly authState = inject(AuthStateService);
  private readonly parentService = inject(ParentPortalService);
  private readonly studentService = inject(StudentService);
  private readonly toast = inject(ToastService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly childContext = inject(ParentChildContextService);
  private readonly destroy$ = new Subject<void>();
  private readonly studentSearch$ = new Subject<string>();
  private readonly directorySearchInput$ = new Subject<string>();
  private readonly directoryQuery$ = new Subject<void>();
  readonly isAdmin = this.authState.getUserRole() === 'ADMIN';
  hasFeature(featureKey: string): boolean { return this.authState.hasFeature(featureKey); }
  readonly pageSize = 20;
  loading = true;
  directoryBusy = false;
  showCreatePanel = false;
  showIdHint = false;
  working = false;
  parents: ParentSummary[] = [];
  stats: ParentDirectoryStats | null = null;
  profile: ParentProfile | null = null;
  selectedChild: ChildAccess | null = null;

  // Server-driven directory state, mirrored into the URL's query params so that navigating to
  // a parent's detail page and back (or a plain browser Back) restores page/search/filters
  // instead of resetting the admin to page 1.
  searchTerm = '';
  statusFilter: ParentStatusFilter = 'ALL';
  linkedFilter: ParentLinkedFilter = 'ALL';
  currentPage = 0;
  totalElements = 0;
  totalPages = 0;

  studentQuery = '';
  studentMatches: Student[] = [];
  searchingStudents = false;
  studentSearchOpen = false;

  createForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(200)]],
    // Required (unlike before) — email is the only way Edunexify can deliver the account
    // setup link, since no temporary password is ever admin-typed or exposed (Option A
    // onboarding: the parent sets their own password via a secure emailed link).
    email: ['', [Validators.required, Validators.email]],
    phoneNumber: ['', [Validators.required, Validators.pattern(/^[0-9+() -]{7,20}$/)]],
  });

  ngOnInit(): void {
    if (this.isAdmin) {
      const params = this.route.snapshot.queryParamMap;
      this.currentPage = Math.max(0, Number(params.get('page') ?? 0) || 0);
      this.searchTerm = params.get('search') ?? '';
      this.statusFilter = (params.get('status') as ParentStatusFilter) ?? 'ALL';
      this.linkedFilter = (params.get('linked') as ParentLinkedFilter) ?? 'ALL';

      this.directorySearchInput$.pipe(
        debounceTime(400), distinctUntilChanged(), takeUntil(this.destroy$),
      ).subscribe(term => {
        this.searchTerm = term;
        this.currentPage = 0;
        this.syncUrl();
        this.directoryQuery$.next();
      });

      // switchMap cancels a still-in-flight request if the admin changes page/search/filter
      // again before it resolves, so a fast typist or rapid page-click never gets a stale
      // response overwriting a newer one.
      this.directoryQuery$.pipe(
        tap(() => { this.directoryBusy = true; this.cdr.markForCheck(); }),
        switchMap(() => this.parentService.listParents({
          page: this.currentPage, size: this.pageSize, search: this.searchTerm,
          status: this.statusFilter, linked: this.linkedFilter,
        }).pipe(catchError(() => of(null)))),
        takeUntil(this.destroy$),
      ).subscribe(response => {
        this.loading = false;
        this.directoryBusy = false;
        if (response) {
          this.parents = response.content;
          this.totalElements = response.totalElements;
          this.totalPages = response.totalPages;
        } else {
          this.toast.error('Could not load parents', 'Please try again.');
        }
        this.cdr.markForCheck();
      });

      this.loadStats();
      this.directoryQuery$.next();
    } else {
      this.loadMyProfile();
    }

    this.studentSearch$.pipe(
      debounceTime(250), distinctUntilChanged(),
      tap(query => {
        this.searchingStudents = query.length >= 2;
        if (query.length < 2) this.studentMatches = [];
        this.cdr.markForCheck();
      }),
      switchMap(query => query.length >= 2
        ? this.studentService.searchStudents(query).pipe(catchError(() => of([])))
        : of([])),
      takeUntil(this.destroy$)
    ).subscribe(matches => {
      this.studentMatches = matches.filter(student =>
        !['GRADUATED', 'TRANSFERRED', 'WITHDRAWN'].includes(student.status ?? ''));
      this.searchingStudents = false;
      this.studentSearchOpen = this.studentQuery.trim().length >= 2;
      this.cdr.markForCheck();
    });
  }
  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  get hasActiveFilters(): boolean {
    return !!this.searchTerm || this.statusFilter !== 'ALL' || this.linkedFilter !== 'ALL';
  }

  /** Reflects page/search/status/linked into the URL without adding a history entry per keystroke or page click. */
  private syncUrl(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        page: this.currentPage || null,
        search: this.searchTerm || null,
        status: this.statusFilter !== 'ALL' ? this.statusFilter : null,
        linked: this.linkedFilter !== 'ALL' ? this.linkedFilter : null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  loadStats(): void {
    this.parentService.getDirectoryStats().pipe(takeUntil(this.destroy$)).subscribe({
      next: stats => { this.stats = stats; this.cdr.markForCheck(); },
      error: () => { /* Summary cards are supplementary — a failed fetch shouldn't block the directory. */ },
    });
  }

  loadMyProfile(): void {
    this.loading = true;
    this.parentService.getMyProfile().pipe(takeUntil(this.destroy$), finalize(() => {
      this.loading = false; this.cdr.markForCheck();
    })).subscribe({
      next: profile => { this.profile = profile; this.selectedChild = this.childContext.reconcile(profile); },
      error: () => this.toast.error('Could not load your children', 'Please contact the school if this continues.'),
    });
  }

  viewParent(parent: ParentSummary): void {
    this.router.navigate(['/dashboard/parent-portal', parent.parentId]);
  }

  goToBulkImport(): void {
    this.router.navigate(['/dashboard/parent-bulk-import']);
  }

  toggleCreatePanel(): void {
    this.showCreatePanel = !this.showCreatePanel;
    if (!this.showCreatePanel) {
      this.createForm.reset({ name: '', email: '', phoneNumber: '' });
      this.showIdHint = false;
    }
  }

  toggleIdHint(): void {
    this.showIdHint = !this.showIdHint;
    this.cdr.markForCheck();
  }

  createParent(): void {
    if (this.createForm.invalid || this.working) { this.createForm.markAllAsTouched(); return; }
    this.working = true;
    this.parentService.createParent(this.createForm.getRawValue()).pipe(takeUntil(this.destroy$), finalize(() => {
      this.working = false; this.cdr.markForCheck();
    })).subscribe({
      next: profile => {
        this.showCreatePanel = false;
        this.createForm.reset({ name: '', email: '', phoneNumber: '' });
        this.toast.success('Parent account created',
          `Edunexify ID: ${profile.parent.parentId}. An email has been sent so the parent can set their password.`);
        this.router.navigate(['/dashboard/parent-portal', profile.parent.parentId]);
      },
      error: error => this.toast.error('Could not create parent', error?.error?.message || error?.error || 'Please verify the details.'),
    });
  }

  updateDirectorySearch(event: Event): void {
    this.directorySearchInput$.next((event.target as HTMLInputElement).value.trim());
  }

  updateStatusFilter(event: Event): void {
    this.statusFilter = (event.target as HTMLSelectElement).value as ParentStatusFilter;
    this.currentPage = 0;
    this.syncUrl();
    this.directoryQuery$.next();
  }

  updateLinkedFilter(event: Event): void {
    this.linkedFilter = (event.target as HTMLSelectElement).value as ParentLinkedFilter;
    this.currentPage = 0;
    this.syncUrl();
    this.directoryQuery$.next();
  }

  clearFilters(): void {
    this.searchTerm = '';
    this.statusFilter = 'ALL';
    this.linkedFilter = 'ALL';
    this.currentPage = 0;
    this.syncUrl();
    this.directoryQuery$.next();
  }

  changeDirectoryPage(delta: number): void {
    const next = this.currentPage + delta;
    if (next < 0 || next >= this.totalPages) return;
    this.currentPage = next;
    this.syncUrl();
    this.directoryQuery$.next();
  }

  selectChild(child: ChildAccess): void { this.selectedChild = child; this.childContext.select(child); }

  openAttendance(child: ChildAccess): void {
    this.childContext.select(child);
    this.router.navigate(['/dashboard/attendance-summary'], {
      queryParams: { studentId: child.studentId, className: child.className }
    });
  }

  openFees(child: ChildAccess): void {
    this.childContext.select(child);
    this.router.navigate(['/dashboard/fees', child.studentId]);
  }

  openPaymentHistory(child: ChildAccess): void {
    this.childContext.select(child);
    this.router.navigate(['/dashboard/payment-history', child.studentId]);
  }

  openResults(child: ChildAccess): void {
    this.childContext.select(child);
    this.router.navigate(['/dashboard/my-results'], { queryParams: { studentId: child.studentId } });
  }

  openLeave(child: ChildAccess): void {
    this.childContext.select(child);
    this.router.navigate(['/dashboard/apply-leave'], { queryParams: { studentId: child.studentId } });
  }

  openFeeStructure(child: ChildAccess): void {
    this.childContext.select(child);
    this.router.navigate(['/dashboard/fee-structure'], { queryParams: { studentId: child.studentId } });
  }

  openBusFees(child: ChildAccess): void {
    this.childContext.select(child);
    this.router.navigate(['/dashboard/bus-fees'], { queryParams: { studentId: child.studentId } });
  }

  openReportCard(child: ChildAccess): void {
    this.childContext.select(child);
    // The child's published report cards (the list links on to earlier, pre-V2 report cards).
    this.router.navigate(['/dashboard/report-card-documents'], { queryParams: { studentId: child.studentId } });
  }

  openSchoolUpdates(): void { this.router.navigate(['/dashboard/notice']); }

  openTimetable(child: ChildAccess): void {
    this.childContext.select(child);
    this.router.navigate(['/dashboard/timetable'], {
      queryParams: { studentId: child.studentId, className: child.className }
    });
  }
}
