/**
 * Shared contract types re-exported from @devdigest/shared (single source of
 * truth). F2 imports these rather than redefining them.
 *
 * F1 (@devdigest/shared) currently exports all the platform/findings/brief/
 * knowledge/trace contracts we need for the scaffolding screens, so there are
 * NO local placeholders required at this time. If a feature agent's contract is
 * not yet exported, add a placeholder below marked
 * `// TODO: reconcile with @devdigest/shared`.
 */
export type {
  Settings,
  SettingsUpdate,
  ConnTestProvider,
  ConnTestResult,
  SecretsStatus,
  FeatureModelId,
  FeatureModelChoice,
  FeatureModelDef,
  Provider,
  ModelInfo,
  Repo,
  RepoInput,
  PrMeta,
  PrDetail,
  PrFile,
  PrCommit,
  PrReviewComment,
  PrStatus,
} from "@devdigest/shared";

import type {
  RunTrace,
  RunSummary,
  AgentColumn,
  AgentColumnFinding,
  MultiAgentRun,
} from "@devdigest/shared";

export type { AgentColumn, AgentColumnFinding, MultiAgentRun, Conflict, ConflictTake } from "@devdigest/shared";

/* Project Context wire types. Module-local (Q1-B): `vendor/shared` is
   do-not-touch, so these mirror `server/src/modules/project-context/schemas.ts`. */
export type ContextDocType = "specs" | "docs" | "insights";

export interface ContextFileInfo {
  path: string;
  type: ContextDocType;
  size: number;
  tokens: number;
  too_large: boolean;
  used_by: number;
}

export interface ContextListing {
  glob: string;
  scanned_at: string;
  cloned: boolean;
  truncated: boolean;
  total: number;
  files: ContextFileInfo[];
}

export interface ContextFileContent {
  path: string;
  content: string;
  size: number;
  tokens: number;
}

export interface ContextPaths {
  paths: string[];
}

export type ContextSkipReason = "missing" | "too_large" | "invalid_path" | "unreadable" | "empty";

/** One resolved attachment in a run trace (`project_context_docs`). */
export interface ProjectContextDocEntry {
  path: string;
  origin: "agent" | "skill";
  skill?: string;
  status: "included" | "skipped";
  reason?: ContextSkipReason;
  tokens?: number;
}

/** One finding the grounding gate dropped at run time (AC-31/AC-32). Module-local:
 * the vendored `RunTrace` has no such field. */
export interface GroundingDrop {
  title: string;
  file: string;
  start_line: number;
  end_line: number;
  reason: string;
}

/** `RunTrace` plus module-local fields (absent on legacy / older runs). */
export type RunTraceView = RunTrace & {
  project_context_docs?: ProjectContextDocEntry[];
  grounding_dropped?: GroundingDrop[];
};

/* Multi-Agent Review wire-type extensions (Q-1 of the plan): the vendored
   `AgentColumn` / `AgentColumnFinding` / `MultiAgentRun` are extended here
   rather than in `vendor/shared` (do-not-touch). Mirrors
   `server/src/modules/multi-agent-run/schemas.ts`. */

/** One of an `AgentColumn`'s extra states a single-agent run never has. */
export type AgentColumnStatus = "queued" | "running" | "done" | "failed" | "cancelled";

/** A finding as surfaced in a multi-agent column, with the fields the results
 * page needs beyond the vendored subset. */
export type AgentColumnFindingView = AgentColumnFinding & {
  end_line: number;
  /** 0..1 on the wire; multiply by 100 only when rendering. */
  confidence: number;
  rationale: string;
  suggested_fix: string | null;
  /** Set when grouped with similar findings from other agents (AC-20/AC-21). */
  group_id: string | null;
};

/** One agent's column in the multi-agent view. */
export type AgentColumnView = Omit<AgentColumn, "status" | "findings"> & {
  status: AgentColumnStatus;
  findings: AgentColumnFindingView[];
};

/** Aggregate status of a `MultiAgentRunView`, computed from its children (Q-2). */
export type MultiRunStatus = "running" | "partial" | "done" | "failed" | "cancelled";

export type MultiAgentRunView = Omit<MultiAgentRun, "columns"> & {
  status: MultiRunStatus;
  concurrency_limit: number;
  requested_agent_ids: string[];
  columns: AgentColumnView[];
};

/** `RunSummary` (PR run history row) with the multi-run parent link (AC-6). */
export type RunSummaryWithParent = RunSummary & { multi_agent_run_id: string | null };

/** Response of `GET /repos/:id/multi-agent/last-selection` (Q-6). */
export interface LastSelectionResponse {
  agent_ids: string[] | null;
}

/** One row of `GET /multi-agent-runs` — the landing page's recent-runs list
 * (AC-36). No per-child status: see server's `RecentMultiRunRow`. */
export interface RecentMultiAgentRun {
  id: string;
  pr_id: string;
  pr_number: number;
  pr_title: string;
  repo_full_name: string;
  ran_at: string;
  agent_count: number;
  cancelled: boolean;
}

export type { Review, Finding, Severity, Verdict } from "@devdigest/shared";
export type { PrBrief, SmartDiff } from "@devdigest/shared";

/** UI-only view model for a PR list row (derives display fields from PrMeta). */
export interface PrRowView {
  number: number;
  title: string;
  author: string;
  size: "S" | "M" | "L";
  sizeLines: string;
  score: number;
  findings: { CRITICAL: number; WARNING: number; SUGGESTION: number };
  status: "needs_review" | "reviewed" | "stale";
  updated: string;
}
