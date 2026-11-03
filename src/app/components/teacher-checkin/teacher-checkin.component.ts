import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, interval, takeUntil } from 'rxjs';
import { TeacherCheckinService } from '../../services/teacher-checkin.service';
import { TeacherAttendanceRecord, TeacherAttendanceSummary } from '../../interfaces/teacher-checkin';
import { AuthStateService } from '../../auth/auth-state.service';
import { LoggerService } from '../../services/logger.service';
import { ToastService } from '../../services/toast.service';
import { Capacitor } from '@capacitor/core';
import { Geolocation, Position } from '@capacitor/geolocation';
import {
  formatTeacherAttendanceTime,
  localDateKey,
  teacherAttendanceErrorMessage,
} from '../../utils/teacher-attendance.util';

interface CalendarDay {
  date: number | null;
  status: string;
  fullDate: string;
}

interface LocationFix {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

class AttendanceLocationError extends Error {
  constructor(
    message: string,
    readonly kind: 'PERMISSION' | 'DISABLED' | 'TIMEOUT' | 'UNAVAILABLE' | 'INACCURATE'
  ) {
    super(message);
    this.name = 'AttendanceLocationError';
  }
}

@Component({
  selector: 'app-teacher-checkin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './teacher-checkin.component.html',
  styleUrl: './teacher-checkin.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeacherCheckinComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private readonly preferredAccuracyMetres = 50;
  private readonly maximumAccuracyMetres = 100;
  private readonly locationSamplingTimeoutMs = 25000;
  private readonly maximumLocationAgeMs = 15000;

  userName = '';
  currentTime = '';
  todayRecord: TeacherAttendanceRecord | null = null;
  monthlyData: TeacherAttendanceSummary | null = null;
  calendarDays: CalendarDay[] = [];

  selectedMonth: number;
  selectedYear: number;

  isLoading = false;
  todayStateResolved = false;
  attendanceLoadError: string | null = null;
  isCheckingIn = false;
  isCheckingOut = false;
  gpsError: string | null = null;

  /** 5 weeks × 7 days = 35 cells for calendar skeleton */
  readonly CALENDAR_SKELETON_COUNT = 35;
  skeletonDays = Array(this.CALENDAR_SKELETON_COUNT);

  readonly monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  constructor(
    private checkinService: TeacherCheckinService,
    private authState: AuthStateService,
    private logger: LoggerService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef
  ) {
    const now = new Date();
    this.selectedMonth = now.getMonth() + 1;
    this.selectedYear = now.getFullYear();
  }

  ngOnInit(): void {
    const user = this.authState.getUser();
    this.userName = user?.name ?? 'Teacher';
    this.updateTime();
    interval(1000).pipe(takeUntil(this.destroy$)).subscribe(() => this.updateTime());
    this.loadMonthlyData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private updateTime(): void {
    const now = new Date();
    this.currentTime = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    this.cdr.markForCheck();
  }

  get greeting(): string {
    const h = new Date().getHours();
    if (h < 12) return 'Good Morning';
    if (h < 17) return 'Good Afternoon';
    return 'Good Evening';
  }

  get todayDateStr(): string {
    return new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }

  get hasCheckedIn(): boolean {
    return !!this.todayRecord?.checkInTime;
  }

  get hasCheckedOut(): boolean {
    return !!this.todayRecord?.checkOutTime;
  }

  loadMonthlyData(): void {
    const now = new Date();
    const isCurrentMonth = this.selectedMonth === now.getMonth() + 1
      && this.selectedYear === now.getFullYear();
    this.isLoading = true;
    if (isCurrentMonth) {
      this.todayStateResolved = false;
      this.attendanceLoadError = null;
    }
    this.cdr.markForCheck();
    this.checkinService.getMyAttendance(this.selectedMonth, this.selectedYear)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.monthlyData = data;
          this.findTodayRecord(data);
          this.buildCalendar(data);
          this.isLoading = false;
          if (isCurrentMonth) this.todayStateResolved = true;
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.logger.error('Failed to load attendance data', err);
          this.isLoading = false;
          if (isCurrentMonth) {
            this.todayStateResolved = false;
            this.attendanceLoadError = teacherAttendanceErrorMessage(
              err,
              'We could not load today\'s attendance. Check your connection and try again.'
            );
          }
          this.cdr.markForCheck();
        }
      });
  }

  private findTodayRecord(data: TeacherAttendanceSummary): void {
    const now = new Date();
    if (this.selectedMonth === now.getMonth() + 1 && this.selectedYear === now.getFullYear()) {
      this.todayRecord = data.records.find(r => r.date === localDateKey(now)) ?? null;
    }
  }

  private buildCalendar(data: TeacherAttendanceSummary): void {
    const recordMap = new Map<string, string>();
    data.records.forEach(r => recordMap.set(r.date, r.status));

    const year = this.selectedYear;
    const month = this.selectedMonth - 1;
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Monday=0 start
    let startDay = firstDay.getDay() - 1;
    if (startDay < 0) startDay = 6;

    const days: CalendarDay[] = [];
    for (let i = 0; i < startDay; i++) {
      days.push({ date: null, status: '', fullDate: '' });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const status = data.trackingStartDate && dateStr < data.trackingStartDate
        ? 'NOT_TRACKED'
        : (recordMap.get(dateStr) ?? '');
      days.push({ date: d, status, fullDate: dateStr });
    }
    this.calendarDays = days;
  }

  async checkIn(): Promise<void> {
    if (!this.todayStateResolved) return;
    if (this.hasCheckedIn) {
      this.toast.warning('Already Checked In', 'You have already checked in today.');
      return;
    }
    this.isCheckingIn = true;
    this.gpsError = null;
    this.cdr.markForCheck();
    try {
      const pos = await this.getPosition();
      this.checkinService.checkIn({ latitude: pos.latitude, longitude: pos.longitude })
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (record) => {
            this.todayRecord = record;
            this.isCheckingIn = false;
            if (record.status === 'ON_TIME') {
              this.toast.success('Checked In', 'You are on time! Have a great day.');
            } else {
              this.toast.warning('Checked In — Late', 'You were marked as LATE.');
            }
            this.loadMonthlyData();
            this.cdr.markForCheck();
          },
          error: (err) => {
            this.isCheckingIn = false;
            const msg = teacherAttendanceErrorMessage(err, 'Check-in failed. Please try again.');
            if (this.isAlreadyCheckedInError(err, msg)) {
              this.toast.info('Attendance Updated', 'Your attendance was already marked. Refreshing today\'s status.');
              this.loadCurrentMonth();
              return;
            }
            this.toast.error('Check-in Failed', msg);
            this.cdr.markForCheck();
          }
        });
    } catch (err: any) {
      this.isCheckingIn = false;
      this.gpsError = this.getGpsErrorMessage(err);
      this.toast.error('Location Error', this.gpsError);
      this.cdr.markForCheck();
    }
  }

  async checkOut(): Promise<void> {
    if (!this.hasCheckedIn) {
      this.toast.error('Not Checked In', 'You must check in before checking out.');
      return;
    }
    if (this.hasCheckedOut) {
      this.toast.warning('Already Checked Out', 'You have already checked out today.');
      return;
    }
    this.isCheckingOut = true;
    this.gpsError = null;
    this.cdr.markForCheck();
    try {
      const pos = await this.getPosition();
      this.checkinService.checkOut({ latitude: pos.latitude, longitude: pos.longitude })
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (record) => {
            this.todayRecord = record;
            this.isCheckingOut = false;
            this.toast.success('Checked Out', 'Have a nice evening!');
            this.loadMonthlyData();
            this.cdr.markForCheck();
          },
          error: (err) => {
            this.isCheckingOut = false;
            const msg = teacherAttendanceErrorMessage(err, 'Check-out failed. Please try again.');
            this.toast.error('Check-out Failed', msg);
            this.cdr.markForCheck();
          }
        });
    } catch (err: any) {
      this.isCheckingOut = false;
      this.gpsError = this.getGpsErrorMessage(err);
      this.toast.error('Location Error', this.gpsError);
      this.cdr.markForCheck();
    }
  }

  private async getPosition(): Promise<{ latitude: number; longitude: number }> {
    if (Capacitor.isNativePlatform()) {
      await this.ensureNativeLocationPermission();
      const fix = await this.getReliableNativePosition();
      this.logger.log(`Attendance location acquired with ${Math.round(fix.accuracy)}m accuracy.`);
      return { latitude: fix.latitude, longitude: fix.longitude };
    }
    return this.getBrowserPosition();
  }

  private async ensureNativeLocationPermission(): Promise<void> {
    try {
      let permission = await Geolocation.checkPermissions();
      if (permission.location !== 'granted') {
        permission = await Geolocation.requestPermissions({ permissions: ['location'] });
      }
      if (permission.location !== 'granted') {
        throw new AttendanceLocationError(
          'Precise location permission is required. Open Settings > Apps > Edunexify > Permissions > Location, then choose Allow only while using the app and enable precise location.',
          'PERMISSION'
        );
      }
    } catch (error: any) {
      if (error instanceof AttendanceLocationError) throw error;
      throw this.mapNativeLocationError(error);
    }
  }

  /**
   * Watches briefly for GPS updates instead of trusting the first network-derived fix.
   * A good fix returns immediately; otherwise the most accurate fresh reading is used only
   * when it is accurate enough for the school's attendance geofence.
   */
  private getReliableNativePosition(): Promise<LocationFix> {
    return new Promise((resolve, reject) => {
      let watchId: string | undefined;
      let bestFix: LocationFix | null = null;
      let completed = false;

      const clearNativeWatch = (): void => {
        if (watchId) {
          void Geolocation.clearWatch({ id: watchId }).catch(error =>
            this.logger.error('Failed to clear attendance location watch', error)
          );
        }
      };

      const finish = (fix?: LocationFix, error?: AttendanceLocationError): void => {
        if (completed) return;
        completed = true;
        window.clearTimeout(timer);
        clearNativeWatch();
        if (fix) resolve(fix);
        else reject(error ?? new AttendanceLocationError('Location is currently unavailable.', 'UNAVAILABLE'));
      };

      const timer = window.setTimeout(() => {
        if (bestFix && bestFix.accuracy <= this.maximumAccuracyMetres) {
          finish(bestFix);
          return;
        }
        if (bestFix) {
          finish(undefined, new AttendanceLocationError(
            `GPS accuracy is currently about ${Math.round(bestFix.accuracy)} metres. Move near a window or open area, keep GPS, Wi-Fi and mobile data on, then try again.`,
            'INACCURATE'
          ));
          return;
        }
        finish(undefined, new AttendanceLocationError(
          'The phone could not obtain a GPS location in time. Keep GPS, Wi-Fi and mobile data on, move near a window or open area, then try again.',
          'TIMEOUT'
        ));
      }, this.locationSamplingTimeoutMs);

      Geolocation.watchPosition(
        {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: this.locationSamplingTimeoutMs,
          minimumUpdateInterval: 1000,
          interval: 1000,
          enableLocationFallback: true,
        },
        (position, error) => {
          if (completed) return;
          if (error) {
            if (String(error?.code ?? '') === 'OS-PLUG-GLOC-0010'
                && bestFix && bestFix.accuracy <= this.maximumAccuracyMetres) {
              finish(bestFix);
              return;
            }
            finish(undefined, this.mapNativeLocationError(error));
            return;
          }
          if (!position) return;

          const fix = this.toLocationFix(position);
          const age = Date.now() - fix.timestamp;
          if (!Number.isFinite(fix.accuracy) || fix.accuracy <= 0 || age > this.maximumLocationAgeMs) return;

          if (!bestFix || fix.accuracy < bestFix.accuracy) bestFix = fix;
          if (fix.accuracy <= this.preferredAccuracyMetres) finish(fix);
        }
      ).then(id => {
        watchId = id;
        if (completed) clearNativeWatch();
      }).catch(error => finish(undefined, this.mapNativeLocationError(error)));
    });
  }

  private toLocationFix(position: Position): LocationFix {
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      timestamp: position.timestamp,
    };
  }

  private getBrowserPosition(): Promise<{ latitude: number; longitude: number }> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported on this device.'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        // Preserve the browser's numeric error code so the outer handler can provide
        // browser-appropriate permission, unavailable, or timeout guidance.
        (err) => reject(err),
        { enableHighAccuracy: true, timeout: 15000 }
      );
    });
  }

  private getGpsErrorMessage(err: GeolocationPositionError | any): string {
    if (err instanceof AttendanceLocationError) return err.message;
    if (err?.code === 1) return 'Location access is blocked for Edunexify. Allow Location for this site in your browser\'s site permissions, then try again.';
    if (err?.code === 2) return 'Location unavailable. Please check your GPS/network connection.';
    if (err?.code === 3) return 'Location request timed out. Please try again.';
    return 'Could not retrieve location. Please try again.';
  }

  private mapNativeLocationError(error: any): AttendanceLocationError {
    const code = String(error?.code ?? '');
    const message = String(error?.message ?? '').toLowerCase();

    if (code === 'OS-PLUG-GLOC-0007' || code === 'OS-PLUG-GLOC-0009'
        || code === 'OS-PLUG-GLOC-0017' || message.includes('not enabled') || message.includes('turned off')) {
      return new AttendanceLocationError(
        'Location services are turned off. Enable GPS/Location on the phone, keep Wi-Fi or mobile data on, then try again.',
        'DISABLED'
      );
    }
    if (code === 'OS-PLUG-GLOC-0003' || message.includes('permission')) {
      return new AttendanceLocationError(
        'Precise location permission is required. Open Settings > Apps > Edunexify > Permissions > Location, then choose Allow only while using the app and enable precise location.',
        'PERMISSION'
      );
    }
    if (code === 'OS-PLUG-GLOC-0010' || message.includes('timeout') || message.includes('in time')) {
      return new AttendanceLocationError(
        'The phone could not obtain a GPS location in time. Move near a window or open area and try again.',
        'TIMEOUT'
      );
    }
    return new AttendanceLocationError(
      'Location is unavailable. Check GPS, Wi-Fi/mobile data and Google Location Accuracy, then try again.',
      'UNAVAILABLE'
    );
  }

  goToPreviousMonth(): void {
    if (this.selectedMonth === 1) {
      this.selectedMonth = 12;
      this.selectedYear--;
    } else {
      this.selectedMonth--;
    }
    this.loadMonthlyData();
  }

  goToNextMonth(): void {
    const now = new Date();
    if (this.selectedYear === now.getFullYear() && this.selectedMonth === now.getMonth() + 1) return;
    if (this.selectedMonth === 12) {
      this.selectedMonth = 1;
      this.selectedYear++;
    } else {
      this.selectedMonth++;
    }
    this.loadMonthlyData();
  }

  formatCheckInTime(isoTime: string | null): string {
    return formatTeacherAttendanceTime(isoTime);
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'ON_TIME': return 'status-ontime';
      case 'LATE': return 'status-late';
      case 'ABSENT': return 'status-absent';
      case 'ON_LEAVE': return 'status-leave';
      case 'HALF_DAY': return 'status-halfday';
      case 'NOT_TRACKED': return 'status-not-tracked';
      default: return '';
    }
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'ON_TIME': return 'On Time';
      case 'LATE': return 'Late';
      case 'ABSENT': return 'Absent';
      case 'ON_LEAVE': return 'On Leave';
      case 'HALF_DAY': return 'Half Day';
      case 'NOT_TRACKED': return 'Not Tracked';
      default: return status;
    }
  }

  getAttendanceMethodLabel(method: string | null | undefined): string {
    switch ((method ?? '').toUpperCase()) {
      case 'MANUAL_ADMIN': return 'Marked by Admin';
      case 'GPS':
      case 'GEOLOCATION': return 'Location Check-in';
      case 'MANUAL': return 'Marked Manually';
      case 'SYSTEM':
      case 'AUTO':
      case 'AUTOMATIC': return 'Automatic';
      default:
        return (method ?? 'Recorded')
          .toLowerCase()
          .split(/[_-]+/)
          .filter(Boolean)
          .map(part => part.charAt(0).toUpperCase() + part.slice(1))
          .join(' ');
    }
  }

  getCellClass(day: CalendarDay): string {
    if (!day.date) return 'cal-empty';
    if (!day.status) return 'cal-nodata';
    return 'cal-' + day.status.toLowerCase().replace('_', '');
  }

  isToday(day: CalendarDay): boolean {
    if (!day.fullDate) return false;
    return day.fullDate === localDateKey(new Date());
  }

  retryAttendanceLoad(): void {
    this.loadCurrentMonth();
  }

  private loadCurrentMonth(): void {
    const now = new Date();
    this.selectedMonth = now.getMonth() + 1;
    this.selectedYear = now.getFullYear();
    this.loadMonthlyData();
  }

  private isAlreadyCheckedInError(error: any, message: string): boolean {
    return error?.status === 409 || /already checked in/i.test(message);
  }
}
