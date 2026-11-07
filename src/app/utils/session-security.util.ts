import { UserSession } from '../interfaces/user-session';

/**
 * Active-session rules. Shared by the web and Android clients — keep the two copies identical.
 *
 * The backend marks the caller's own session `current` from its refresh-token cookie; it is never
 * guessed from device, browser or IP. When no session is marked current (the server couldn't
 * identify this one), the server's "revoke others" would revoke ALL sessions — including this
 * device — so it is not offered as "log out others"; "log out everywhere" is the honest action.
 */
export interface SessionPartition {
  current: UserSession | undefined;
  others: UserSession[];
  /** The server identified this device's session. */
  currentKnown: boolean;
  /** "Log out all others" keeps this device signed in. */
  canRevokeOthers: boolean;
}

export function partitionSessions(sessions: readonly UserSession[]): SessionPartition {
  const current = sessions.find((s) => s.current);
  const others = sessions.filter((s) => !s.current);
  return { current, others, currentKnown: !!current, canRevokeOthers: !!current && others.length > 0 };
}

/** After revoking one other session: the list without it. The current session is never removed
 * this way (signing out this device is a separate, explicit action). */
export function withoutSession(sessions: readonly UserSession[], id: number): UserSession[] {
  return sessions.filter((s) => s.current || s.id !== id);
}
