/**
 * Best-effort, display-only "Browser on OS" label parsed from a stored
 * user-agent string. Deliberately conservative — this is NOT fingerprinting and
 * must never be used to identify a session or make a security decision (see
 * UserSession.current, which is a real backend-computed field, never inferred
 * from this label).
 *
 * Chromium-based browsers that intentionally mask their identity as Chrome in
 * their user-agent string (Brave, Arc, Vivaldi, Edge on some platforms) cannot
 * be reliably distinguished from Chrome this way — they will legitimately show
 * as "Chrome on {OS}", which is still an honest label, just not brand-precise.
 * Do not attempt UA-string tricks to unmask them.
 */
export function deviceLabel(userAgent: string | null | undefined): string {
  if (!userAgent) return 'Web session';

  const os = detectOs(userAgent);
  const browser = detectBrowser(userAgent);

  if (browser === 'Android App') return 'Android App';
  if (!browser && !os) return 'Web session';
  if (browser && os) return `${browser} on ${os}`;
  return browser || os || 'Web session';
}

function detectOs(ua: string): string | null {
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Android/i.test(ua)) return 'Android';
  if (/Mac OS X/i.test(ua)) return 'macOS';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Linux/i.test(ua)) return 'Linux';
  return null;
}

/** Maps a stored user-agent to one of this app's already-used Material icon
 * ligature names (computer/laptop_mac/smartphone/tablet_mac/devices) — no new
 * icon library, no fingerprinting, just a coarse device-type hint alongside
 * the text label. */
export function deviceIcon(userAgent: string | null | undefined): string {
  if (!userAgent) return 'devices';
  if (/iPad/i.test(userAgent)) return 'tablet_mac';
  if (/iPhone/i.test(userAgent) || /Android/i.test(userAgent)) return 'smartphone';
  if (/Mac OS X/i.test(userAgent)) return 'laptop_mac';
  if (/Windows/i.test(userAgent) || /Linux/i.test(userAgent)) return 'computer';
  return 'devices';
}

function detectBrowser(ua: string): string | null {
  // A Capacitor Android WebView (this app's own Android build) sometimes — not
  // always, this varies by Android/WebView version — includes a "; wv)" marker.
  // Best-effort only: when present it's a strong signal; when absent, the UA is
  // simply indistinguishable from mobile Chrome and is labelled as such below,
  // which is still an accurate (if less specific) label.
  if (/Android/i.test(ua) && /; ?wv\)/i.test(ua)) return 'Android App';

  // Order matters: Chrome/Edge/most Chromium browsers also match "Safari" and
  // "Mozilla" tokens, so the more specific checks must come first.
  if (/Edg\//i.test(ua)) return 'Edge';
  if (/OPR\//i.test(ua) || /Opera/i.test(ua)) return 'Opera';
  if (/Chrome\//i.test(ua) || /CriOS/i.test(ua)) return 'Chrome';
  if (/Firefox\//i.test(ua) || /FxiOS/i.test(ua)) return 'Firefox';
  if (/Safari\//i.test(ua)) return 'Safari';
  return null;
}
