const REDIRECT_URL_KEY = 'redirectUrl';

/**
 * Where to land after the next successful sign-in. Shared by the web and Android clients — keep
 * the two copies identical. Each platform's TenantService tells this which school is active (web:
 * subdomain; Android: stored school), so a destination saved under one school is never used after
 * switching to another.
 *
 * Only signed-in app pages qualify (`/dashboard` and below). Public pages (home, password reset),
 * external or protocol-relative URLs, and paths with `..`, `\` or `//` are never saved or followed.
 * Whether the user may open the page is still decided by the route guards after navigation.
 */
let currentSchool: () => string | null = () => null;

export function setIntendedRouteSchoolResolver(resolver: () => string | null): void {
  currentSchool = resolver;
}

export function isSafeIntendedRoute(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  if (!(url === '/dashboard' || url.startsWith('/dashboard/') || url.startsWith('/dashboard?'))) return false;
  return !url.includes('//') && !url.includes('\\') && !url.includes('..') && !/[\u0000-\u001f]/.test(url);
}

/** Records the page to return to — only a safe signed-in page, tagged with the active school. */
export function saveIntendedRoute(url: string | null | undefined): void {
  if (!isSafeIntendedRoute(url)) return;
  localStorage.setItem(REDIRECT_URL_KEY, JSON.stringify({ url, school: currentSchool() ?? null }));
}

/** Reads and clears the saved destination; /dashboard unless it is safe and from this school. */
export function consumeIntendedRoute(school: string | null = currentSchool()): string {
  const raw = localStorage.getItem(REDIRECT_URL_KEY);
  localStorage.removeItem(REDIRECT_URL_KEY);
  if (!raw) return '/dashboard';
  try {
    const saved = JSON.parse(raw);
    return isSafeIntendedRoute(saved?.url) && (saved.school ?? null) === (school ?? null) ? saved.url : '/dashboard';
  } catch {
    return '/dashboard';   // a value from an older app version: not trusted
  }
}

/** Clears any saved intended route without reading it (e.g. on logout or school switch). */
export function clearIntendedRoute(): void {
  localStorage.removeItem(REDIRECT_URL_KEY);
}

/** The page to open after sign-in: the mandatory password change first, otherwise the saved
 *  destination for this school, otherwise the dashboard. */
export function postLoginDestination(options: { mustChangePassword: boolean; school: string | null }): string {
  if (options.mustChangePassword) {
    clearIntendedRoute();
    return '/change-initial-password';
  }
  return consumeIntendedRoute(options.school);
}
