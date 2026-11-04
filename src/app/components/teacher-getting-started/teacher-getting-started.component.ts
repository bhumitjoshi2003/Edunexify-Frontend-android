import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnChanges, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { AuthStateService } from '../../auth/auth-state.service';
import { ToastService } from '../../services/toast.service';
import { ATTENDANCE_LOCATION_DISCLOSURE } from '../../utils/location-disclosure';
import {
  PermissionState,
  TeacherOnboardingService,
  TeacherOnboardingState,
  TeacherOnboardingVisit,
} from '../../services/teacher-onboarding.service';

interface OnboardingItem {
  id: string;
  title: string;
  description: string;
  icon: string;
  action: string;
  complete: boolean;
  available: boolean;
}

@Component({
  selector: 'app-teacher-getting-started',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './teacher-getting-started.component.html',
  styleUrl: './teacher-getting-started.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeacherGettingStartedComponent implements OnInit, OnChanges {
  @Input() todaysClassesAvailable = true;

  state: TeacherOnboardingState | null = null;
  location: PermissionState = 'unavailable';
  notifications: PermissionState = 'unavailable';
  loading = true;
  actionPending: string | null = null;
  showCompletion = false;
  private userId = '';

  constructor(
    private auth: AuthStateService,
    private onboarding: TeacherOnboardingService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private toast: ToastService,
  ) {}

  async ngOnInit(): Promise<void> {
    const user = this.auth.getUser();
    if (user?.role !== 'TEACHER' || !user.userId) {
      this.loading = false;
      return;
    }
    this.userId = user.userId;
    try {
      this.state = await this.onboarding.load(this.userId);
      const permissions = await this.onboarding.permissions();
      this.location = permissions.location;
      this.notifications = permissions.notifications;
      if (this.isComplete && !this.state.completedAt) {
        this.state = { ...this.state, completedAt: new Date().toISOString() };
        this.showCompletion = true;
        await this.onboarding.save(this.userId, this.state);
      }
    } catch {
      this.state = null;
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  ngOnChanges(): void {
    this.cdr.markForCheck();
  }

  get visible(): boolean {
    return !this.loading && !!this.state && !!this.userId && (!this.isComplete || this.showCompletion);
  }

  get items(): OnboardingItem[] {
    if (!this.state) return [];
    return [
      { id: 'profile', title: 'Review your profile', description: 'Confirm your contact and school details.', icon: 'person_outline', action: 'View profile', complete: this.state.profileVisited, available: true },
      { id: 'classes', title: 'View today’s classes', description: 'See your teaching schedule and upcoming periods.', icon: 'schedule', action: 'View classes', complete: this.state.todaysClassesVisited, available: this.todaysClassesAvailable },
      { id: 'notifications', title: 'Enable notifications', description: 'Receive school announcements, attendance reminders, and leave updates.', icon: 'notifications_none', action: 'Enable', complete: this.notifications === 'granted', available: this.notifications !== 'unavailable' },
      { id: 'location', title: 'Set up attendance location', description: 'Location is used only when you check in or check out for attendance — never in the background.', icon: 'location_on', action: 'Set up', complete: this.location === 'granted', available: this.location !== 'unavailable' },
      { id: 'attendance', title: 'Learn attendance check-in', description: 'Know where to check in and review your attendance.', icon: 'fingerprint', action: 'View attendance', complete: this.state.attendanceVisited, available: true },
      { id: 'leave', title: 'Explore leave requests', description: 'Apply for leave and track its approval status.', icon: 'event_note', action: 'Open leave', complete: this.state.leaveVisited, available: true },
    ].filter(item => item.available);
  }

  get completedCount(): number { return this.items.filter(item => item.complete).length; }
  get progressPercent(): number { return this.items.length ? Math.round(this.completedCount * 100 / this.items.length) : 100; }
  get isComplete(): boolean { return this.items.length > 0 && this.completedCount === this.items.length; }

  async run(item: OnboardingItem): Promise<void> {
    if (!this.state || item.complete || this.actionPending) return;
    this.actionPending = item.id;
    try {
      if (item.id === 'location') {
        // Prominent disclosure: say what happens to location before Android asks for it.
        const accepted = await this.toast.confirm({
          title: 'How Edunexify uses your location',
          message: ATTENDANCE_LOCATION_DISCLOSURE,
          confirmText: 'Continue',
          cancelText: 'Not now',
          icon: 'info',
        });
        if (accepted) this.location = await this.onboarding.requestLocation();
      } else if (item.id === 'notifications') {
        this.notifications = await this.onboarding.enableNotifications();
      } else {
        const destinations: Record<string, [TeacherOnboardingVisit, string]> = {
          profile: ['profileVisited', `/dashboard/teacher-details/${this.userId}`],
          classes: ['todaysClassesVisited', '/dashboard/timetable'],
          attendance: ['attendanceVisited', '/dashboard/teacher-checkin'],
          leave: ['leaveVisited', '/dashboard/apply-teacher-leave'],
        };
        const destination = destinations[item.id];
        if (destination) {
          this.state = await this.onboarding.markVisited(this.userId, this.state, destination[0]);
          await this.router.navigateByUrl(destination[1]);
        }
      }
      await this.captureCompletion();
    } finally {
      this.actionPending = null;
      this.cdr.markForCheck();
    }
  }

  async setMinimized(minimized: boolean): Promise<void> {
    if (!this.state) return;
    this.state = { ...this.state, minimized };
    await this.onboarding.save(this.userId, this.state);
    this.cdr.markForCheck();
  }

  private async captureCompletion(): Promise<void> {
    if (!this.state || !this.isComplete || this.state.completedAt) return;
    this.state = { ...this.state, completedAt: new Date().toISOString(), minimized: false };
    this.showCompletion = true;
    await this.onboarding.save(this.userId, this.state);
  }
}
