import type { CiInstallation, CiRunStatus } from "@devdigest/shared";

/** N of "Active in N repos": `active` and `outdated` installations (AC-1). */
export function activeCount(installations: readonly CiInstallation[]): number {
  return installations.filter((i) => i.status === "active" || i.status === "outdated").length;
}

/** Installation "Update CI config" opens first: the first `outdated` one, else the first (AC-28). */
export function pickUpdateTarget(installations: readonly CiInstallation[]): CiInstallation | undefined {
  return installations.find((i) => i.status === "outdated") ?? installations[0];
}

/** The status badge of a row: the last run's status, else `pending` / `manual pending` (AC-26). */
export type RowStatus =
  | { kind: "run"; status: CiRunStatus }
  | { kind: "pending" }
  | { kind: "manualPending" };

export function rowStatus(i: Pick<CiInstallation, "last_run_status" | "mode">): RowStatus {
  if (i.last_run_status) return { kind: "run", status: i.last_run_status };
  return i.mode === "manual" ? { kind: "manualPending" } : { kind: "pending" };
}

export type RelativeTime =
  | { unit: "justNow" }
  | { unit: "minutesAgo" | "hoursAgo" | "daysAgo"; count: number };

/** Coarse "4m ago" parts for an ISO timestamp; `null` when missing or unparsable. */
export function relativeTime(iso: string | null | undefined, now: number = Date.now()): RelativeTime | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const minutes = Math.floor(Math.max(0, now - then) / 60_000);
  if (minutes < 1) return { unit: "justNow" };
  if (minutes < 60) return { unit: "minutesAgo", count: minutes };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { unit: "hoursAgo", count: hours };
  return { unit: "daysAgo", count: Math.floor(hours / 24) };
}
