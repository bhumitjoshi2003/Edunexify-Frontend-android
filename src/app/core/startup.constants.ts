/**
 * Startup resilience timing — kept in one place so both AuthStateService and TenantService
 * agree on how long a startup-critical request may run before it's treated as unreachable, and
 * so app.config.ts's bootstrap grace period can be reasoned about relative to it.
 *
 * STARTUP_HTTP_TIMEOUT_MS bounds the actual /auth/me and tenant-lookup HTTP calls — this is
 * what turns "the backend never responds" (the root cause of the original white-screen
 * incident) into a definite, classifiable failure instead of an unresolved Promise. ~10s is
 * generous enough to tolerate a cold Neon resume or a briefly slow container without punishing
 * normal users, while still bounding the worst case.
 *
 * STARTUP_BOOTSTRAP_GRACE_MS bounds how long Angular's own bootstrap (APP_INITIALIZER) waits
 * for the real result before rendering anyway with whatever it has so far (almost always still
 * CHECKING) — short enough that a healthy, fast backend produces the exact same instant
 * first paint as before this change, long enough to avoid a loading-screen flash on completely
 * ordinary response times. The real startup calls keep running in the background past this
 * point; AuthStateService's status is observable, so the UI updates the moment they resolve.
 */
export const STARTUP_HTTP_TIMEOUT_MS = 10_000;
export const STARTUP_BOOTSTRAP_GRACE_MS = 1_500;

/** After this long still on the loading screen, its copy switches to "taking longer than
 * usual" — purely cosmetic, independent of the hard timeouts above. */
export const STARTUP_SLOW_NOTICE_MS = 5_000;
