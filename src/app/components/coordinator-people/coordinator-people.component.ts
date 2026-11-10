import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { Subject, takeUntil } from 'rxjs';
import { CoordinatorService } from '../../services/coordinator.service';
import { CoordinatorStudent, CoordinatorTeacher, CoordinatorUnit, coordinatorUnitLabel } from '../../interfaces/coordinator';
import { apiMessage } from '../academic-session-selector/academic-session-selector.component';

/** Students and teachers in the Coordinator's scope (read-only directory with links to details). */
@Component({
  selector: 'app-coordinator-people',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MatIconModule],
  templateUrl: './coordinator-people.component.html',
  styleUrl: './coordinator-people.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CoordinatorPeopleComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  tab: 'students' | 'teachers' = 'students';
  units: CoordinatorUnit[] = [];
  unitKey = '';
  students: CoordinatorStudent[] = [];
  teachers: CoordinatorTeacher[] = [];
  search = '';
  loading = true;
  error: string | null = null;

  readonly unitLabel = coordinatorUnitLabel;

  constructor(private coordinators: CoordinatorService, private route: ActivatedRoute, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    if (this.route.snapshot.queryParamMap.get('tab') === 'teachers') this.tab = 'teachers';
    this.coordinators.units().pipe(takeUntil(this.destroy$)).subscribe({
      next: units => { this.units = units; this.cdr.markForCheck(); },
      error: () => {}
    });
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  key(u: CoordinatorUnit): string { return `${u.classId}:${u.sectionId ?? ''}`; }

  load(): void {
    this.loading = true;
    this.error = null;
    const unit = this.units.find(u => this.key(u) === this.unitKey) ?? null;
    const done = () => { this.loading = false; this.cdr.markForCheck(); };
    const fail = (err: unknown) => { this.error = apiMessage(err); done(); };
    if (this.tab === 'students') {
      this.coordinators.students(unit?.classId ?? null, unit?.sectionId ?? null).pipe(takeUntil(this.destroy$))
        .subscribe({ next: s => { this.students = s; done(); }, error: fail });
    } else {
      this.coordinators.teachers().pipe(takeUntil(this.destroy$))
        .subscribe({ next: t => { this.teachers = t; done(); }, error: fail });
    }
  }

  setTab(tab: 'students' | 'teachers'): void {
    if (this.tab === tab) return;
    this.tab = tab;
    this.search = '';
    this.load();
  }

  private matches(...values: (string | null | undefined)[]): boolean {
    const q = this.search.trim().toLowerCase();
    return !q || values.some(v => (v ?? '').toLowerCase().includes(q));
  }

  get visibleStudents(): CoordinatorStudent[] {
    return this.students.filter(s => this.matches(s.name, s.studentId));
  }

  get visibleTeachers(): CoordinatorTeacher[] {
    return this.teachers.filter(t => this.matches(t.name, t.teacherId, t.subjects.join(' ')));
  }
}
