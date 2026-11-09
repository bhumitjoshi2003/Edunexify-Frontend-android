import { feeSchoolKey } from '../../utils/fee-editor.util';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { BusFeesService, BusFee, ApplicableBusFee } from '../../services/bus-fees.service';
import { AcademicSessionService } from '../../services/academic-session.service';
import { AcademicSession } from '../../interfaces/academic-session';
import { Subject, takeUntil } from 'rxjs';
import { AuthStateService } from '../../auth/auth-state.service';
import { ToastService } from '../../services/toast.service';
import { ParentPortalService } from '../../services/parent-portal.service';
import { ParentChildContextComponent } from '../parent-child-context/parent-child-context.component';
import { ChildAccess } from '../../interfaces/parent-portal';

@Component({
  selector: 'app-bus-fees',
  standalone: true,
  imports: [CommonModule, FormsModule, ParentChildContextComponent],
  templateUrl: './bus-fees.component.html',
  styleUrls: ['./bus-fees.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BusFeesComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private slabRequest$ = new Subject<void>();
  private generation = 0;
  private destroyed = false;
  private loaded: { school: string; session: AcademicSession; generation: number } | null = null;
  saving = false;
  loadError = '';
  canSave(): boolean { return !!this.loaded && this.matches(this.loaded) && !this.isLoading && !this.loadError && !this.saving; }
  private matches(c: NonNullable<BusFeesComponent['loaded']>): boolean {
    return !this.destroyed && c.school === feeSchoolKey(this.authStateService) && c.session.id === this.currentSession?.id && c.session.label === this.currentSession?.label && c.generation === this.generation;
  }
  /** Latest applicable-fee request wins — a parent switching child cancels the previous child's. */
  private readonly applicableRequest$ = new Subject<void>();
  sessions: AcademicSession[] = [];
  currentSession: AcademicSession | null = null;
  busFeeStructures: BusFee[] = [];
  isEditing = false;
  isLoading = true;
  originalBusFees: BusFee[] = [];

  // Set for STUDENT (self) and PARENT (selected child, permission-checked); blank for ADMIN.
  subjectStudentId = '';
  accessDenied = false;
  applicableBusFee: ApplicableBusFee | null = null;
  applicableLoading = false;

  constructor(
    private busFeesService: BusFeesService,
    private sessionService: AcademicSessionService,
    private authStateService: AuthStateService,
    private parentPortalService: ParentPortalService,
    private route: ActivatedRoute,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private toast: ToastService
  ) { }

  ngOnDestroy(): void {
    this.destroyed = true; this.generation++; this.slabRequest$.next();
    this.destroy$.next();
    this.destroy$.complete();
  }

  ngOnInit(): void {
    const role = this.authStateService.getUserRole();
    if (role === 'PARENT') {
      const requestedStudentId = this.route.snapshot.queryParamMap.get('studentId');
      if (!requestedStudentId) {
        this.accessDenied = true;
        this.isLoading = false;
        this.toast.error('No child selected', 'Open bus fees from the parent portal.');
        return;
      }
      this.subjectStudentId = requestedStudentId;
      this.parentPortalService.getMyProfile().pipe(takeUntil(this.destroy$)).subscribe({
        next: profile => {
          const linked = profile.children.find(child => child.studentId === this.subjectStudentId);
          if (!linked?.canViewFees) {
            // The requested id stays, so the child switcher says this child is unavailable and
            // offers the others — never silently another child's fee.
            this.accessDenied = true;
            if (linked) this.toast.error('Bus fees access unavailable', 'Please contact the school administrator.');
            else this.toast.error('Student unavailable', 'You no longer have access to this student.');
            this.cdr.markForCheck();
          } else if (this.currentSession) {
            this.loadApplicableBusFee();
          }
        },
        error: () => this.toast.error('Could not verify bus fees access')
      });
    } else if (role === 'STUDENT') {
      this.subjectStudentId = this.authStateService.getUserId();
    }
    this.loadSessions();
  }

  /** The slab table is shared across the whole school/session, so switching children never
   *  needs to re-fetch it — only the fee-viewing permission and the per-student applicable
   *  amount need to change. If the *first* child shown had no access, loadSessions() may
   *  never have completed (accessDenied set before the sync-fired call resolves), so fall
   *  back to a full reload in that edge case. */
  onChildTabSelected(child: ChildAccess): void {
    this.subjectStudentId = child.studentId;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { studentId: child.studentId },
      replaceUrl: true,
    });
    if (!child.canViewFees) {
      this.applicableRequest$.next();
      this.applicableBusFee = null;
      this.accessDenied = true;
      this.toast.error('Bus fees access unavailable', 'Please contact the school administrator.');
      this.cdr.markForCheck();
      return;
    }
    this.accessDenied = false;
    if (!this.currentSession) {
      this.loadSessions();
    } else {
      this.loadApplicableBusFee();
    }
  }

  loadSessions(): void {
    if (this.destroyed || this.saving) return;
    const initialSchool = feeSchoolKey(this.authStateService);
    this.loadError = ""; this.isLoading = true;
    this.sessionService.getAllSessions().pipe(takeUntil(this.destroy$)).subscribe({
      next: (sessions) => {
        if (this.destroyed || initialSchool !== feeSchoolKey(this.authStateService)) return;
        this.sessions = sessions;
        const current = sessions.find(s => s.current);
        if (current) {
          this.currentSession = current;
          this.fetchBusFees();
        } else if (sessions.length > 0) {
          this.currentSession = sessions[0];
          this.fetchBusFees();
        } else {
          this.isLoading = false;
          this.cdr.markForCheck();
        }
      },
      error: () => {
        if (this.destroyed || initialSchool !== feeSchoolKey(this.authStateService)) return;
        this.loadError = 'Could not load academic sessions. Please retry.';
        this.isLoading = false;
        this.cdr.markForCheck();
        this.toast.error('Error', 'Failed to load academic sessions.');
      }
    });
  }

  retryLoad(): void { if (!this.currentSession) this.loadSessions(); else this.fetchBusFees(); }

  fetchBusFees(): void {
    if (this.saving || this.destroyed) return;
    this.slabRequest$.next(); const generation = ++this.generation;
    this.busFeeStructures = []; this.originalBusFees = []; this.loaded = null; this.loadError = ''; this.isEditing = false;
    this.applicableRequest$.next(); this.applicableBusFee = null;
    if (!this.currentSession) { this.isLoading = false; this.cdr.markForCheck(); return; }
    const context = { school: feeSchoolKey(this.authStateService), session: { ...this.currentSession }, generation };
    this.isLoading = true; this.cdr.markForCheck();
    this.busFeesService.getBusFees(context.session.label).pipe(takeUntil(this.slabRequest$), takeUntil(this.destroy$)).subscribe({
      next: fees => { if (!this.matches(context)) return; this.busFeeStructures = fees.map(f => ({ ...f })); this.originalBusFees = fees.map(f => ({ ...f })); this.loaded = context; this.isLoading = false; this.cdr.markForCheck(); },
      error: () => { if (!this.matches(context)) return; this.loadError = 'Could not load bus slabs. Please retry.'; this.isLoading = false; this.cdr.markForCheck(); }
    });
    if (!this.accessDenied) this.loadApplicableBusFee();
  }

  /** The current student's (self for STUDENT, selected child for PARENT) resolved bus fee —
   *  always backend-computed (FeeCalculationService.loadBusFee), never matched against the
   *  slab table on the frontend. */
  private loadApplicableBusFee(): void {
    this.applicableRequest$.next();
    if (!this.currentSession || !this.subjectStudentId) return;
    this.applicableLoading = true;
    this.applicableBusFee = null;
    this.cdr.markForCheck();
    this.busFeesService.getApplicableBusFee(this.subjectStudentId, this.currentSession.label)
      .pipe(takeUntil(this.destroy$), takeUntil(this.applicableRequest$)).subscribe({
        next: (applicable) => {
          this.applicableBusFee = applicable;
          this.applicableLoading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.applicableLoading = false;
          this.cdr.markForCheck();
        }
      });
  }

  changeSession(session: AcademicSession): void {
    if (this.saving || this.destroyed) return;
    const origin = this.currentSession;
    if (this.isEditing) {
      this.toast.confirm({
        title: 'Confirm Navigation',
        message: 'Unsaved changes will be lost. Do you want to continue?',
        confirmText: 'Yes, continue!',
        cancelText: 'No, stay here',
      }).then((confirmed) => {
        if (confirmed && !this.destroyed && !this.saving && this.currentSession === origin) {
          this.currentSession = session;
          this.isEditing = false;
          this.fetchBusFees();
        }
      });
    } else {
      this.currentSession = session;
      this.isEditing = false;
      this.fetchBusFees();
    }
  }

  addRow(): void {
    if (!this.saving && this.isEditing && this.currentSession) {
      this.busFeeStructures.push({
        academicYear: this.currentSession.label,
        minDistance: 0,
        maxDistance: null,
        fees: 0,
      });
      this.cdr.markForCheck();
    }
  }

  removeRow(): void {
    if (!this.saving && this.isEditing && this.busFeeStructures.length > 0) {
      this.busFeeStructures.pop();
      this.cdr.markForCheck();
    }
  }

  edit(): void {
    if (!this.canSave() || !this.loaded) return;
    const context = this.loaded;
    this.toast.confirm({ title: 'Enable Edit Mode?', message: 'Edit these bus slabs?', confirmText: 'Edit', cancelText: 'Cancel' }).then(confirmed => {
      if (confirmed && !this.saving && this.matches(context)) { this.isEditing = true; this.cdr.markForCheck(); }
    });
  }

  save(): void {
    if (!this.canSave() || !this.loaded) return;
    const context = this.loaded;
    const rows = this.busFeeStructures.map(r => ({ ...r, academicYear: context.session.label }));
    const sorted = [...rows].sort((a,b) => a.minDistance - b.minDistance);
    if (rows.some(r => !Number.isFinite(r.minDistance) || r.minDistance < 0 || !Number.isFinite(r.fees) || r.fees < 0 || r.maxDistance != null && (!Number.isFinite(r.maxDistance) || r.maxDistance < r.minDistance)) || sorted.some((r,i) => i > 0 && (sorted[i-1].maxDistance == null || sorted[i-1].maxDistance! >= r.minDistance))) {
      this.toast.error('Invalid bus slabs', 'Use nonnegative amounts/distances and disjoint inclusive ranges. An open-ended range must be last.'); return;
    }
    this.saving = true; this.cdr.markForCheck();
    this.toast.confirm({ title: 'Save Changes?', message: `Save bus slabs for ${context.session.label}?`, confirmText: 'Save', cancelText: 'Cancel' }).then(confirmed => {
      if (!confirmed || !this.matches(context)) { this.saving = false; if (!this.destroyed) this.cdr.markForCheck(); return; }
      this.busFeesService.updateBusFees(context.session.label, rows).pipe(takeUntil(this.destroy$)).subscribe({
        next: () => { this.saving = false; if (!this.matches(context)) return; this.isEditing = false; this.originalBusFees = rows.map(r => ({ ...r })); this.toast.success('Saved', `Bus fees for ${context.session.label} saved.`); this.cdr.markForCheck(); },
        error: e => { this.saving = false; if (!this.matches(context)) return; this.isEditing = true; this.toast.error('Error', typeof e?.error === 'string' ? e.error : e?.error?.message || 'Could not save bus fees.'); this.cdr.markForCheck(); }
      });
    });
  }

  cancel(): void {
    if (this.saving || !this.loaded) return;
    const context = this.loaded;
    this.toast.confirm({
      title: 'Cancel Editing?',
      message: 'Are you sure you want to discard your changes?',
      confirmText: 'Yes, discard!',
      cancelText: 'No, continue editing!',
      danger: true,
    }).then((confirmed) => {
      if (confirmed && !this.saving && this.matches(context)) {
        this.isEditing = false;
        this.busFeeStructures = JSON.parse(JSON.stringify(this.originalBusFees));
        this.cdr.markForCheck();
        this.toast.info('Cancelled!', 'Bus fee changes have been discarded.');
      }
    });
  }

  canEdit(): boolean {
    return this.authStateService.getUserRole() === 'ADMIN';
  }

  trackByIndex(index: number): number { return index; }
  trackBySession(_index: number, session: AcademicSession): number { return session.id; }
}