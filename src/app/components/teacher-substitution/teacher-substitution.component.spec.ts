import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { TeacherSubstitutionComponent } from './teacher-substitution.component';
import { TeacherSubstitutionService } from '../../services/teacher-substitution.service';
import { AuthStateService } from '../../auth/auth-state.service';
import { LoggerService } from '../../services/logger.service';
import { ToastService } from '../../services/toast.service';
import { SubstitutionDayOverview, UncoveredPeriod } from '../../interfaces/teacher-substitution';

describe('TeacherSubstitutionComponent', () => {
  let fixture: ComponentFixture<TeacherSubstitutionComponent>;
  let component: TeacherSubstitutionComponent;
  let substitutions: jasmine.SpyObj<TeacherSubstitutionService>;
  let authState: jasmine.SpyObj<AuthStateService>;
  let toast: jasmine.SpyObj<ToastService>;

  const period = (overrides: Partial<UncoveredPeriod> = {}): UncoveredPeriod => ({
    timetableEntryId: 100, originalTeacherId: 'T1', originalTeacherName: 'Mr Original',
    className: 'X', sectionName: 'A', subjectName: 'Maths', periodNumber: 3,
    startTime: '09:10', endTime: '09:50', assignment: null,
    freeTeachers: [{ teacherId: 'T2', name: 'Ms Free' }],
    ...overrides,
  });

  const day = (periods: UncoveredPeriod[], extra: Partial<SubstitutionDayOverview> = {}): SubstitutionDayOverview => ({
    date: '2026-10-06', closedReason: null, periods, workload: [],
    needingSubstitute: 0, covered: 0, noLongerNeeded: 0, ...extra,
  });

  function configure(role: 'ADMIN' | 'SUB_ADMIN', opts: { hasTimetableEdit?: boolean } = {}): void {
    substitutions = jasmine.createSpyObj('TeacherSubstitutionService',
      ['getUncovered', 'getOverview', 'getFreeTeachers', 'assign', 'change', 'cancel', 'getMine', 'suggestFill', 'assignMany']);
    substitutions.getOverview.and.returnValue(of(day([period()])));

    authState = jasmine.createSpyObj('AuthStateService', ['getUser', 'hasPermission']);
    authState.getUser.and.returnValue({ role } as any);
    authState.hasPermission.and.returnValue(!!opts.hasTimetableEdit);

    toast = jasmine.createSpyObj('ToastService', ['success', 'error', 'warning', 'confirm']);
    toast.confirm.and.resolveTo(true);

    TestBed.configureTestingModule({
      imports: [TeacherSubstitutionComponent],
      providers: [
        provideRouter([]),
        { provide: TeacherSubstitutionService, useValue: substitutions },
        { provide: AuthStateService, useValue: authState },
        { provide: LoggerService, useValue: jasmine.createSpyObj('LoggerService', ['error']) },
        { provide: ToastService, useValue: toast },
      ],
    });
    fixture = TestBed.createComponent(TeacherSubstitutionComponent);
    component = fixture.componentInstance;
  }

  it('loads uncovered periods with their eligible free teachers on init', () => {
    configure('ADMIN');
    fixture.detectChanges();

    expect(substitutions.getOverview).toHaveBeenCalled();
    expect(component.periods.length).toBe(1);
    expect(component.periods[0].freeTeachers[0].name).toBe('Ms Free');
  });

  it('shows an isolated fallback with Retry when uncovered periods fail to load', () => {
    configure('ADMIN');
    substitutions.getOverview.and.returnValue(throwError(() => new Error('offline')));
    fixture.detectChanges();

    expect(component.failed).toBeTrue();
    expect(component.loading).toBeFalse();
    expect(fixture.nativeElement.textContent).toContain('temporarily unavailable');
  });

  it('shows a truthful empty state when there are no uncovered periods', () => {
    configure('ADMIN');
    substitutions.getOverview.and.returnValue(of(day([])));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('No uncovered periods for this date.');
  });

  it('ADMIN can assign a free teacher to an uncovered period', () => {
    configure('ADMIN');
    fixture.detectChanges();
    substitutions.assign.and.returnValue(of({} as any));

    component.selections[100] = 'T2';
    component.save(component.periods[0]);

    expect(substitutions.assign).toHaveBeenCalledWith(100, component.selectedDate, 'T2', null);
    expect(toast.success).toHaveBeenCalled();
  });

  it('permitted SUB_ADMIN (has TIMETABLE_EDIT) can manage substitutions', () => {
    configure('SUB_ADMIN', { hasTimetableEdit: true });
    fixture.detectChanges();

    expect(component.canManage).toBeTrue();
    expect(fixture.nativeElement.querySelector('.sub-assign select')).toBeTruthy();
  });

  it('unpermitted SUB_ADMIN (no TIMETABLE_EDIT) sees a view-only notice, not the assign controls', () => {
    configure('SUB_ADMIN', { hasTimetableEdit: false });
    fixture.detectChanges();

    expect(component.canManage).toBeFalse();
    expect(fixture.nativeElement.querySelector('.sub-assign')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('does not have permission');
  });

  it('changes the substitute for a period that already has one', () => {
    configure('ADMIN');
    substitutions.getOverview.and.returnValue(of(day([period({
      assignment: {
        id: 5, revision: 0, date: '2026-09-17', timetableEntryId: 100,
        originalTeacherId: 'T1', originalTeacherName: 'Mr Original',
        substituteTeacherId: 'T2', substituteTeacherName: 'Ms Free',
        className: 'X', sectionName: 'A', subjectName: 'Maths', periodNumber: 3,
        startTime: '09:10', endTime: '09:50', status: 'ACTIVE', assignedBy: 'A1',
        assignedAt: '2026-09-17T08:00:00', updatedAt: '2026-09-17T08:00:00',
      },
    })])));
    fixture.detectChanges();
    substitutions.change.and.returnValue(of({} as any));

    component.selections[100] = 'T3';
    component.save(component.periods[0]);

    expect(substitutions.change).toHaveBeenCalledWith(5, 'T3', '');
    expect(substitutions.assign).not.toHaveBeenCalled();
  });

  it('cancels a substitute after user confirmation', fakeAsync(() => {
    configure('ADMIN');
    substitutions.getOverview.and.returnValue(of(day([period({
      assignment: {
        id: 5, revision: 0, date: '2026-09-17', timetableEntryId: 100,
        originalTeacherId: 'T1', originalTeacherName: 'Mr Original',
        substituteTeacherId: 'T2', substituteTeacherName: 'Ms Free',
        className: 'X', sectionName: 'A', subjectName: 'Maths', periodNumber: 3,
        startTime: '09:10', endTime: '09:50', status: 'ACTIVE', assignedBy: 'A1',
        assignedAt: '2026-09-17T08:00:00', updatedAt: '2026-09-17T08:00:00',
      },
    })])));
    fixture.detectChanges();
    substitutions.cancel.and.returnValue(of({} as any));

    component.remove(component.periods[0]);
    tick();

    expect(toast.confirm).toHaveBeenCalled();
    expect(substitutions.cancel).toHaveBeenCalledWith(5);
    expect(toast.success).toHaveBeenCalled();
  }));

  it('does not cancel when the user declines the confirmation', fakeAsync(() => {
    configure('ADMIN');
    substitutions.getOverview.and.returnValue(of(day([period({
      assignment: {
        id: 5, revision: 0, date: '2026-09-17', timetableEntryId: 100,
        originalTeacherId: 'T1', originalTeacherName: 'Mr Original',
        substituteTeacherId: 'T2', substituteTeacherName: 'Ms Free',
        className: 'X', sectionName: 'A', subjectName: 'Maths', periodNumber: 3,
        startTime: '09:10', endTime: '09:50', status: 'ACTIVE', assignedBy: 'A1',
        assignedAt: '2026-09-17T08:00:00', updatedAt: '2026-09-17T08:00:00',
      },
    })])));
    fixture.detectChanges();
    toast.confirm.and.resolveTo(false);

    component.remove(component.periods[0]);
    tick();

    expect(substitutions.cancel).not.toHaveBeenCalled();
  }));

  it('warns instead of saving when no free teacher is selected', () => {
    configure('ADMIN');
    fixture.detectChanges();

    component.selections[100] = '';
    component.save(component.periods[0]);

    expect(toast.warning).toHaveBeenCalled();
    expect(substitutions.assign).not.toHaveBeenCalled();
  });

  // ─── UI polish: status chip, "Absent teacher:", collapsed substitute view, summary ───

  const assignedPeriod = () => period({
    assignment: {
      id: 5, revision: 0, date: '2026-09-17', timetableEntryId: 100,
      originalTeacherId: 'T1', originalTeacherName: 'Mr Original',
      substituteTeacherId: 'T2', substituteTeacherName: 'Ms Free',
      className: 'X', sectionName: 'A', subjectName: 'Maths', periodNumber: 3,
      startTime: '09:10', endTime: '09:50', status: 'ACTIVE', assignedBy: 'A1',
      assignedAt: '2026-09-17T08:00:00', updatedAt: '2026-09-17T08:00:00',
    },
  });

  it('shows the unavailable teacher, why, and the leave dates', () => {
    configure('ADMIN');
    substitutions.getOverview.and.returnValue(of(day([period({
      unavailabilityReason: 'APPROVED_LEAVE', leaveStart: '2026-10-06', leaveEnd: '2026-10-08',
    })])));
    fixture.detectChanges();
    const text = fixture.nativeElement.querySelector('.sub-absent').textContent;
    expect(text).toContain('Mr Original');
    expect(text).toContain('Approved leave');
    expect(text).toContain('6 Oct');
    expect(text).toContain('8 Oct');
    expect(fixture.nativeElement.textContent).not.toContain('Replacing');
  });

  it('shows a "Needs substitute" chip for an unassigned period, and counts it in the summary', () => {
    configure('ADMIN');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.sub-chip')?.textContent).toContain('Needs substitute');
    expect(fixture.nativeElement.textContent).toContain('1 period needs a substitute');
  });

  it('shows a "Covered" chip and the substitute\'s name once assigned — with no summary attention needed', () => {
    configure('ADMIN');
    substitutions.getOverview.and.returnValue(of(day([assignedPeriod()])));
    fixture.detectChanges();

    const chip = fixture.nativeElement.querySelector('.sub-chip');
    expect(chip?.textContent).toContain('Covered');
    expect(fixture.nativeElement.textContent).toContain('Substitute: Ms Free');
    expect(fixture.nativeElement.textContent).toContain('All affected periods are covered.');
  });

  it('does not permanently show the teacher selector once a period is covered', () => {
    configure('ADMIN');
    substitutions.getOverview.and.returnValue(of(day([assignedPeriod()])));
    fixture.detectChanges();

    // The <select> stays in the DOM (hidden) rather than being destroyed/recreated —
    // see the "Change substitute" fix below — so visibility is asserted via [hidden],
    // not mere DOM presence.
    expect(fixture.nativeElement.querySelector('.sub-assign-changing').hidden).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain('Change substitute');
    expect(fixture.nativeElement.textContent).toContain('Remove');
  });

  it('reveals the selector and a confirm action only after "Change substitute" is clicked', () => {
    configure('ADMIN');
    substitutions.getOverview.and.returnValue(of(day([assignedPeriod()])));
    fixture.detectChanges();
    expect(component.changingEntryId).toBeNull();

    component.startChange(component.periods[0]);
    fixture.detectChanges();

    expect(component.changingEntryId).toBe(100);
    const changingBlock = fixture.nativeElement.querySelector('.sub-assign-changing');
    expect(changingBlock.hidden).toBeFalse();
    expect(changingBlock.querySelector('select')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('Confirm change');
  });

  it('the <select> element is never recreated across a "Change substitute" toggle — only its container\'s [hidden] state changes (this is what keeps a mobile browser from mispositioning its native options popup)', () => {
    configure('ADMIN');
    substitutions.getOverview.and.returnValue(of(day([assignedPeriod()])));
    fixture.detectChanges();
    const selectBeforeToggle = fixture.nativeElement.querySelector('.sub-assign-changing select');

    component.startChange(component.periods[0]);
    fixture.detectChanges();
    const selectAfterToggle = fixture.nativeElement.querySelector('.sub-assign-changing select');

    expect(selectBeforeToggle).toBe(selectAfterToggle);
  });

  it('cancelling the change collapses the selector back to the substitute name', () => {
    configure('ADMIN');
    substitutions.getOverview.and.returnValue(of(day([assignedPeriod()])));
    fixture.detectChanges();
    component.startChange(component.periods[0]);
    fixture.detectChanges();

    component.cancelChange(component.periods[0]);
    fixture.detectChanges();

    expect(component.changingEntryId).toBeNull();
    expect(fixture.nativeElement.querySelector('.sub-assign-changing').hidden).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain('Substitute: Ms Free');
  });

  it('collapses the change-selector back after a successful change', () => {
    configure('ADMIN');
    substitutions.getOverview.and.returnValue(of(day([assignedPeriod()])));
    substitutions.change.and.returnValue(of({} as any));
    fixture.detectChanges();
    component.startChange(component.periods[0]);
    component.selections[100] = 'T3';

    component.save(component.periods[0]);

    expect(component.changingEntryId).toBeNull();
  });

  // ─── Phase 2 ───

  it('ranked suggestion shows its context and "Assign suggested" assigns that teacher with the note', () => {
    configure('ADMIN');
    const suggested = { teacherId: 'T7', name: 'Priya Sharma', reasons: ['SAME_SUBJECT', 'KNOWS_CLASS', 'COVERING_1'] };
    substitutions.getOverview.and.returnValue(of(day([period({ suggested, freeTeachers: [suggested] })])));
    substitutions.assign.and.returnValue(of({} as any));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.sub-suggested').textContent)
      .toContain('Priya Sharma · Same subject · Knows class · Covering 1 today');
    component.notes[100] = '  Worksheet on desk ';
    component.assignSuggested(component.periods[0]);

    expect(substitutions.assign).toHaveBeenCalledWith(100, component.selectedDate, 'T7', 'Worksheet on desk');
  });

  it('a cover that is no longer needed shows who, what, and only a Remove action', fakeAsync(() => {
    configure('ADMIN');
    substitutions.getOverview.and.returnValue(of(day([{
      ...assignedPeriod(), state: 'NO_LONGER_NEEDED', freeTeachers: [],
      assignment: { ...assignedPeriod().assignment!, reasonSource: 'LEAVE', note: 'Chapter 4' },
    }], { noLongerNeeded: 1 })));
    substitutions.cancel.and.returnValue(of({} as any));
    fixture.detectChanges();

    const card = fixture.nativeElement.querySelector('.sub-card');
    expect(card.classList).toContain('is-stale');
    expect(card.textContent).toContain('No longer needed');
    expect(card.textContent).toContain('Mr Original is available again');
    expect(card.textContent).toContain('Substitute: Ms Free');
    expect(card.textContent).toContain('Class X · A');
    expect(card.textContent).toContain('P3');
    expect(card.textContent).toContain('Chapter 4');
    expect(card.textContent).not.toContain('Change substitute');
    expect(component.needsAttentionCount).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('1 no longer needed');

    component.remove(component.periods[0]);
    tick();
    expect(substitutions.cancel).toHaveBeenCalledWith(5);
  }));

  it('groups by period or by absent teacher', () => {
    configure('ADMIN');
    substitutions.getOverview.and.returnValue(of(day([
      period({ timetableEntryId: 1, periodNumber: 1, originalTeacherId: 'T1', originalTeacherName: 'Mr Original' }),
      period({ timetableEntryId: 2, periodNumber: 1, originalTeacherId: 'T9', originalTeacherName: 'Ms Away', unavailabilityReason: 'ABSENT' }),
      period({ timetableEntryId: 3, periodNumber: 2, originalTeacherId: 'T1', originalTeacherName: 'Mr Original' }),
    ])));
    fixture.detectChanges();
    expect(component.groups.map(g => g.label)).toEqual(['Period 1', 'Period 2']);

    component.setGrouping('teacher');
    fixture.detectChanges();
    expect(component.groups.map(g => g.label)).toEqual(['Mr Original', 'Ms Away']);
    expect(component.groups[0].periods.length).toBe(2);
    expect(component.groups[1].sublabel).toBe('Absent');
  });

  it('shows the cover workload strip', () => {
    configure('ADMIN');
    substitutions.getOverview.and.returnValue(of(day([assignedPeriod()], {
      workload: [{ teacherId: 'T2', teacherName: 'Ms Free', covers: 3 }],
    })));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.sub-workload').textContent).toContain('Ms Free — 3 covers');
  });

  it('a holiday / closed day shows why and offers no assignment controls', () => {
    configure('ADMIN');
    substitutions.getOverview.and.returnValue(of(day([], { closedReason: 'School holiday: Diwali' })));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('School holiday: Diwali');
    expect(component.canEdit).toBeFalse();
    expect(fixture.nativeElement.querySelector('.sub-fill-btn')).toBeNull();
  });

  it('a past date is read-only', () => {
    configure('ADMIN');
    fixture.detectChanges();
    component.selectedDate = '2020-01-06';
    component.onDateChange();
    fixture.detectChanges();
    expect(component.canEdit).toBeFalse();
    expect(fixture.nativeElement.textContent).toContain('This date has passed');
    expect(fixture.nativeElement.querySelector('.sub-assign select')).toBeNull();
  });

  it('Fill all: calculates a preview, saves only after confirmation, and reports conflicts and failures', () => {
    configure('ADMIN');
    substitutions.getOverview.and.returnValue(of(day([
      period({ timetableEntryId: 100 }), period({ timetableEntryId: 101, className: 'IX' }), period({ timetableEntryId: 102, className: 'VIII' }),
    ])));
    substitutions.suggestFill.and.returnValue(of({
      date: '2026-10-06',
      proposals: [
        { timetableEntryId: 100, periodNumber: 3, className: 'X', sectionName: 'A', subjectName: 'Maths', originalTeacherName: 'Mr Original', substituteTeacherId: 'T2', substituteTeacherName: 'Ms Free', reasons: ['SAME_SUBJECT'] },
        { timetableEntryId: 101, periodNumber: 3, className: 'IX', sectionName: 'A', subjectName: 'Maths', originalTeacherName: 'Mr Original', substituteTeacherId: 'T3', substituteTeacherName: 'Mr Three', reasons: [] },
        { timetableEntryId: 102, periodNumber: 3, className: 'VIII', sectionName: 'A', subjectName: 'Maths', originalTeacherName: 'Mr Original', substituteTeacherId: 'T4', substituteTeacherName: 'Mr Four', reasons: [] },
      ],
      unfillable: [],
    }));
    substitutions.assignMany.and.returnValue(of({
      assigned: 1, conflicts: 1, failed: 1,
      outcomes: [
        { timetableEntryId: 100, status: 'ASSIGNED', message: 'Assigned', assignment: null },
        { timetableEntryId: 101, status: 'CONFLICT', message: 'This period already has an active substitute.', assignment: null },
        { timetableEntryId: 102, status: 'FAILED', message: 'Could not be saved.', assignment: null },
      ],
    }));
    fixture.detectChanges();

    fixture.nativeElement.querySelector('.sub-fill-btn').click();
    fixture.detectChanges();
    expect(substitutions.assignMany).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Review suggested substitutes');
    expect(fixture.nativeElement.textContent).toContain('Confirm 3 assignments');

    component.confirmFill();
    fixture.detectChanges();

    expect(substitutions.assignMany).toHaveBeenCalledWith('2026-10-06', [
      { timetableEntryId: 100, substituteTeacherId: 'T2' },
      { timetableEntryId: 101, substituteTeacherId: 'T3' },
      { timetableEntryId: 102, substituteTeacherId: 'T4' },
    ]);
    const result = fixture.nativeElement.querySelector('.sub-fill.result');
    expect(result.textContent).toContain('1 assigned · 1 conflict · 1 failed');
    expect(result.textContent).toContain('This period already has an active substitute.');
    expect(result.textContent).toContain('Class IX · A, P3');
    expect(result.textContent).toContain('Failed');
    expect(toast.warning).toHaveBeenCalled();
  });

  it('cancelling the Fill all preview saves nothing', () => {
    configure('ADMIN');
    substitutions.suggestFill.and.returnValue(of({ date: '2026-10-06', proposals: [], unfillable: [period()] }));
    fixture.detectChanges();
    component.calculateFill();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No free teacher for 1 period');
    component.cancelFill();
    expect(component.fillPreview).toBeNull();
    expect(substitutions.assignMany).not.toHaveBeenCalled();
  });
});
