import type { CiRunStatus } from "@devdigest/shared";
import type { IconName } from "@devdigest/ui";

const HOUR_MS = 3_600_000;

/** Time-range filter options; `labelKey` resolves under `ci.runs.filters`. */
export const TIME_RANGES = [
  { key: "24h", labelKey: "last24Hours", ms: 24 * HOUR_MS },
  { key: "7d", labelKey: "last7Days", ms: 7 * 24 * HOUR_MS },
  { key: "30d", labelKey: "last30Days", ms: 30 * 24 * HOUR_MS },
] as const;
export type TimeRangeKey = (typeof TIME_RANGES)[number]["key"];
export const DEFAULT_RANGE: TimeRangeKey = "7d";

/** Status filter options; `key` resolves under `ci.runs.status`. */
export const STATUS_OPTIONS: readonly { value: CiRunStatus; key: string }[] = [
  { value: "succeeded", key: "succeeded" },
  { value: "no_findings", key: "noFindings" },
  { value: "failed", key: "failed" },
  { value: "running", key: "running" },
];

/** The only ingested source today (`ci_runs.source`). */
export const SOURCE_OPTIONS = ["ci"] as const;

/** Icons of the filter chips (design: CI Runs). */
export const FILTER_ICONS: Record<"time" | "agent" | "repo" | "status" | "source", IconName | undefined> = {
  time: "Calendar",
  agent: "Cpu",
  repo: "GitBranch",
  status: undefined,
  source: "Workflow",
};
