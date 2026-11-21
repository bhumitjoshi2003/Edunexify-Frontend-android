import { ListDisplay, ListLoadState, adminDeleteDialog, listDisplay } from '../../utils/list-state.util';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, OnDestroy } from '@angular/core';
import { LoggerService } from '../../services/logger.service';
import { AdminService } from '../../services/admin.service';
import { Router } from '@angular/router';
import { AuthStateService } from '../../auth/auth-state.service';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { ToastService } from '../../services/toast.service';
import { Admin } from '../../interfaces/admin';

@Component({
  selector: 'app-admin-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-list.component.html',
  styleUrl: './admin-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminListComponent implements OnInit, OnDestroy {
  admins: Admin[] = [];
  /** See utils/list-state.util.ts: a failed load shows an error with Retry, never "No administrators". */
  loadState: ListLoadState = 'loading';
  loggedInUserRole: string = '';
  currentUserId: string = '';
  private ngUnsubscribe = new Subject<void>();

  constructor(
    private adminService: AdminService,
    private router: Router,
    private authStateService: AuthStateService,
    private logger: LoggerService,
    private cdr: ChangeDetectorRef,
    private toast: ToastService
  ) { }

  ngOnInit(): void {
    this.checkAccessAndLoadAdmins();
  }

  ngOnDestroy(): void {
    this.ngUnsubscribe.next();
    this.ngUnsubscribe.complete();
  }

  checkAccessAndLoadAdmins(): void {
    const user = this.authStateService.getUser();
    if (user) {
      this.loggedInUserRole = user.role;
      this.currentUserId = user.userId;

      if (this.loggedInUserRole === 'ADMIN' || this.loggedInUserRole === 'SUPER_ADMIN') {
        this.loadAdmins();
      } else {
        this.router.navigate(['/dashboard']);
      }
    } else {
      this.router.navigate(['/login']);
    }
  }

  loadAdmins(): void {
    this.loadState = 'loading';
    this.cdr.markForCheck();
    this.adminService.getAllAdmins()
      .pipe(takeUntil(this.ngUnsubscribe))
      .subscribe({
        next: (data) => {
          this.admins = data ?? [];
          this.loadState = 'ready';
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.logger.error('Error fetching admins:', err);
          this.loadState = 'failed';
          this.cdr.markForCheck();
        }
      });
  }

  get display(): ListDisplay { return listDisplay(this.loadState, this.admins.length); }

  viewAdminDetails(adminId: string): void {
    this.router.navigate(['/dashboard/admin-details', adminId]);
  }

  deleteAdmin(event: Event, adminId: string): void {
    event.stopPropagation();

    if (adminId === this.currentUserId) {
      this.toast.error('Error', 'You cannot delete your own account.');
      return;
    }

    this.toast.confirm(adminDeleteDialog()).then(confirmed => {
      if (confirmed) {
        this.adminService.deleteAdmin(adminId).pipe(takeUntil(this.ngUnsubscribe)).subscribe({
          next: () => {
            this.admins = this.admins.filter(a => a.adminId !== adminId);
            this.cdr.markForCheck();
            this.toast.success('Deleted!', 'Admin has been deleted.');
          },
          error: () => this.toast.error('Error', 'Failed to delete admin.')
        });
      }
    });
  }

  trackByAdminId(index: number, admin: Admin): string { return admin.adminId; }

  navigateToRegisterAdmin(): void {
    this.router.navigate(['/dashboard/register-admin']);
  }
}