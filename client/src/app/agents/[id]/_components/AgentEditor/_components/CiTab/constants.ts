import type { CiFailOn, CiRunStatus } from "@devdigest/shared";

/** Rows of "Recent CI runs" on the tab (AC-29). */
export const RECENT_RUNS_LIMIT = 10;

/** "Fail CI on" options — the same values and labels as "CI gate" on the Config tab (AC-27). */
export const CI_FAIL_ON_VALUES: readonly CiFailOn[] = ["never", "critical", "warning", "any"];

/** Last-run status → badge colours on an installation row. */
export const RUN_STATUS_STYLE: Record<CiRunStatus, { color: string; bg: string }> = {
  succeeded: { color: "var(--ok)", bg: "var(--ok-bg)" },
  no_findings: { color: "var(--text-secondary)", bg: "var(--bg-hover)" },
  failed: { color: "var(--crit)", bg: "var(--crit-bg)" },
  running: { color: "var(--accent-text)", bg: "var(--accent-bg)" },
};

/** API error codes the wizard and the remove dialog map to a message (`ci.ciErrors.*`). */
export const KNOWN_ERROR_CODES: ReadonlySet<string> = new Set([
  "github_token_missing",
  "github_permission",
  "github_error",
  "agent_slug_conflict",
  "multi_agent_unsupported",
  "target_not_supported",
  "workflow_invalid",
  "manifest_invalid",
  "file_too_large",
  "secret_in_export",
  "repo_not_connected",
  "runner_bundle_missing",
]);

/** Token permissions a `403 github_permission` can name. */
export const PERMISSION_KEYS: ReadonlySet<string> = new Set(["contents", "pull_requests", "workflows"]);
