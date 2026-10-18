import type { CiRun } from "@devdigest/shared";
import { SEVERITIES } from "./constants";

/** Placeholder for any unknown value (AC-30). */
export const DASH = "—";

const pad = (n: number) => String(n).padStart(2, "0");

/** `YYYY-MM-DD HH:mm` in local time, or "—" when missing/unparsable. */
export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return DASH;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "7.4s" from `duration_ms` (falling back to `duration_s`); "—" when unknown or zero. */
export function formatDuration(run: Pick<CiRun, "duration_ms" | "duration_s">): string {
  const seconds = run.duration_ms != null ? run.duration_ms / 1000 : (run.duration_s ?? null);
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return DASH;
  return `${seconds.toFixed(1)}s`;
}

/** The severities with a non-zero count, in display order. */
export function findingEntries(run: Pick<CiRun, "critical" | "warning" | "suggestion">) {
  return SEVERITIES.flatMap(({ field, sev }) => {
    const count = run[field];
    return count != null && count > 0 ? [{ field, sev, count }] : [];
  });
}
