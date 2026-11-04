import { Capacitor } from '@capacitor/core';
import { ACCOUNT_DELETION_URL, PRIVACY_POLICY_URL, openExternalUrl } from './legal-links';

describe('legal links', () => {
  it('point at the public website pages', () => {
    expect(PRIVACY_POLICY_URL).toBe('https://edunexify.co.in/privacy-policy');
    expect(ACCOUNT_DELETION_URL).toBe('https://edunexify.co.in/account-deletion');
  });

  it('open in the system browser on Android', () => {
    spyOn(Capacitor, 'isNativePlatform').and.returnValue(true);
    const open = spyOn(window, 'open');
    openExternalUrl(PRIVACY_POLICY_URL);
    expect(open).toHaveBeenCalledWith(PRIVACY_POLICY_URL, '_system');
  });

  it('open in a new tab on the web', () => {
    spyOn(Capacitor, 'isNativePlatform').and.returnValue(false);
    const open = spyOn(window, 'open');
    openExternalUrl(PRIVACY_POLICY_URL);
    expect(open).toHaveBeenCalledWith(PRIVACY_POLICY_URL, '_blank', 'noopener');
  });
});
