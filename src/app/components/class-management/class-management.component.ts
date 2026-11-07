import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { SchoolService, SchoolClass } from '../../services/school.service';
import { SectionService } from '../../services/section.service';
import { Section } from '../../interfaces/section';
import { AuthStateService } from '../../auth/auth-state.service';
import { ToastService } from '../../services/toast.service';
import { LoggerService } from '../../services/logger.service';

@Component({
  selector: 'app-class-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './class-management.component.html',
  styleUrl: './class-management.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClassManagementComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  classes: SchoolClass[] = [];
  isLoading = false;
  newClassName = '';
  addingClass = false;
  savingOrder = false;
  role = '';

  // Section management
  expandedClassId: number | null = null;
  classSections: Map<number, Section[]> = new Map();
  sectionsLoading: Set<number> = new Set();
  newSectionName: Map<number, string> = new Map();
  addingSectionForClass: number | null = null;

  constructor(
    private schoolService: SchoolService,
    private sectionService: SectionService,
    private authStateService: AuthStateService,
    private cdr: ChangeDetectorRef,
    private toast: ToastService,
    private logger: LoggerService
  ) {}

  ngOnInit(): void {
    this.role = this.authStateService.getUser()?.role ?? '';
    this.loadClasses();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get isAdmin(): boolean {
    return this.role === 'ADMIN' || this.role === 'PRINCIPAL';
  }

  loadClasses(): void {
    this.isLoading = true;
    this.cdr.markForCheck();
    this.schoolService.getManagedClasses().pipe(takeUntil(this.destroy$)).subscribe({
      next: (list) => {
        this.classes = list ?? [];
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: (e) => {
        this.logger.error('Failed to load classes', e);
        this.toast.error('Error', 'Failed to load classes.');
        this.isLoading = false;
        this.cdr.markForCheck();
      }
    });
  }

  addNewClass(): void {
    const name = this.newClassName.trim();
    if (!name) return;
    this.addingClass = true;
    this.cdr.markForCheck();
    this.schoolService.addClass(name).pipe(takeUntil(this.destroy$)).subscribe({
      next: (c) => {
        this.classes = [...this.classes, c];
        this.newClassName = '';
        this.addingClass = false;
        this.schoolService.invalidateClasses();
        this.toast.success('Added', `"${c.name}" added.`);
        this.cdr.markForCheck();
      },
      error: (e) => {
        this.logger.error('Failed to add class', e);
        this.toast.error('Error', 'Could not add class. It may already exist.');
        this.addingClass = false;
        this.cdr.markForCheck();
      }
    });
  }

  removeClass(cls: SchoolClass): void {
    this.toast.confirm({
      title: `Remove "${cls.name}"?`,
      message: 'Removing this class will affect all students, timetable entries, and fee records associated with it. This action cannot be easily undone. Are you sure?',
      icon: 'warning',
      danger: true,
      confirmText: 'Yes, Remove',
      cancelText: 'Cancel',
    }).then((confirmed) => {
      if (!confirmed) return;
      this.schoolService.deleteClass(cls.id).pipe(takeUntil(this.destroy$)).subscribe({
        next: () => {
          this.classes = this.classes.filter(c => c.id !== cls.id);
          this.schoolService.invalidateClasses();
          this.toast.success('Removed', `"${cls.name}" removed.`);
          this.cdr.markForCheck();
        },
        error: (e) => {
          this.logger.error('Failed to delete class', e);
          const reason = e?.error?.message;
          this.toast.error('Cannot Remove Class', reason || 'Could not remove class.');
          this.cdr.markForCheck();
        }
      });
    });
  }

  moveClass(index: number, direction: 'up' | 'down'): void {
    const swap = direction === 'up' ? index - 1 : index + 1;
    if (swap < 0 || swap >= this.classes.length) return;
    const list = [...this.classes];
    [list[index], list[swap]] = [list[swap], list[index]];
    this.classes = list;
    this.cdr.markForCheck();
  }

  saveOrder(): void {
    this.savingOrder = true;
    this.cdr.markForCheck();
    const ids = this.classes.map(c => c.id);
    this.schoolService.reorderClasses(ids).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.savingOrder = false;
        this.schoolService.invalidateClasses();
        this.toast.success('Saved', 'Class order saved.');
        this.cdr.markForCheck();
      },
      error: (e) => {
        this.logger.error('Failed to reorder classes', e);
        this.toast.error('Error', 'Could not save order.');
        this.savingOrder = false;
        this.cdr.markForCheck();
      }
    });
  }

  toggleStreamEligible(cls: SchoolClass): void {
    const newValue = !cls.streamEligible;
    this.schoolService.toggleStreamEligible(cls.id, newValue).pipe(takeUntil(this.destroy$)).subscribe({
      next: (updated) => {
        this.classes = this.classes.map(c => c.id === updated.id ? updated : c);
        this.toast.success(
          newValue ? 'Stream On' : 'Stream Off',
          `"${cls.name}" ${newValue ? 'added to' : 'removed from'} stream assignment.`
        );
        this.cdr.markForCheck();
      },
      error: (e) => {
        this.logger.error('Failed to toggle stream eligibility', e);
        this.toast.error('Error', 'Could not update stream eligibility.');
      }
    });
  }

  trackById(_: number, cls: SchoolClass): number { return cls.id; }

  // ── Section Management ────────────────────────────────────────────

  toggleSections(cls: SchoolClass): void {
    if (this.expandedClassId === cls.id) {
      this.expandedClassId = null;
    } else {
      this.expandedClassId = cls.id;
      if (!this.classSections.has(cls.id)) {
        this.loadSections(cls.id);
      }
    }
    this.cdr.markForCheck();
  }

  loadSections(classId: number): void {
    this.sectionsLoading.add(classId);
    this.cdr.markForCheck();
    this.sectionService.getSectionsForClass(classId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (sections) => {
        this.classSections.set(classId, sections);
        this.sectionsLoading.delete(classId);
        this.cdr.markForCheck();
      },
      error: (e) => {
        this.logger.error('Failed to load sections', e);
        this.toast.error('Error', 'Failed to load sections.');
        this.sectionsLoading.delete(classId);
        this.cdr.markForCheck();
      }
    });
  }

  getNewSectionName(classId: number): string {
    return this.newSectionName.get(classId) ?? '';
  }

  setNewSectionName(classId: number, value: string): void {
    this.newSectionName.set(classId, value);
  }

  addSection(classId: number): void {
    const name = (this.newSectionName.get(classId) ?? '').trim();
    if (!name) return;
    this.addingSectionForClass = classId;
    this.cdr.markForCheck();
    const section: Section = { classId, name, active: true };
    this.sectionService.createSection(section).pipe(takeUntil(this.destroy$)).subscribe({
      next: (created) => {
        const current = this.classSections.get(classId) ?? [];
        this.classSections.set(classId, [...current, created]);
        this.newSectionName.set(classId, '');
        this.addingSectionForClass = null;
        this.toast.success('Added', `Section "${created.name}" added.`);
        this.cdr.markForCheck();
      },
      error: (e) => {
        this.logger.error('Failed to add section', e);
        this.toast.error('Error', e?.error?.message || 'Could not add section.');
        this.addingSectionForClass = null;
        this.cdr.markForCheck();
      }
    });
  }

  removeSection(classId: number, section: Section): void {
    this.toast.confirm({
      title: `Remove "${section.name}"?`,
      message: 'Any students assigned to this section will have their section cleared. They will still appear under "All Sections".',
      icon: 'warning',
      danger: true,
      confirmText: 'Yes, remove',
      cancelText: 'Cancel',
    }).then((confirmed) => {
      if (!confirmed || !section.id) return;
      this.sectionService.deleteSection(section.id).pipe(takeUntil(this.destroy$)).subscribe({
        next: ({ affected }) => {
          const current = this.classSections.get(classId) ?? [];
          this.classSections.set(classId, current.filter(s => s.id !== section.id));
          if (affected > 0) {
            this.toast.warning('Section Removed', `Section "${section.name}" removed. ${affected} student${affected === 1 ? "'s" : "s'"} section assignment was cleared.`);
          } else {
            this.toast.success('Removed', `Section "${section.name}" removed.`);
          }
          this.cdr.markForCheck();
        },
        error: (e) => {
          this.logger.error('Failed to delete section', e);
          this.toast.error('Error', 'Could not remove section.');
          this.cdr.markForCheck();
        }
      });
    });
  }

  trackBySectionId(_: number, section: Section): number { return section.id!; }
}
