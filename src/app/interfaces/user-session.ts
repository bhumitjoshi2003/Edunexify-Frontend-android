/** Mirrors the backend's UserSessionDto exactly — one login instance, never a
 * physical device. `current` is computed server-side from the caller's own
 * refresh-token identity (see AuthController#currentSessionHash); it must never
 * be inferred client-side from userAgent/ipAddress. No refresh-token/JTI field
 * exists here or on the backend DTO — sessions are never identified that way
 * from the frontend. */
export interface UserSession {
  id: number;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  current: boolean;
}
