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

import type { RunTrace } from "@devdigest/shared";

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

/** `RunTrace` plus the module-local project-context field (absent on legacy / attachment-free runs). */
export type RunTraceView = RunTrace & { project_context_docs?: ProjectContextDocEntry[] };

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
