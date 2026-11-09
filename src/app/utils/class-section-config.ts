import { Observable, Subject, concat, of } from 'rxjs';
import { catchError, map, switchMap, takeUntil } from 'rxjs/operators';
import { SchoolClass } from '../services/school.service';
import { Section } from '../interfaces/section';

/**
 * Class and section choices for student registration and student details. Shared by the web and
 * Android clients — keep the two copies identical.
 *
 * Readiness rules:
 *  - The class list and the managed classes (which carry the ids needed for sections) load
 *    independently. Neither failure blocks the other, and neither blocks a student profile from
 *    rendering — only the controls that depend on them are gated.
 *  - Sections for a class load only once managed classes are ready; a class picked earlier gets its
 *    sections as soon as they arrive. Picking another class cancels the previous section request, so
 *    a slow, stale response can never fill the section list of the newly picked class.
 *  - Every state change calls `changed` so OnPush views re-render.
 */
export type ConfigLoadState = 'loading' | 'ready' | 'failed';
export type SectionLoadState = 'idle' | 'waiting' | 'loading' | 'ready' | 'failed';

export interface ClassSectionSources {
  getClasses(): Observable<string[]>;
  getManagedClasses(): Observable<SchoolClass[]>;
  getSectionsForClass(classId: number): Observable<Section[]>;
}

interface SectionResult { state: SectionLoadState; sections: Section[]; }

export class ClassSectionConfig {
  classList: string[] = [];
  managedClasses: SchoolClass[] = [];
  sections: Section[] = [];
  classesState: ConfigLoadState = 'loading';
  managedState: ConfigLoadState = 'loading';
  sectionsState: SectionLoadState = 'idle';

  private selectedClass: string | null = null;
  private readonly sectionRequest$ = new Subject<string | null>();
  private readonly classesRequest$ = new Subject<void>();
  private readonly managedRequest$ = new Subject<void>();

  constructor(private sources: ClassSectionSources,
              private changed: () => void,
              private destroy$: Observable<void>) {
    this.sectionRequest$.pipe(
      switchMap((className) => this.sectionsFor(className)),
      takeUntil(destroy$),
    ).subscribe(({ state, sections }) => {
      this.sectionsState = state;
      this.sections = sections;
      this.changed();
    });
  }

  /** Starts (or restarts) both configuration loads. */
  load(): void {
    this.loadClasses();
    this.loadManagedClasses();
  }

  /** Reloads whatever failed. */
  retry(): void {
    if (this.classesState === 'failed') this.loadClasses();
    if (this.managedState === 'failed') this.loadManagedClasses();
    else if (this.sectionsState === 'failed') this.sectionRequest$.next(this.selectedClass);
  }

  /** The class whose sections should be offered (null/'' clears them). */
  selectClass(className: string | null | undefined): void {
    this.selectedClass = className || null;
    this.sectionRequest$.next(this.selectedClass);
  }

  get classesReady(): boolean { return this.classesState === 'ready'; }
  /** Sections are known for the selected class (possibly none). */
  get sectionsReady(): boolean { return this.sectionsState === 'ready' || this.sectionsState === 'idle'; }
  get sectionsPending(): boolean { return this.sectionsState === 'loading' || this.sectionsState === 'waiting'; }
  get anyFailed(): boolean {
    return this.classesState === 'failed' || this.managedState === 'failed' || this.sectionsState === 'failed';
  }

  managedClass(className: string | null | undefined): SchoolClass | undefined {
    return className ? this.managedClasses.find((c) => c.name === className) : undefined;
  }

  private loadClasses(): void {
    this.classesRequest$.next();
    this.classesState = 'loading';
    this.changed();
    this.sources.getClasses().pipe(takeUntil(this.classesRequest$), takeUntil(this.destroy$)).subscribe({
      next: (classes) => { this.classList = classes; this.classesState = 'ready'; this.changed(); },
      error: () => { this.classesState = 'failed'; this.changed(); },
    });
  }

  private loadManagedClasses(): void {
    this.managedRequest$.next();
    this.managedState = 'loading';
    this.changed();
    this.sources.getManagedClasses().pipe(takeUntil(this.managedRequest$), takeUntil(this.destroy$)).subscribe({
      next: (classes) => {
        this.managedClasses = classes;
        this.managedState = 'ready';
        this.sectionRequest$.next(this.selectedClass);
        this.changed();
      },
      error: () => {
        this.managedState = 'failed';
        this.sectionRequest$.next(this.selectedClass);
        this.changed();
      },
    });
  }

  private sectionsFor(className: string | null): Observable<SectionResult> {
    if (!className) return of({ state: 'idle', sections: [] });
    if (this.managedState !== 'ready') {
      return of({ state: this.managedState === 'failed' ? 'failed' : 'waiting', sections: [] });
    }
    const cls = this.managedClass(className);
    if (!cls) return of({ state: 'ready', sections: [] });
    return concat(
      of<SectionResult>({ state: 'loading', sections: [] }),
      this.sources.getSectionsForClass(cls.id).pipe(
        map((sections): SectionResult => ({ state: 'ready', sections })),
        catchError(() => of<SectionResult>({ state: 'failed', sections: [] })),
      ),
    );
  }
}
