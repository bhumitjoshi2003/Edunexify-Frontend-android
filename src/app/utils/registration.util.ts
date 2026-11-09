import { ConfirmDialogData } from '../services/toast.service';

/**
 * Registration entry and the generated-credentials acknowledgment. Shared by the web and Android
 * clients — keep the two copies identical.
 */
export type RegistrationTab = 'student' | 'teacher';

/** `/register?type=teacher` opens the teacher form; anything else opens the student form. */
export function registrationTabFromQuery(type: string | null | undefined): RegistrationTab {
  return type?.trim().toLowerCase() === 'teacher' ? 'teacher' : 'student';
}

/**
 * The new account's ID and how to sign in for the first time. Shown in a dialog that stays open
 * until the admin acknowledges it (one button, no backdrop dismiss) — never an auto-dismissing
 * toast, because the admin has to pass these details on.
 */
export function registrationCredentialsDialog(kind: RegistrationTab, accountId: string, joinsLater = false): ConfirmDialogData {
  const idLabel = kind === 'teacher' ? 'Edunexify Employee ID' : 'Edunexify Student ID';
  return {
    title: kind === 'teacher' ? 'Teacher Registered!' : 'Student Registered!',
    message: `${idLabel}: ${accountId}. Initial password: Date of birth in YYYYMMDD format. ` +
      'Example: 23 May 1990 → 19900523. The user must create a new password during their first login.' +
      (joinsLater ? ' The login activates on the joining date.' : ''),
    icon: 'success',
    confirmText: 'Done',
  };
}
