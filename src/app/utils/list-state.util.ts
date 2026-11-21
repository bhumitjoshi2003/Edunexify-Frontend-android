import { ConfirmDialogData } from '../services/toast.service';

/**
 * List loading/error/empty semantics and destructive-action wording. Shared by the web and
 * Android clients — keep the two copies identical. A list that failed to load is never shown as
 * empty ("No teachers found"): it says it couldn't be loaded and offers Retry.
 */
export type ListLoadState = 'loading' | 'ready' | 'failed';
export type ListDisplay = 'loading' | 'error' | 'empty' | 'list';

export function listDisplay(state: ListLoadState, count: number): ListDisplay {
  if (state === 'loading') return 'loading';
  if (state === 'failed') return 'error';
  return count > 0 ? 'list' : 'empty';
}

/** Section removal: the warning names what happens to assigned students. */
export function sectionRemovalDialog(sectionName: string): ConfirmDialogData {
  return {
    title: `Remove "${sectionName}"?`,
    message: 'Any students assigned to this section will have their section cleared. They will still appear under "All Sections".',
    icon: 'warning',
    danger: true,
    confirmText: 'Yes, remove',
    cancelText: 'Cancel',
  };
}

/** What the removal did, from the server's affected-student count. When the count is missing the
 * outcome is reported without claiming that no students were affected. */
export function sectionRemovalResult(sectionName: string, affected: number | null | undefined):
  { level: 'success' | 'warning'; title: string; message: string } {
  if (typeof affected === 'number' && affected > 0) {
    return {
      level: 'warning', title: 'Section Removed',
      message: `Section "${sectionName}" removed. ${affected} student${affected === 1 ? "'s" : "s'"} section assignment was cleared.`,
    };
  }
  if (typeof affected === 'number') {
    return { level: 'success', title: 'Removed', message: `Section "${sectionName}" removed. No students were assigned to it.` };
  }
  return { level: 'success', title: 'Removed', message: `Section "${sectionName}" removed.` };
}

export function adminDeleteDialog(): ConfirmDialogData {
  return {
    title: 'Are you sure?',
    message: 'This admin will be permanently removed!',
    icon: 'warning',
    danger: true,
    confirmText: 'Yes, delete it!',
    cancelText: 'Cancel',
  };
}
