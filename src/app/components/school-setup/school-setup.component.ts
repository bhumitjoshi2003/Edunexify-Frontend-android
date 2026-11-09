import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { LoggerService } from '../../services/logger.service';
import { SchoolService, SchoolSetupHealth, SchoolSetupItem } from '../../services/school.service';

interface SetupAction { label: string; route: string; queryParams?: Record<string, string>; }

@Component({
  selector: 'app-school-setup',
  standalone: true,
  imports: [CommonModule, MatIconModule, RouterLink],
  templateUrl: './school-setup.component.html',
  styleUrl: './school-setup.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SchoolSetupComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  loading = true;
  error = false;
  health: SchoolSetupHealth | null = null;

  private readonly actions: Record<string, SetupAction> = {
    SCHOOL_PROFILE: { label: 'Complete profile', route: '/dashboard/school-settings' },
    SCHOOL_LOGO: { label: 'Upload logo', route: '/dashboard/school-settings' },
    ACADEMIC_SESSION: { label: 'Manage sessions', route: '/dashboard/school-settings' },
    TEACHERS: { label: 'Add teachers', route: '/dashboard/register', queryParams: { type: 'teacher' } },
    STUDENTS: { label: 'Add students', route: '/dashboard/student-bulk-import' },
    TIMETABLE: { label: 'Build timetable', route: '/dashboard/timetable' },
    ATTENDANCE_CONFIGURATION: { label: 'Configure attendance', route: '/dashboard/school-settings', queryParams: { tab: 'staff-attendance' } },
    PARENT_CONTACTS: { label: 'Manage parents', route: '/dashboard/parent-bulk-import' },
    FEE_CONFIGURATION: { label: 'Configure fees', route: '/dashboard/fee-rule-config' },
  };

  constructor(private schoolService: SchoolService, private logger: LoggerService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading = true;
    this.error = false;
    // Keep any previously loaded content (and the refresh button) visible and merely
    // disabled while a refresh is in flight, instead of blanking the page on every retry.
    this.schoolService.getSetupHealth().pipe(takeUntil(this.destroy$)).subscribe({
      next: health => { this.health = health; this.loading = false; this.cdr.markForCheck(); },
      error: e => { this.logger.error('School setup health load error:', e); this.loading = false; this.error = true; this.cdr.markForCheck(); }
    });
  }

  actionFor(item: SchoolSetupItem): SetupAction | null {
    return item.status === 'INCOMPLETE' ? this.actions[item.key] ?? null : null;
  }

  items(importance: SchoolSetupItem['importance']): SchoolSetupItem[] {
    return this.health?.items.filter(item => item.importance === importance) ?? [];
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }
}
