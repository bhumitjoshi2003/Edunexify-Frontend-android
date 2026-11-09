import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { RegisterStudentComponent } from '../register-student/register-student.component';
import { RegisterTeacherComponent } from '../register-teacher/register-teacher.component';
import { RegistrationTab, registrationTabFromQuery } from '../../utils/registration.util';

/** Shared by the web and Android clients — keep the TypeScript identical (templates/styles per platform). */
@Component({
  selector: 'app-register',
  imports: [CommonModule, RegisterStudentComponent, RegisterTeacherComponent],
  templateUrl: './register.component.html',
  styleUrl: './register.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RegisterComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  showStudentForm = true;

  constructor(private route: ActivatedRoute, private cdr: ChangeDetectorRef) { }

  ngOnInit(): void {
    // Deep link straight to the teacher form, e.g. School Setup's "Add teachers" (?type=teacher).
    this.route.queryParamMap.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      this.toggleForm(registrationTabFromQuery(params.get('type')));
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  toggleForm(type: RegistrationTab): void {
    this.showStudentForm = type === 'student';
  }
}
