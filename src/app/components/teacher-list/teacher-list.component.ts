import { ListDisplay, ListLoadState, listDisplay } from '../../utils/list-state.util';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, OnDestroy } from '@angular/core';
import { LoggerService } from '../../services/logger.service';
import { TeacherService } from '../../services/teacher.service';
import { Router } from '@angular/router';
import { WorkspaceService } from '../../services/workspace.service';
import { AuthStateService } from '../../auth/auth-state.service';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';

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
  /** See utils/list-state.util.ts: a failed load shows an error with Retry, never "No teachers". */
  loadState: ListLoadState = 'loading';
  loggedInUserRole: string = '';
  private ngUnsubscribe = new Subject<void>();

  constructor(
    private teacherService: TeacherService,
    private router: Router,
    private authStateService: AuthStateService,
    private logger: LoggerService,
    private cdr: ChangeDetectorRef,
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
      // A Coordinator in the Coordinator workspace reads the school like the Principal (read-only screens).
      this.loggedInUserRole = WorkspaceService.leadershipView(this.authStateService) ? 'PRINCIPAL' : user.role;

      if ((this.loggedInUserRole === 'ADMIN' || this.loggedInUserRole === 'PRINCIPAL')) {
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
    this.loadState = 'loading';
    this.cdr.markForCheck();
    this.teacherService.getAllTeachers().pipe(takeUntil(this.ngUnsubscribe)).subscribe({
      next: (teachers) => {
        this.teachers = teachers ?? [];
        this.loadState = 'ready';
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.logger.error('Error fetching all teachers:', error);
        this.loadState = 'failed';
        this.cdr.markForCheck();
      }
    });
  }

  get display(): ListDisplay { return listDisplay(this.loadState, this.teachers.length); }

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
