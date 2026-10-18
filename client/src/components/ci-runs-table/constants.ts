import type { CiRunStatus, Verdict } from "@devdigest/shared";

/** Column order of the CI runs table (AC-30); labels resolve under `ci.runs.table`. */
export const COLUMNS = [
  "timestamp",
  "repository",
  "pullRequest",
  "agent",
  "source",
  "duration",
  "findings",
  "verdict",
  "cost",
  "status",
  "job",
] as const;

/** Shared grid so the header and every row line up; the table scrolls sideways when narrow. */
export const GRID_COLUMNS = "132px 150px minmax(180px, 1fr) 140px 128px 56px 104px 124px 64px 112px 56px";
export const MIN_TABLE_WIDTH = 1180;

/** Run status → message key (`ci.runs.status.*`) and badge colours. */
export const STATUS_STYLE: Record<CiRunStatus, { key: string; color: string; bg: string }> = {
  succeeded: { key: "succeeded", color: "var(--ok)", bg: "var(--ok-bg)" },
  no_findings: { key: "noFindings", color: "var(--text-secondary)", bg: "var(--bg-hover)" },
  failed: { key: "failed", color: "var(--crit)", bg: "var(--crit-bg)" },
  running: { key: "running", color: "var(--accent-text)", bg: "var(--accent-bg)" },
};

/** Verdict → badge colours (the label always carries text, never colour alone). */
export const VERDICT_STYLE: Record<Verdict, { color: string; bg: string }> = {
  approve: { color: "var(--ok)", bg: "var(--ok-bg)" },
  comment: { color: "var(--text-secondary)", bg: "var(--bg-hover)" },
  request_changes: { color: "var(--crit)", bg: "var(--crit-bg)" },
};

/** Per-severity count columns, in display order. */
export const SEVERITIES = [
  { field: "critical", sev: "CRITICAL" },
  { field: "warning", sev: "WARNING" },
  { field: "suggestion", sev: "SUGGESTION" },
] as const;
