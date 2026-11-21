import { studentStatusLabel, studentStatusTone } from '../../utils/student-status.util';
import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, takeUntil, debounceTime, distinctUntilChanged, switchMap, of } from 'rxjs';
import { StudentService } from '../../services/student.service';
import { Student } from '../../interfaces/student';

@Component({
  selector: 'app-student-search',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './student-search.component.html',
  styleUrl: './student-search.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StudentSearchComponent implements OnInit, OnDestroy {

  query = '';
  results: Student[] = [];
  isLoading = false;
  hasSearched = false;
  error: string | null = null;

  private search$ = new Subject<string>();
  private destroy$ = new Subject<void>();

  constructor(
    private studentService: StudentService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.search$.pipe(
      debounceTime(350),
      distinctUntilChanged(),
      switchMap(q => {
        if (q.trim().length < 2) {
          this.results = [];
          this.hasSearched = false;
          this.isLoading = false;
          this.cdr.markForCheck();
          return of([]);
        }
        this.isLoading = true;
        this.error = null;
        this.cdr.markForCheck();
        return this.studentService.searchStudents(q.trim());
      }),
      takeUntil(this.destroy$)
    ).subscribe({
      next: results => {
        this.results = results;
        this.isLoading = false;
        this.hasSearched = this.query.trim().length >= 2;
        this.cdr.markForCheck();
      },
      error: () => {
        this.error = 'Search failed. Please try again.';
        this.isLoading = false;
        this.cdr.markForCheck();
      }
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onQueryChange() {
    this.search$.next(this.query);
  }

  clearSearch() {
    this.query = '';
    this.results = [];
    this.hasSearched = false;
    this.error = null;
    this.cdr.markForCheck();
  }

  viewStudent(studentId: string) {
    this.router.navigate(['/dashboard/student-details', studentId]);
  }

  getStatusClass(status: string | undefined): string { return 'ss-status-' + studentStatusTone(status); }

  getStatusLabel(status: string | undefined): string { return studentStatusLabel(status); }

  getInitial(name: string): string {
    return name ? name.charAt(0).toUpperCase() : '?';
  }

  trackByStudentId(_: number, s: Student): string { return s.studentId; }
}
