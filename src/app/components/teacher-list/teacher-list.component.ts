import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, OnDestroy } from '@angular/core';
import { LoggerService } from '../../services/logger.service';
import { TeacherService } from '../../services/teacher.service';
import { Router } from '@angular/router';
import { AuthStateService } from '../../auth/auth-state.service';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { ToastService } from '../../services/toast.service';

interface Teacher {
  teacherId: string;
  name: string;
  phoneNumber?: string;
  status?: 'ACTIVE' | 'UPCOMING' | 'LEFT';
  joiningDate?: string | null;
  rejoinDate?: string | null;
  leavingDate?: string | null;
}

@Component({
  selector: 'app-teacher-list',
  imports: [CommonModule],
  templateUrl: './teacher-list.component.html',
  styleUrl: './teacher-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeacherListComponent implements OnInit, OnDestroy {
  teachers: Teacher[] = [];
  isLoading: boolean = true;
  loggedInUserRole: string = '';
  private ngUnsubscribe = new Subject<void>();

  constructor(
    private teacherService: TeacherService,
    private router: Router,
    private authStateService: AuthStateService,
    private logger: LoggerService,
    private cdr: ChangeDetectorRef,
    private toast: ToastService
  ) { }

  ngOnInit(): void {
    this.getUserRoleAndLoadTeachers();
  }

  ngOnDestroy(): void {
    this.ngUnsubscribe.next();
    this.ngUnsubscribe.complete();
  }

  getUserRoleAndLoadTeachers(): void {
    const user = this.authStateService.getUser();
    if (user) {
      this.loggedInUserRole = user.role;

      if (this.loggedInUserRole === 'ADMIN') {
        this.loadAllTeachers();
      } else {
        this.logger.error('Non-admin user trying to access teacher list.');
        this.router.navigate(['/dashboard']);
      }
    } else {
      this.logger.error('No token found');
      this.router.navigate(['/login']);
    }
  }

  loadAllTeachers(): void {
    this.isLoading = true;
    this.cdr.markForCheck();
    this.teacherService.getAllTeachers().pipe(
      takeUntil(this.ngUnsubscribe),
      finalize(() => { this.isLoading = false; this.cdr.markForCheck(); })
    ).subscribe({
      next: (teachers) => {
        this.teachers = teachers ?? [];
      },
      error: (error) => {
        this.logger.error('Error fetching all teachers:', error);
        this.toast.error('Error', 'Failed to load teachers. Please try again.');
      }
    });
  }

  trackByTeacherId(index: number, teacher: Teacher): string { return teacher.teacherId; }

  viewTeacherDetails(teacherId: string): void {
    this.router.navigate(['/dashboard/teacher-details', teacherId]);
  }

  navigateToBulkImport(): void {
    this.router.navigate(['/dashboard/teacher-bulk-import']);
  }

  hasFeature(featureKey: string): boolean {
    return this.authStateService.hasFeature(featureKey);
  }
}
