import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Inject, OnDestroy, OnInit, PLATFORM_ID } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { interval, Subject, takeUntil } from 'rxjs';
import { ClassUpdate, classUpdateContextLabel } from '../../interfaces/class-update';
import { formatFileSize, homeworkClassLabel } from '../../interfaces/homework';
import { ClassUpdateService } from '../../services/class-update.service';
import { LoggerService } from '../../services/logger.service';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthStateService } from '../../auth/auth-state.service';
import { ChildAccess } from '../../interfaces/parent-portal';
import { ParentChildContextComponent } from '../parent-child-context/parent-child-context.component';

const DAY_MS = 24 * 60 * 60 * 1000;

@Component({
  selector: 'app-student-class-updates',
  standalone: true,
  imports: [CommonModule, MatIconModule, ParentChildContextComponent],
  templateUrl: './student-class-updates.component.html',
  styleUrl: './student-class-updates.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudentClassUpdatesComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  readonly contextLabel = classUpdateContextLabel;
  readonly classLabel = homeworkClassLabel;
  readonly fileSize = formatFileSize;
  readonly skeletons = [0, 1, 2];

  items: ClassUpdate[] = [];
  loading = true;
  failed = false;
  /** Selected subject filter; null = all subjects. */
  subject: string | null = null;
  /** A parent reads the same view for the linked child named in ?studentId= (the backend
   *  checks the link); the shared child switcher changes it. Nothing here can create or edit. */
  readonly isParent: boolean;
  studentId: string | null = null;
  /** The backend refused this child for this parent (unlinked, ended or revoked link): the
   *  switcher explains it and offers the linked children, so the page body stays hidden. */
  denied = false;
  /** Refreshed every minute so relative times and expiry countdowns stay live. */
  now = Date.now();
  private readonly expanded = new Set<number>();

  constructor(
    private classUpdates: ClassUpdateService,
    private logger: LoggerService,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: object,
    private route: ActivatedRoute,
    private router: Router,
    authState: AuthStateService,
  ) {
    this.isParent = authState.getUserRole() === 'PARENT';
  }

  ngOnInit(): void {
    if (this.isParent) {
      this.route.queryParamMap.pipe(takeUntil(this.destroy$)).subscribe(q => {
        this.studentId = q.get('studentId');
        this.denied = false;
        this.items = [];
        this.subject = null;
        if (this.studentId) this.load();
        else { this.loading = false; this.cdr.markForCheck(); }
      });
    } else {
      this.load();
    }
    if (isPlatformBrowser(this.platformId)) {
      interval(60_000).pipe(takeUntil(this.destroy$)).subscribe(() => {
        this.now = Date.now();
        this.cdr.markForCheck();
      });
    }
  }

  load(): void {
    this.loading = true;
    this.failed = false;
    this.cdr.markForCheck();
    this.classUpdates.studentActive(undefined, this.studentId).pipe(takeUntil(this.destroy$)).subscribe({
      next: items => {
        this.items = items;
        if (this.subject && !this.subjects.includes(this.subject)) this.subject = null;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: error => {
        this.logger.error('Class updates load failed:', error);
        if (this.isParent && error?.status === 403) this.denied = true;
        this.loading = false;
        this.failed = true;
        this.cdr.markForCheck();
      },
    });
  }

  // ─── Filtering ─────────────────────────────────────────────────────

  /** Distinct subjects present, in first-seen (newest) order; class-wide updates have none. */
  get subjects(): string[] {
    const seen: string[] = [];
    for (const item of this.items) {
      if (item.subjectName && !seen.includes(item.subjectName)) seen.push(item.subjectName);
    }
    return seen;
  }

  get visible(): ClassUpdate[] {
    return this.subject ? this.items.filter(i => i.subjectName === this.subject) : this.items;
  }

  get newCount(): number {
    return this.items.filter(i => this.isNew(i)).length;
  }

  selectSubject(subject: string | null): void {
    this.subject = subject;
  }

  // ─── Presentation ──────────────────────────────────────────────────

  /** Posted within the last 24 hours. */
  isNew(item: ClassUpdate): boolean {
    return this.now - new Date(item.createdAt).getTime() < DAY_MS;
  }

  /** One of six colour themes, stable per subject (or class). */
  tone(item: Pick<ClassUpdate, 'subjectName' | 'className'>): number {
    const key = (item.subjectName || item.className || '').toLowerCase();
    let hash = 0;
    for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
    return Math.abs(hash) % 6;
  }

  initials(item: Pick<ClassUpdate, 'subjectName' | 'className'>): string {
    if (!item.subjectName) return item.className.slice(0, 3);
    const words = item.subjectName.trim().split(/\s+/);
    return (words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2)).toUpperCase();
  }

  teacherInitial(item: ClassUpdate): string {
    return (item.teacherName || item.teacherId || '?').trim().charAt(0).toUpperCase();
  }

  /** "Just now", "12m ago", "3h ago", "Yesterday", "4d ago", then the date. */
  relative(iso: string): string {
    const minutes = Math.floor((this.now - new Date(iso).getTime()) / 60_000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }

  /** "Ends in 45m" / "Ends in 5h" / "Ends in 2d". */
  endsIn(item: ClassUpdate): string {
    const minutes = Math.max(1, Math.ceil((Date.parse(item.expiresAt!) - this.now) / 60_000));
    if (minutes < 60) return `Ends in ${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `Ends in ${hours}h`;
    return `Ends in ${Math.floor(hours / 24)}d`;
  }

  /** Share of the update's lifetime still remaining, 0–100 (for the countdown bar). */
  lifeLeft(item: ClassUpdate): number {
    const start = new Date(item.createdAt).getTime();
    const end = Date.parse(item.expiresAt!);
    if (!(end > start)) return 0;
    return Math.min(100, Math.max(3, ((end - this.now) / (end - start)) * 100));
  }

  isLong(item: ClassUpdate): boolean {
    return item.message.length > 220 || item.message.split('\n').length > 4;
  }

  isExpanded(item: ClassUpdate): boolean {
    return this.expanded.has(item.id);
  }

  toggleExpanded(item: ClassUpdate): void {
    if (this.expanded.has(item.id)) this.expanded.delete(item.id);
    else this.expanded.add(item.id);
  }

  trackById(_: number, item: ClassUpdate): number {
    return item.id;
  }

  onChildSelected(child: ChildAccess): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: { studentId: child.studentId }, replaceUrl: true });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
