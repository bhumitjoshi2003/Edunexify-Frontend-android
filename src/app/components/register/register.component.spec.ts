import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { RegisterComponent } from './register.component';

/** Shared by the web and Android clients — keep the two copies identical. */
describe('RegisterComponent — entry', () => {
  let query$: BehaviorSubject<any>;

  function create(query: Record<string, string>) {
    query$ = new BehaviorSubject(convertToParamMap(query));
    TestBed.configureTestingModule({
      imports: [RegisterComponent],
      providers: [{ provide: ActivatedRoute, useValue: { queryParamMap: query$, snapshot: { queryParamMap: convertToParamMap(query) } } }],
    });
    // The child forms have their own dependencies; this spec is only about which one is chosen.
    TestBed.overrideComponent(RegisterComponent, { set: { imports: [], template: '<span>{{ showStudentForm }}</span>' } });
    const fixture = TestBed.createComponent(RegisterComponent);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('/register opens the student form', () => {
    expect(create({}).showStudentForm).toBeTrue();
  });

  it('/register?type=teacher opens the teacher form', () => {
    expect(create({ type: 'teacher' }).showStudentForm).toBeFalse();
  });

  it('follows a later query change on the same screen', () => {
    const c = create({});
    query$.next(convertToParamMap({ type: 'teacher' }));
    expect(c.showStudentForm).toBeFalse();
    query$.next(convertToParamMap({ type: 'student' }));
    expect(c.showStudentForm).toBeTrue();
  });
});
