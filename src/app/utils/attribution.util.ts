/**
 * Who recorded a manual teacher-attendance entry or decided a leave request, in words. Shared by the web and Android clients —
 * keep the two copies identical (listed in parity/shared-files.json).
 *
 * The role is the authority the server recorded; it is never inferred on the client. Manual records
 * from before attribution was stored carry no role and were, at the time, Admin entries.
 */
const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin',
  PRINCIPAL: 'Principal',
  COORDINATOR: 'Coordinator',
  TEACHER: 'Class teacher',
};

export function attributionRoleLabel(role: string | null | undefined): string {
  return ROLE_LABELS[(role ?? '').toUpperCase()] ?? 'Admin';
}

/** "Corrected by Sunita Rao (Coordinator)", "Marked by Asha (Admin)", or '' for a self check-in. */
export function manualAttendanceLabel(record: {
  markedByAdmin?: boolean; method?: string | null; markedByName?: string | null; markedByRole?: string | null;
} | null | undefined): string {
  if (!record?.markedByAdmin) return '';
  const role = attributionRoleLabel(record.markedByRole);
  const corrected = (record.markedByRole ?? '').toUpperCase() === 'PRINCIPAL' || (record.markedByRole ?? '').toUpperCase() === 'COORDINATOR'
    || (record.method ?? '').toUpperCase() === 'MANUAL_CORRECTION';
  const verb = corrected ? 'Corrected by' : 'Marked by';
  return record.markedByName ? `${verb} ${record.markedByName} (${role})` : `${verb} ${role}`;
}

/** History line for one correction: "Sunita Rao (Coordinator)". */
export function correctorLabel(entry: { correctedBy?: string | null; correctedByName?: string | null; correctedByRole?: string | null }): string {
  const name = entry.correctedByName || entry.correctedBy || '';
  return name ? `${name} (${attributionRoleLabel(entry.correctedByRole)})` : attributionRoleLabel(entry.correctedByRole);
}

/** "Sunita Rao (Coordinator)"; falls back to the stored ID, and omits a role that was not recorded. */
export function decisionActorLabel(decision: { decidedBy?: string | null; decidedByName?: string | null; decidedByRole?: string | null }): string {
  const who = decision.decidedByName || decision.decidedBy || '';
  const role = (decision.decidedByRole ?? '').toUpperCase();
  return role && ROLE_LABELS[role] ? `${who} (${ROLE_LABELS[role]})` : who;
}
