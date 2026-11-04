import { Capacitor } from '@capacitor/core';

/** Public website pages. The apps only link to them; their wording lives on the website. */
export const PRIVACY_POLICY_URL = 'https://edunexify.co.in/privacy-policy';
export const ACCOUNT_DELETION_URL = 'https://edunexify.co.in/account-deletion';
export const SUPPORT_EMAIL = 'support@edunexify.co.in';

/** Opens a website page outside the app: the system browser on Android, a new tab on the web. */
export function openExternalUrl(url: string): void {
  if (Capacitor.isNativePlatform()) {
    window.open(url, '_system');
  } else {
    window.open(url, '_blank', 'noopener');
  }
}
