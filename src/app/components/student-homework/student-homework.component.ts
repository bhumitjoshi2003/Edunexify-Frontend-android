import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Inject, OnDestroy, OnInit, PLATFORM_ID } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { interval, Observable, Subject, takeUntil } from 'rxjs';
import { HomeworkClasswork, dueLabel, formatFileSize, homeworkClassLabel, homeworkKind } from '../../interfaces/homework';
import { HomeworkService } from '../../services/homework.service';
import { LoggerService } from '../../services/logger.service';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthStateService } from '../../auth/auth-state.service';
import { ChildAccess } from '../../interfaces/parent-portal';
import { ParentChildContextComponent } from '../parent-child-context/parent-child-context.component';

export type StudentHomeworkTab = 'today' | 'upcoming' | 'recent';

interface TabState {
  loaded: boolean;
  loading: boolean;
  failed: boolean;
  items: HomeworkClasswork[];
}

@Component({
  selector: 'app-student-homework',
  standalone: true,
  imports: [CommonModule, MatIconModule, ParentChildContextComponent],
  templateUrl: './student-homework.component.html',
  styleUrl: './student-homework.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudentHomeworkComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  readonly kind = homeworkKind;
  readonly due = dueLabel;
  readonly fileSize = formatFileSize;
  readonly classLabel = homeworkClassLabel;
  readonly tabs: { key: StudentHomeworkTab; label: string; icon: string }[] = [
    { key: 'today', label: 'Today', icon: 'today' },
    { key: 'upcoming', label: 'Due soon', icon: 'alarm' },
    { key: 'recent', label: 'Recent', icon: 'history' },
  ];
  readonly skeletons = [0, 1, 2];
  /** Refreshed every minute so relative times stay live. */
  now = Date.now();
  /** A parent reads the same view for the linked child named in ?studentId= (the backend
   *  checks the link); the shared child switcher changes it. Nothing here can create or edit. */
  readonly isParent: boolean;
  studentId: string | null = null;
  /** The backend refused this child for this parent (unlinked, ended or revoked link): the
   *  switcher explains it and offers the linked children, so the page body stays hidden. */
  denied = false;

  active: StudentHomeworkTab = 'today';
  state: Record<StudentHomeworkTab, TabState> = {
    today: { loaded: false, loading: false, failed: false, items: [] },
    upcoming: { loaded: false, loading: false, failed: false, items: [] },
    recent: { loaded: false, loading: false, failed: false, items: [] },
  };

  constructor(
    private homework: HomeworkService,
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
        for (const tab of this.tabs) this.state[tab.key] = { loaded: false, loading: false, failed: false, items: [] };
        if (this.studentId) this.select(this.active);
        this.cdr.markForCheck();
      });
    } else {
      this.select('today');
    }
    if (isPlatformBrowser(this.platformId)) {
      interval(60_000).pipe(takeUntil(this.destroy$)).subscribe(() => {
        this.now = Date.now();
        this.cdr.markForCheck();
      });
    }
  }

  get tabIndex(): number {
    return this.tabs.findIndex(t => t.key === this.active);
  }

  /** One of six colour themes, stable per subject. */
  tone(subject: string | null | undefined): number {
    const key = (subject || '').toLowerCase();
    let hash = 0;
    for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
    return Math.abs(hash) % 6;
  }

  initials(subject: string | null | undefined): string {
    const words = (subject || '?').trim().split(/\s+/);
    return (words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2)).toUpperCase();
  }

  teacherInitial(item: HomeworkClasswork): string {
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

  /** Colour of a due label: overdue, due today/tomorrow, or later. */
  dueTone(dueDate: string | null): 'overdue' | 'soon' | 'later' {
    const label = this.due(dueDate) ?? '';
    if (label.startsWith('Was due')) return 'overdue';
    return label === 'Due today' || label === 'Due tomorrow' ? 'soon' : 'later';
  }

  select(tab: StudentHomeworkTab): void {
    this.active = tab;
    if (!this.state[tab].loaded && !this.state[tab].loading) this.load(tab);
  }

  load(tab: StudentHomeworkTab): void {
    const s = this.state[tab];
    s.loading = true;
    s.failed = false;
    this.cdr.markForCheck();
    this.source(tab).pipe(takeUntil(this.destroy$)).subscribe({
      next: items => {
        s.items = items;
        s.loaded = true;
        s.loading = false;
        this.cdr.markForCheck();
      },
      error: error => {
        this.logger.error(`Homework (${tab}) load failed:`, error);
        if (this.isParent && error?.status === 403) this.denied = true;
        s.loading = false;
        s.failed = true;
        this.cdr.markForCheck();
      },
    });
  }

  private source(tab: StudentHomeworkTab): Observable<HomeworkClasswork[]> {
    if (tab === 'upcoming') return this.homework.studentUpcoming(this.studentId);
    if (tab === 'recent') return this.homework.studentRecent(this.studentId);
    return this.homework.studentOn(undefined, this.studentId);
  }

  onChildSelected(child: ChildAccess): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: { studentId: child.studentId }, replaceUrl: true });
  }

  emptyText(tab: StudentHomeworkTab): string {
    if (tab === 'upcoming') return 'No homework is due soon.';
    if (tab === 'recent') return 'No earlier homework or classwork yet.';
    return 'Nothing posted for today yet.';
  }

  trackById(_: number, item: HomeworkClasswork): number {
    return item.id;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
