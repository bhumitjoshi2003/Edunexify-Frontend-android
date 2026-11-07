/**
 * Plan feature keys — the same catalog as the backend's FeatureKeys. Use these (or the typed
 * FeatureKey union in templates, which strict template checking verifies) instead of hand-typed
 * strings. Shared byte-for-byte with the Android app.
 */
export const FEATURES = {
  // Core — in every plan
  SCHOOL_ADMINISTRATION: 'SCHOOL_ADMINISTRATION',
  ATTENDANCE: 'ATTENDANCE',
  LEAVE_MANAGEMENT: 'LEAVE_MANAGEMENT',
  TIMETABLE: 'TIMETABLE',
  SCHOOL_COMMUNICATION: 'SCHOOL_COMMUNICATION',
  // Plan-controlled
  THOUGHT_OF_THE_DAY: 'THOUGHT_OF_THE_DAY',
  CLASSROOM: 'CLASSROOM',
  EXAMS_RESULTS: 'EXAMS_RESULTS',
  REPORT_CARDS: 'REPORT_CARDS',
  FEE_MANAGEMENT: 'FEE_MANAGEMENT',
  ONLINE_PAYMENTS: 'ONLINE_PAYMENTS',
  FEE_REMINDERS: 'FEE_REMINDERS',
  PARENT_PORTAL: 'PARENT_PORTAL',
  BULK_COMMUNICATIONS: 'BULK_COMMUNICATIONS',
  BULK_IMPORT: 'BULK_IMPORT',
  ANALYTICS: 'ANALYTICS',
  AUDIT_LOGS: 'AUDIT_LOGS',
  AI_COPILOT: 'AI_COPILOT',
} as const;

export type FeatureKey = typeof FEATURES[keyof typeof FEATURES];

/** Part of every plan: always available, never switched off. */
export const CORE_FEATURES: readonly FeatureKey[] = [
  FEATURES.SCHOOL_ADMINISTRATION, FEATURES.ATTENDANCE, FEATURES.LEAVE_MANAGEMENT,
  FEATURES.TIMETABLE, FEATURES.SCHOOL_COMMUNICATION,
];

export function isCoreFeature(key: string): boolean {
  return (CORE_FEATURES as readonly string[]).includes(key);
}
