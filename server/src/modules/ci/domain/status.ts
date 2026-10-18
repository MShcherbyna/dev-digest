import type { CiInstallationStatus } from '@devdigest/shared';

export interface StatusInput {
  removalPrUrl: string | null;
  agentVersion: number;
  manifestVersion: number;
  lastRunAt: Date | null;
}

/** AC-25: removing > outdated > active > pending. Derived on read, never stored. */
export function deriveStatus(i: StatusInput): CiInstallationStatus {
  if (i.removalPrUrl) return 'removing';
  if (i.agentVersion > i.manifestVersion) return 'outdated';
  if (i.lastRunAt) return 'active';
  return 'pending';
}
