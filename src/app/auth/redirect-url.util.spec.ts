import {
  clearIntendedRoute, consumeIntendedRoute, isSafeIntendedRoute, postLoginDestination, saveIntendedRoute,
  setIntendedRouteSchoolResolver,
} from './redirect-url.util';

/** Shared by the web and Android clients — keep the two copies identical. */
describe('redirect-url.util', () => {
  let school: string | null;
  beforeEach(() => {
    localStorage.removeItem('redirectUrl');
    school = null;
    setIntendedRouteSchoolResolver(() => school);
  });
  afterAll(() => setIntendedRouteSchoolResolver(() => null));

  it('saves and consumes a genuine signed-in page', () => {
    saveIntendedRoute('/dashboard/timetable');
    expect(consumeIntendedRoute()).toBe('/dashboard/timetable');
  });

  it('consuming clears it — a second read falls back to /dashboard', () => {
    saveIntendedRoute('/dashboard/fees');
    consumeIntendedRoute();
    expect(consumeIntendedRoute()).toBe('/dashboard');
  });

  it('keeps a valid parent-child deep link with its query', () => {
    school = 'green-valley';
    saveIntendedRoute('/dashboard/fees/stu_A?studentId=stu_A');
    expect(consumeIntendedRoute()).toBe('/dashboard/fees/stu_A?studentId=stu_A');
  });

  for (const bad of ['https://evil.example.com/phish', '//evil.example.com', '/home', '/reset-password?token=x', '/',
    '/dashboardx', '/dashboard/../home', '/dashboard//evil', '/dashboard\\evil', '/change-initial-password', 'dashboard/fees']) {
    it(`never saves or follows an unsafe/public route: ${bad}`, () => {
      expect(isSafeIntendedRoute(bad)).toBeFalse();
      saveIntendedRoute(bad);
      expect(consumeIntendedRoute()).toBe('/dashboard');
    });
  }

  it('an invalid saved value (e.g. edited storage, older app version) is not trusted', () => {
    localStorage.setItem('redirectUrl', '/dashboard/fees');
    expect(consumeIntendedRoute()).toBe('/dashboard');
    localStorage.setItem('redirectUrl', JSON.stringify({ url: 'https://evil.example', school: null }));
    expect(consumeIntendedRoute()).toBe('/dashboard');
  });

  it('a destination saved under another school is dropped after switching school', () => {
    school = 'school-a';
    saveIntendedRoute('/dashboard/fees');
    expect(consumeIntendedRoute('school-b')).toBe('/dashboard');
  });

  it('ignores null/undefined/empty and can be cleared', () => {
    saveIntendedRoute(null); saveIntendedRoute(undefined); saveIntendedRoute('');
    expect(consumeIntendedRoute()).toBe('/dashboard');
    saveIntendedRoute('/dashboard/attendance');
    clearIntendedRoute();
    expect(consumeIntendedRoute()).toBe('/dashboard');
  });

  it('after sign-in: the mandatory password change wins and discards the saved page', () => {
    saveIntendedRoute('/dashboard/fees');
    expect(postLoginDestination({ mustChangePassword: true, school: null })).toBe('/change-initial-password');
    expect(consumeIntendedRoute()).toBe('/dashboard');
  });

  it('after sign-in: the saved page for this school, else the dashboard', () => {
    school = 'green-valley';
    saveIntendedRoute('/dashboard/timetable');
    expect(postLoginDestination({ mustChangePassword: false, school: 'green-valley' })).toBe('/dashboard/timetable');
    expect(postLoginDestination({ mustChangePassword: false, school: 'green-valley' })).toBe('/dashboard');
  });
});
