import { Capacitor, registerPlugin } from '@capacitor/core';

/** Sent on every API request from the Android shell so the backend can pick the mobile session lifetime. */
export const CLIENT_PLATFORM_HEADER = 'X-Client-Platform';
export const ANDROID_PLATFORM = 'android';

/** Upper bound for the silent token refresh: a refresh that never answers must not wedge the app. */
export const REFRESH_TIMEOUT_MS = 10_000;

interface CookieFlushPlugin {
  /** Writes the WebView's cookie jar (including the just-rotated refresh cookie) to disk. */
  flush(): Promise<void>;
}

const CookieFlush = registerPlugin<CookieFlushPlugin>('CookieFlush');

/**
 * Native-shell hooks for the session. An object (not bare functions) so specs can replace them.
 */
export const nativeSession = {
  /** True only inside the Capacitor Android app — never in a browser or `ng serve`. */
  isAndroidShell(): boolean {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  },

  /**
   * Persists WebView cookies now. Chromium writes cookies to disk lazily, so a rotated refresh
   * cookie could be lost if the app process is killed right after a refresh — and the server has
   * already retired the old one, which would force a login. Best effort: never throws.
   */
  flushCookies(): Promise<void> {
    if (!nativeSession.isAndroidShell()) return Promise.resolve();
    return CookieFlush.flush().catch(() => undefined);
  },
};
