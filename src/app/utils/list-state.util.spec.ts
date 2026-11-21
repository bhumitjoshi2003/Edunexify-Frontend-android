import { adminDeleteDialog, listDisplay, sectionRemovalDialog, sectionRemovalResult } from './list-state.util';

/** Shared by the web and Android clients — keep the two copies identical. */
describe('list state and destructive actions', () => {
  it('a failed load is an error, never an empty list', () => {
    expect(listDisplay('loading', 0)).toBe('loading');
    expect(listDisplay('failed', 0)).toBe('error');
    expect(listDisplay('failed', 3)).toBe('error');
    expect(listDisplay('ready', 0)).toBe('empty');
    expect(listDisplay('ready', 2)).toBe('list');
  });

  it('section removal warns about assigned students and offers Cancel', () => {
    const dialog = sectionRemovalDialog('A');
    expect(dialog.cancelText).toBe('Cancel');
    expect(dialog.message).toContain('section cleared');
  });

  it('reports the affected student count from the server', () => {
    expect(sectionRemovalResult('A', 3)).toEqual({ level: 'warning', title: 'Section Removed',
      message: 'Section "A" removed. 3 students\' section assignment was cleared.' });
    expect(sectionRemovalResult('A', 1).message).toContain("1 student's section assignment was cleared");
    expect(sectionRemovalResult('A', 0)).toEqual({ level: 'success', title: 'Removed', message: 'Section "A" removed. No students were assigned to it.' });
    expect(sectionRemovalResult('A', undefined).message).toBe('Section "A" removed.');
  });

  it('admin deletion has an explicit Cancel', () => {
    expect(adminDeleteDialog().cancelText).toBe('Cancel');
    expect(adminDeleteDialog().danger).toBeTrue();
  });
});
