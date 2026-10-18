import { z } from 'zod';
import { Verdict, Finding } from './findings.js';
import { EvalRun, EvalOwnerKind, Conformance, Provider, CiFailOn } from './knowledge.js';

/**
 * A4 — Eval / CI / Compose / Conformance API contracts (L06).
 *
 * These EXTEND the barrel; they do not modify existing contract files. The base
 * `EvalRun`, `EvalCase`, `EvalOwnerKind`, `Conformance` live in `knowledge.ts`;
 * here we add the *API-facing* request/response shapes (records persisted in
 * `eval_runs`, `composed_reviews`, `ci_installations`, `ci_runs`,
 * `conformance_checks`) plus the eval-dashboard aggregate.
 */

// ===========================================================================
// Eval — case input + persisted run record + dashboard
// ===========================================================================

/** Create/update payload for an eval case (id + owner resolved by the route). */
export const EvalCaseInput = z.object({
  owner_kind: EvalOwnerKind,
  owner_id: z.string(),
  name: z.string().min(1),
  input_diff: z.string().default(''),
  input_files: z.unknown().nullish(),
  input_meta: z.unknown().nullish(),
  expected_output: z.unknown(),
  notes: z.string().nullish(),
});
export type EvalCaseInput = z.infer<typeof EvalCaseInput>;

/** A persisted eval run row (one execution of a case), returned by the API. */
export const EvalRunRecord = z.object({
  id: z.string(),
  case_id: z.string(),
  case_name: z.string().nullish(),
  ran_at: z.string(),
  actual_output: z.unknown(),
  pass: z.boolean().nullable(),
  recall: z.number().nullable(),
  precision: z.number().nullable(),
  citation_accuracy: z.number().nullable(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
});
export type EvalRunRecord = z.infer<typeof EvalRunRecord>;

/** Result of running a single case: the metrics (EvalRun) + the persisted row id. */
export const EvalRunResult = z.object({
  run_id: z.string(),
  case_id: z.string(),
  result: EvalRun,
});
export type EvalRunResult = z.infer<typeof EvalRunResult>;

/** One point on the dashboard trend (per run, chronological). */
export const EvalTrendPoint = z.object({
  ran_at: z.string(),
  recall: z.number(),
  precision: z.number(),
  citation_accuracy: z.number(),
  pass_rate: z.number(),
  cost_usd: z.number().nullable(),
});
export type EvalTrendPoint = z.infer<typeof EvalTrendPoint>;

/** Aggregate dashboard for an owner (agent/skill) or the whole workspace. */
export const EvalDashboard = z.object({
  owner_kind: EvalOwnerKind.nullable(),
  owner_id: z.string().nullable(),
  cases_total: z.number().int(),
  current: z.object({
    recall: z.number(),
    precision: z.number(),
    citation_accuracy: z.number(),
    traces_passed: z.number().int(),
    traces_total: z.number().int(),
    cost_usd: z.number().nullable(),
  }),
  delta: z.object({
    recall: z.number(),
    precision: z.number(),
    citation_accuracy: z.number(),
  }),
  trend: z.array(EvalTrendPoint),
  recent_runs: z.array(EvalRunRecord),
  alert: z.string().nullable(),
});
export type EvalDashboard = z.infer<typeof EvalDashboard>;

// ===========================================================================
// Compose Review
// ===========================================================================

export const ComposeReviewInput = z.object({
  /** Finding ids to fold into the draft (optional — body may be hand-written). */
  finding_ids: z.array(z.string()).default([]),
  /** Editable markdown body. If omitted, the server composes one from findings. */
  body: z.string().nullish(),
  verdict: Verdict.default('comment'),
  /** When true, attach selected findings as inline comments (path+line+body). */
  inline_comments: z.boolean().default(false),
});
export type ComposeReviewInput = z.infer<typeof ComposeReviewInput>;
/** Caller-facing input type — `.default()` fields stay optional (web hooks). */
export type ComposeReviewInputBody = z.input<typeof ComposeReviewInput>;

/** A persisted composed review (mirrors the `composed_reviews` row). */
export const ComposedReview = z.object({
  id: z.string(),
  pr_id: z.string(),
  body: z.string(),
  verdict: Verdict.nullable(),
  posted_at: z.string().nullable(),
  github_review_id: z.string().nullable(),
});
export type ComposedReview = z.infer<typeof ComposedReview>;

/** A preview (no GitHub side-effect) of what would be posted. */
export const ComposeReviewPreview = z.object({
  body: z.string(),
  verdict: Verdict,
  inline_comments: z.array(
    z.object({ path: z.string(), line: z.number().int(), body: z.string() }),
  ),
});
export type ComposeReviewPreview = z.infer<typeof ComposeReviewPreview>;

// ===========================================================================
// Export-to-CI + CI Runs
// ===========================================================================

export const CiTarget = z.enum(['gha', 'circle', 'jenkins', 'cli']);
export type CiTarget = z.infer<typeof CiTarget>;

/** `pull_request` activity types an export can trigger on (AC-10). */
export const CiTrigger = z.enum(['opened', 'synchronize', 'reopened']);
export type CiTrigger = z.infer<typeof CiTrigger>;

/** How the runner posts results; written to the workflow as DEVDIGEST_POST_AS (AC-12). */
export const CiPostAs = z.enum(['github_review', 'pr_comment', 'none']);
export type CiPostAs = z.infer<typeof CiPostAs>;

/** "pr" = installed through a devdigest/ci PR; "manual" = zip download (AC-17). */
export const CiInstallMode = z.enum(['pr', 'manual']);
export type CiInstallMode = z.infer<typeof CiInstallMode>;

/** Derived installation status; precedence removing > outdated > active > pending (AC-25). */
export const CiInstallationStatus = z.enum(['pending', 'active', 'outdated', 'removing']);
export type CiInstallationStatus = z.infer<typeof CiInstallationStatus>;

/** Whether a repository Actions secret exists — never its value (AC-11, NFR-4). */
export const CiSecretStatus = z.enum(['ready', 'not_set', 'unknown']);
export type CiSecretStatus = z.infer<typeof CiSecretStatus>;

/** Why Install is blocked before it is attempted (AC-31, AC-32). */
export const CiInstallBlock = z.enum(['multi_agent_unsupported', 'agent_slug_conflict']);
export type CiInstallBlock = z.infer<typeof CiInstallBlock>;

/** One generated file in the CI bundle (path + editable contents). */
export const CiFile = z.object({
  path: z.string(),
  contents: z.string(),
  editable: z.boolean().default(true),
});
export type CiFile = z.infer<typeof CiFile>;

/**
 * AgentManifest — the agent contract shared by the studio and the CI runner.
 *
 * The studio WRITES this shape to `.devdigest/agents/<slug>.yaml`; the
 * agent-runner READS it. One Zod schema for both ends keeps the formats from
 * drifting. `skills` are slugs resolved to `.devdigest/skills/<slug>.md`.
 * `manifest_version` (= the agent's version) and `agent_id` are optional so a
 * manifest without them still validates.
 */
export const AgentManifest = z.object({
  name: z.string().min(1),
  provider: Provider.default('openrouter'),
  model: z.string().min(1),
  system_prompt: z.string(),
  // Tolerate both a missing key and an explicit `null` (YAML `skills:` with no
  // value parses to null, which `.default([])` does NOT catch).
  skills: z
    .array(z.string())
    .nullish()
    .transform((v) => v ?? []),
  strategy: z.enum(['auto', 'single-pass', 'map-reduce']).default('auto'),
  // CI gate policy — when the posted review should BLOCK (REQUEST_CHANGES +
  // fail the check) vs just comment. Default: block on critical.
  ci_fail_on: CiFailOn.default('critical'),
  manifest_version: z.number().int().positive().nullish(),
  agent_id: z.string().nullish(),
});
export type AgentManifest = z.infer<typeof AgentManifest>;
/** Caller-facing input type — `.default()` fields stay optional. */
export type AgentManifestInput = z.input<typeof AgentManifest>;

/** Request body for `POST /agents/:id/export-ci`. */
export const CiExportInput = z.object({
  repo: z.string().min(1), // "owner/name"
  target: CiTarget.default('gha'),
  /** Legacy; ignored by the server — `mode` replaces it. */
  action: z.enum(['open_pr', 'files']).default('open_pr'),
  post_as: CiPostAs.default('github_review'),
  triggers: z.array(CiTrigger).min(1).default(['opened', 'synchronize']),
  /** Legacy; ignored by the server — the base is the repo's default branch. */
  base: z.string().default('main'),
  mode: CiInstallMode.default('pr'),
  /** The workflow text as shown/edited in Preview; omitted = the generated one. */
  workflow: z.string().nullish(),
});
export type CiExportInput = z.infer<typeof CiExportInput>;
/** Caller-facing input type — `.default()` fields stay optional (web hooks). */
export type CiExportInputBody = z.input<typeof CiExportInput>;

/** Request body for `POST /agents/:id/ci/preview`. */
export const CiPreviewInput = z.object({
  repo: z.string().min(1), // "owner/name"
  target: CiTarget,
  triggers: z.array(CiTrigger).min(1),
  post_as: CiPostAs,
});
export type CiPreviewInput = z.infer<typeof CiPreviewInput>;

export const CiSecretCheck = z.object({
  name: z.string(),
  status: CiSecretStatus,
});
export type CiSecretCheck = z.infer<typeof CiSecretCheck>;

/** Structured note; the client renders the text (e.g. kind 'openrouter_id'). */
export const CiPreviewNote = z.object({
  kind: z.string(),
  id: z.string().nullish(),
});
export type CiPreviewNote = z.infer<typeof CiPreviewNote>;

/** Response of `POST /agents/:id/ci/preview`. */
export const CiPreview = z.object({
  files: z.array(CiFile),
  secrets: z.array(CiSecretCheck),
  notes: z.array(CiPreviewNote),
  agent_slug: z.string(),
  manifest_version: z.number().int(),
  install_block: CiInstallBlock.nullable(),
  /** Whether `devdigest/ci` already has an open PR (false when unknown). */
  pr_open: z.boolean(),
});
export type CiPreview = z.infer<typeof CiPreview>;

export const CiRunStatus = z.enum(['succeeded', 'failed', 'no_findings', 'running']);
export type CiRunStatus = z.infer<typeof CiRunStatus>;

/** A CI installation (mirrors `ci_installations`; `status` is derived). */
export const CiInstallation = z.object({
  id: z.string(),
  agent_id: z.string(),
  repo: z.string(),
  target_type: CiTarget,
  installed_at: z.string(),
  agent_slug: z.string(),
  mode: CiInstallMode,
  status: CiInstallationStatus,
  manifest_version: z.number().int(),
  post_as: CiPostAs,
  triggers: z.array(CiTrigger),
  pr_url: z.string().nullable(),
  removal_pr_url: z.string().nullable(),
  last_run_at: z.string().nullable(),
  last_run_status: CiRunStatus.nullable(),
});
export type CiInstallation = z.infer<typeof CiInstallation>;

/** Response of `POST /agents/:id/export-ci`. */
export const CiExport = z.object({
  installation: CiInstallation,
  files: z.array(CiFile),
  pr_url: z.string().nullable(),
});
export type CiExport = z.infer<typeof CiExport>;

/** Response of `POST /ci/installations/:id/remove`. */
export const CiRemoveResult = z.object({
  installation: CiInstallation.nullable(),
  pr_url: z.string().nullable(),
});
export type CiRemoveResult = z.infer<typeof CiRemoveResult>;

/** A CI run row (mirrors `ci_runs`) — ingested from GitHub Actions artifacts. */
export const CiRun = z.object({
  id: z.string(),
  ci_installation_id: z.string().nullable(),
  pr_number: z.number().int().nullable(),
  ran_at: z.string().nullable(),
  status: CiRunStatus.nullable(),
  findings_count: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  /** Same value as `job_url` (kept for back-compat). */
  github_url: z.string().nullable(),
  source: z.string().nullable(),
  agent: z.string().nullish(),
  duration_s: z.number().nullish(),
  repo: z.string().nullable(),
  pr_title: z.string().nullable(),
  verdict: Verdict.nullable(),
  critical: z.number().int().nullable(),
  warning: z.number().int().nullable(),
  suggestion: z.number().int().nullable(),
  /** GitHub Actions run URL; only https://github.com/ URLs are stored. */
  job_url: z.string().nullable(),
  agent_id: z.string().nullable(),
  agent_slug: z.string(),
  /** GitHub run id (bigint) as a string. */
  github_run_id: z.string(),
  duration_ms: z.number().int().nullable(),
  agent_run_id: z.string().nullable(),
});
export type CiRun = z.infer<typeof CiRun>;

/** Query of `GET /ci-runs` (querystring values arrive as strings). */
export const CiRunsQuery = z.object({
  agent: z.string().uuid().optional(),
  repo: z.string().min(1).optional(),
  status: CiRunStatus.optional(),
  source: z.enum(['ci']).optional(),
  since: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type CiRunsQuery = z.infer<typeof CiRunsQuery>;
/** Caller-facing input type — `.default()` fields stay optional. */
export type CiRunsQueryInput = z.input<typeof CiRunsQuery>;

/** Body of `POST /ci-runs/refresh` (the route accepts no body too). */
export const CiRefreshInput = z.object({
  agent_id: z.string().uuid().optional(),
});
export type CiRefreshInput = z.infer<typeof CiRefreshInput>;

/** Response of `POST /ci-runs/refresh`. */
export const CiRefreshResult = z.object({
  ingested: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  errors: z.array(z.object({ installation_id: z.string(), code: z.string() })),
});
export type CiRefreshResult = z.infer<typeof CiRefreshResult>;

/**
 * The runner's result file (`devdigest-result-<agent-slug>.json`), uploaded as
 * the artifact `devdigest-result-<agent-slug>` and ingested on refresh. The
 * artifact is UNTRUSTED on ingest: the server also requires `repo` and
 * `agent_slug` to match the installation (AC-23).
 */
export const CiResultArtifact = z.object({
  findings_count: z.number().int().nonnegative(),
  critical: z.number().int().nonnegative().nullish(),
  warning: z.number().int().nonnegative().nullish(),
  suggestion: z.number().int().nonnegative().nullish(),
  cost_usd: z.number().nonnegative().nullable(),
  duration_ms: z.number().int().nonnegative().nullish(),
  agent: z.string(),
  version: z.string().nullish(),
  pr_number: z.number().int().nullish(),
  verdict: Verdict.nullish(),
  blockers: z.number().int().nonnegative().nullish(),
  agent_slug: z.string().nullish(),
  agent_id: z.string().nullish(),
  manifest_version: z.number().int().positive().nullish(),
  provider: z.string().nullish(),
  model: z.string().nullish(),
  runner_version: z.string().nullish(),
  dependencies: z.object({ reviewer_core: z.string(), node: z.string() }).nullish(),
  commit_sha: z.string().nullish(),
  repo: z.string().nullish(), // "owner/name"
});
export type CiResultArtifact = z.infer<typeof CiResultArtifact>;

// ===========================================================================
// Conformance (PRD ↔ PR) — API record (the analysis shape is `Conformance`)
// ===========================================================================

/** Request body for `POST /pulls/:id/conformance`. */
export const ConformanceInput = z.object({
  /** Spec path/id to compare against; if omitted, the first available spec. */
  spec: z.string().nullish(),
  provider: z.enum(['openai', 'anthropic']).nullish(),
  model: z.string().nullish(),
});
export type ConformanceInput = z.infer<typeof ConformanceInput>;

/** A persisted conformance check (mirrors `conformance_checks` + the report). */
export const ConformanceReport = z.object({
  id: z.string(),
  pr_id: z.string(),
  report: Conformance,
});
export type ConformanceReport = z.infer<typeof ConformanceReport>;

// ===========================================================================
// Hooks (Secret-Leak + Phantom-API detectors) — emit grounding-exempt findings
// ===========================================================================

export const HookKind = z.enum(['secret_leak', 'phantom']);
export type HookKind = z.infer<typeof HookKind>;

/** Result of running the built-in detectors over a PR. */
export const HookScanResult = z.object({
  pr_id: z.string(),
  review_id: z.string().nullable(),
  findings: z.array(Finding),
});
export type HookScanResult = z.infer<typeof HookScanResult>;
