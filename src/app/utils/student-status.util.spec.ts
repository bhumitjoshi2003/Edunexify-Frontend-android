import { studentStatusLabel, studentStatusTone } from './student-status.util';
describe('student lifecycle display contract', () => {
  it('never labels an exited or cancelled student active', () => {
    for (const status of ['GRADUATED','TRANSFERRED','WITHDRAWN','INACTIVE','ADMISSION_CANCELLED']) {
      expect(studentStatusLabel(status)).not.toBe('Active');
      expect(studentStatusTone(status)).toBe('inactive');
    }
    expect(studentStatusLabel('GRADUATED')).toBe('Graduated');
    expect(studentStatusLabel('UPCOMING')).toBe('Upcoming');
  });
  it('keeps unknown values distinct from active', () => {
    expect(studentStatusLabel(undefined)).toBe('Unknown');
    expect(studentStatusLabel('not-real')).toBe('Unknown');
    expect(studentStatusTone('not-real')).toBe('unknown');
    expect(studentStatusTone('ACTIVE')).toBe('active');
  });
});
