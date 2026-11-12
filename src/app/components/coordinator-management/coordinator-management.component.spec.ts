import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { CoordinatorManagementComponent } from './coordinator-management.component';
import { CoordinatorService } from '../../services/coordinator.service';
import { TeacherService } from '../../services/teacher.service';
import { SchoolService } from '../../services/school.service';
import { SectionService } from '../../services/section.service';
import { SubjectConfigService } from '../../services/subject-config.service';
import { ToastService } from '../../services/toast.service';
import { CoordinatorAppointment } from '../../interfaces/coordinator';

/** Shared by the web and Android clients — keep the two copies identical. */
describe('CoordinatorManagementComponent', () => {
  let fixture: ComponentFixture<CoordinatorManagementComponent>;
  let component: CoordinatorManagementComponent;
  let coordinators: jasmine.SpyObj<CoordinatorService>;
  let toast: jasmine.SpyObj<ToastService>;

  const active: CoordinatorAppointment = {
    id: 4, teacherId: 'T1', teacherName: 'Asha Rao', teacherEmail: null, classTeacher: '9', active: true,
    appointedBy: 'admin', appointedAt: '2026-11-01T00:00:00Z', updatedBy: null, updatedAt: null,
    removedBy: null, removedAt: null, removalReason: null,
    scope: [{ classId: 8, className: '8', sectionId: null, sectionName: null, streamId: null, streamName: null }],
  };

  beforeEach(() => {
    coordinators = jasmine.createSpyObj('CoordinatorService', ['list', 'appoint', 'updateScope', 'remove']);
    coordinators.updateScope.and.returnValue(of(active));
    coordinators.list.and.returnValue(of([active]));
    coordinators.appoint.and.returnValue(of({ ...active, id: 5, teacherId: 'T2', teacherName: 'Ben' }));
    coordinators.remove.and.returnValue(of({ ...active, active: false }));
    toast = jasmine.createSpyObj('ToastService', ['success', 'error']);
    TestBed.configureTestingModule({
      imports: [CoordinatorManagementComponent],
      providers: [
        { provide: CoordinatorService, useValue: coordinators },
        { provide: TeacherService, useValue: { getAllTeachers: () => of([
          { teacherId: 'T1', name: 'Asha Rao', status: 'ACTIVE' }, { teacherId: 'T2', name: 'Ben', status: 'ACTIVE' },
          { teacherId: 'T3', name: 'Left', status: 'LEFT' }]) } },
        { provide: SchoolService, useValue: { getManagedClasses: () => of([{ id: 8, name: '8', displayOrder: 1, active: true, streamEligible: false }]) } },
        { provide: SectionService, useValue: { getSectionsForClass: () => of([{ id: 81, classId: 8, name: 'A', active: true }, { id: 82, classId: 8, name: 'B', active: true }]) } },
        { provide: SubjectConfigService, useValue: { getStreams: () => of([]) } },
        { provide: ToastService, useValue: toast },
      ],
    });
    fixture = TestBed.createComponent(CoordinatorManagementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('lists active coordinators by name only, shows the scope under Change scope, and offers only unappointed active teachers', () => {
    expect(fixture.nativeElement.textContent).toContain('Asha Rao');
    expect(fixture.nativeElement.textContent).not.toContain('Class 8 (all sections)');
    expect(fixture.nativeElement.querySelectorAll('.cm-card .cm-tag').length).toBe(0);
    (fixture.nativeElement.querySelector('.cm-card .cm-btn') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.cm-editor').textContent).toContain('Class 8');
    expect(fixture.nativeElement.textContent).not.toContain('Academic');
    expect(component.availableTeachers.map(t => t.teacherId)).toEqual(['T2']);
  });

  it('appoints a teacher with the chosen class and section', () => {
    component.startNew();
    component.teacherId = 'T2';
    component.toggleClass(component.classes[0]);
    component.toggleSection(component.pickOf(8)!, 81);
    component.save();
    expect(coordinators.appoint).toHaveBeenCalledWith('T2', [{ classId: 8, sectionId: 81, streamId: null }]);
    expect(toast.success).toHaveBeenCalled();
  });

  it('selects whole classes by default, never duplicates a class and removes it again', () => {
    component.startNew();
    component.teacherId = 'T2';
    const c = component.classes[0];
    component.toggleClass(c);
    expect(component.toRequests()).toEqual([{ classId: 8, sectionId: null, streamId: null }]);
    component.toggleClass(c);                      // second tap removes it
    expect(component.picks.length).toBe(0);
    expect(component.canSave).toBeFalse();
    expect(component.saveHint).toBe('Select at least one class.');
    component.toggleAllClasses();
    component.toggleAllClasses();
    expect(component.picks.length).toBe(0);
    component.toggleAllClasses();
    expect(component.picks.map(p => p.classId)).toEqual([8]);
  });

  it('needs a teacher for a new appointment and keeps "all sections" and single sections exclusive', () => {
    component.startNew();
    component.toggleClass(component.classes[0]);
    expect(component.canSave).toBeFalse();
    expect(component.saveHint).toBe('Choose a teacher.');
    component.teacherId = 'T2';
    expect(component.canSave).toBeTrue();
    const pick = component.pickOf(8)!;
    component.toggleSection(pick, 81);
    expect(component.toRequests()).toEqual([{ classId: 8, sectionId: 81, streamId: null }]);
    component.toggleSection(pick, 82);             // every section chosen one by one = all sections
    expect(component.toRequests()).toEqual([{ classId: 8, sectionId: null, streamId: null }]);
    component.toggleSection(pick, 81);
    component.toggleSection(pick, null);
    expect(component.toRequests()).toEqual([{ classId: 8, sectionId: null, streamId: null }]);
  });

  it('edits an existing scope without widening it', () => {
    const multi = { ...active, scope: [
      { classId: 8, className: '8', sectionId: 81, sectionName: 'A', streamId: null, streamName: null },
      { classId: 8, className: '8', sectionId: 82, sectionName: 'B', streamId: null, streamName: null },
    ] };
    component.startEdit(multi);
    expect(component.editingId).toBe(4);
    expect(component.pickOf(8)!.sections).toEqual([81, 82]);
    expect(component.toRequests().length).toBe(2);
    // a scope that is not a plain sections × streams selection is preserved exactly
    const odd = { ...active, scope: [
      { classId: 8, className: '8', sectionId: 81, sectionName: 'A', streamId: 1, streamName: 'S' },
      { classId: 8, className: '8', sectionId: 82, sectionName: 'B', streamId: null, streamName: null },
    ] };
    component.startEdit(odd);
    expect(component.pickOf(8)!.custom).not.toBeNull();
    expect(component.toRequests()).toEqual([{ classId: 8, sectionId: 81, streamId: 1 }, { classId: 8, sectionId: 82, streamId: null }]);
    component.save();
    expect(coordinators.updateScope).toHaveBeenCalledWith(4, jasmine.any(Array));
  });

  it('shows past appointments only when asked', () => {
    const past = { ...active, id: 9, active: false, removedAt: '2026-11-05T00:00:00Z', removedBy: 'admin', removalReason: 'Moved' };
    coordinators.list.and.returnValue(of([active, past]));
    component.loadAppointments();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Past appointments (1)');
    expect(fixture.nativeElement.textContent).not.toContain('Moved');
    (fixture.nativeElement.querySelector('.cm-history-toggle') as HTMLElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Moved');
  });

  it('never ends an appointment without a reason', () => {
    component.startRemove(active);
    component.removalReason = '   ';
    component.confirmRemove();
    expect(coordinators.remove).not.toHaveBeenCalled();
    component.removalReason = 'Moved to senior wing';
    component.confirmRemove();
    expect(coordinators.remove).toHaveBeenCalledWith(4, 'Moved to senior wing');
  });

  it('shows the server reason when saving fails', () => {
    coordinators.appoint.and.returnValue(throwError(() => ({ status: 409, error: { message: 'This teacher is already a Coordinator.' } })));
    component.startNew();
    component.teacherId = 'T2';
    component.toggleClass(component.classes[0]);
    component.save();
    expect(toast.error).toHaveBeenCalled();
    expect(component.saving).toBeFalse();
  });
});
