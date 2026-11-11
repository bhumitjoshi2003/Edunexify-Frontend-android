import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { Subject, catchError, forkJoin, of, takeUntil } from 'rxjs';
import { AuthStateService } from '../../auth/auth-state.service';
import { TeacherCheckinService } from '../../services/teacher-checkin.service';
import { TeacherLeaveService } from '../../services/teacher-leave.service';
import { TimetableService } from '../../services/timetable.service';
import { TeacherSubstitutionService } from '../../services/teacher-substitution.service';
import { TeacherAttendanceRecord } from '../../interfaces/teacher-checkin';
import { TeacherLeave } from '../../interfaces/teacher-leave';
import { TimetableEntry } from '../../interfaces/timetable';
import { buildTodayClassesView, todayDayCode, TeacherTodayClassEntry } from '../../utils/teacher-timetable-today.util';
import { schoolDateKey } from '../../utils/school-date.util';

/**
 * "My teaching" inside the Coordinator's single dashboard: the teaching-day essentials of the same
 * account — today's check-in, today's classes and cover periods, and personal leave — with links to
 * the teaching tools. It is a panel of the Coordinator dashboard, not a second dashboard; each part
 * loads independently so a failure only affects its own row.
 */
@Component({
  selector: 'app-coordinator-my-teaching',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule],
  templateUrl: './coordinator-my-teaching.component.html',
  // The Principal dashboard's stylesheet supplies the shared panel, skeleton and link-grid styles.
  styleUrls: ['../principal-dashboard/principal-dashboard.component.css', './coordinator-my-teaching.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CoordinatorMyTeachingComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  /** Class teacher of (from the Coordinator overview), shown as a quick link. */
  @Input() classTeacherOf: string | null = null;
  @Input() classroomEnabled = false;
  @Input() marksEnabled = false;

  checkin: { loading: boolean; failed: boolean; record: TeacherAttendanceRecord | null } = { loading: true, failed: false, record: null };
  classes: { loading: boolean; failed: boolean; current: TeacherTodayClassEntry | null; upcoming: TeacherTodayClassEntry[]; any: boolean; done: boolean } =
    { loading: true, failed: false, current: null, upcoming: [], any: false, done: false };
  leave: { loading: boolean; failed: boolean; pending: number } = { loading: true, failed: false, pending: 0 };

  constructor(
    private authState: AuthStateService,
    private checkins: TeacherCheckinService,
    private leaves: TeacherLeaveService,
    private timetable: TimetableService,
    private substitutions: TeacherSubstitutionService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void { this.load(); }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(): void {
    const now = new Date();
    const todayKey = schoolDateKey(now);
    const teacherId = this.authState.getUserId();

    this.checkin = { loading: true, failed: false, record: null };
    this.checkins.getMyAttendance(now.getMonth() + 1, now.getFullYear()).pipe(takeUntil(this.destroy$)).subscribe({
      next: summary => {
        this.checkin = { loading: false, failed: false, record: summary.records.find(r => r.date === todayKey) ?? null };
        this.cdr.markForCheck();
      },
      error: () => { this.checkin = { loading: false, failed: true, record: null }; this.cdr.markForCheck(); }
    });

    this.classes = { ...this.classes, loading: true, failed: false };
    forkJoin({
      timetable: this.timetable.getTeacherTimetable(teacherId),
      // Cover periods are an extra: their failure never hides the regular timetable.
      cover: this.substitutions.getMine(todayKey).pipe(catchError(() => of([])))
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: ({ timetable, cover }) => {
        const coverEntries: TimetableEntry[] = cover.map(item => ({
          id: -item.id, className: item.className, sectionName: item.sectionName, day: todayDayCode(now),
          periodNumber: item.periodNumber, startTime: item.startTime, endTime: item.endTime, subjectName: item.subjectName,
          teacherId, teacherName: item.substituteTeacherName, isSubstitution: true,
          originalTeacherName: item.originalTeacherName, substitutionNote: item.note ?? null, timetableEntryId: item.timetableEntryId
        } as TimetableEntry));
        const view = buildTodayClassesView([...timetable, ...coverEntries], now);
        this.classes = { loading: false, failed: false, current: view.current, upcoming: view.upcoming, any: view.hasAnyToday, done: view.allDone };
        this.cdr.markForCheck();
      },
      error: () => { this.classes = { ...this.classes, loading: false, failed: true }; this.cdr.markForCheck(); }
    });

    this.leave = { loading: true, failed: false, pending: 0 };
    this.leaves.getMyLeaves(0, 20).pipe(takeUntil(this.destroy$)).subscribe({
      next: page => {
        this.leave = { loading: false, failed: false, pending: page.content.filter((l: TeacherLeave) => l.status === 'PENDING').length };
        this.cdr.markForCheck();
      },
      error: () => { this.leave = { loading: false, failed: true, pending: 0 }; this.cdr.markForCheck(); }
    });
  }

  get checkedIn(): boolean { return !!this.checkin.record?.checkInTime; }

  get checkinLabel(): string {
    const r = this.checkin.record;
    if (!r) return 'Not checked in yet';
    if (r.status === 'ON_LEAVE') return 'On approved leave';
    if (r.status === 'ABSENT') return 'Marked absent';
    return r.status === 'LATE' ? 'Checked in · late' : 'Checked in';
  }

  classLabel(c: TeacherTodayClassEntry): string {
    return `Class ${c.className}${c.sectionName ? '-' + c.sectionName : ''}`;
  }

  trackByKey(_: number, c: TeacherTodayClassEntry): string { return c.key; }
}
