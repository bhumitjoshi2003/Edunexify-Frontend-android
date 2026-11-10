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
        { provide: SectionService, useValue: { getSectionsForClass: () => of([{ id: 81, classId: 8, name: 'A', active: true }]) } },
        { provide: SubjectConfigService, useValue: { getStreams: () => of([]) } },
        { provide: ToastService, useValue: toast },
      ],
    });
    fixture = TestBed.createComponent(CoordinatorManagementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('lists active coordinators with their scope and offers only unappointed active teachers', () => {
    expect(fixture.nativeElement.textContent).toContain('Asha Rao');
    expect(fixture.nativeElement.textContent).toContain('Class 8 (all sections)');
    expect(component.availableTeachers.map(t => t.teacherId)).toEqual(['T2']);
  });

  it('appoints a teacher with the chosen class and section', () => {
    component.startNew();
    component.teacherId = 'T2';
    component.draft = [{ classId: 8, sectionId: 81, streamId: null }];
    component.save();
    expect(coordinators.appoint).toHaveBeenCalledWith('T2', [{ classId: 8, sectionId: 81, streamId: null }]);
    expect(toast.success).toHaveBeenCalled();
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
    component.draft = [{ classId: 8, sectionId: null, streamId: null }];
    component.save();
    expect(toast.error).toHaveBeenCalled();
    expect(component.saving).toBeFalse();
  });
});
