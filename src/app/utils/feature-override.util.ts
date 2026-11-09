/**
 * Super-admin per-school feature overrides. Shared by the web and Android clients — keep the two
 * copies identical. The backend's effective entitlement stays authoritative; this only decides
 * which actions make sense to offer and tracks in-flight saves per school.
 *
 *  - Enable  — only for a feature the plan does NOT grant (granting beyond the plan).
 *  - Disable — for a feature that is on through the plan or an Enable override.
 *  - Reset   — whenever an override exists (back to the plan default).
 */
export type FeatureOverrideState = 'DEFAULT' | 'ENABLED' | 'DISABLED' | string;

export interface FeatureOverrideFacts {
  overrideState: FeatureOverrideState;
  planGranted: boolean;
}

export interface FeatureOverrideActions {
  enable: boolean;
  disable: boolean;
  reset: boolean;
}

export function featureOverrideActions(feature: FeatureOverrideFacts): FeatureOverrideActions {
  return {
    enable: feature.overrideState !== 'ENABLED' && !feature.planGranted,
    disable: feature.overrideState !== 'DISABLED' && (feature.planGranted || feature.overrideState === 'ENABLED'),
    reset: feature.overrideState !== 'DEFAULT',
  };
}

/** One in-flight save per school + feature: the same feature in another school is independent. */
export function featureOperationKey(schoolId: number, featureKey: string): string {
  return `${schoolId}:${featureKey}`;
}

/** The server's plain-text or { message } error body, or the fallback. */
export function featureOverrideErrorMessage(error: any): string {
  const body = error?.error;
  const message = typeof body === 'string' ? body : body?.message;
  return typeof message === 'string' && message.trim() && message.length < 300
    ? message.trim()
    : 'Failed to update feature override.';
}
