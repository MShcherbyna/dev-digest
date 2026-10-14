/**
 * Application-layer ports of the eval module. Plain TS: no drizzle, fastify,
 * zod or SDK imports. Schema/shared types are type-only imports.
 */
import type { Finding, LLMProvider, UnifiedDiff } from '@devdigest/shared';
import type {
  CaseMeta,
  EvalAgentRun,
  EvalAgentRunDetail,
  EvalCase,
  EvalCaseResult,
  EvalCaseSummary,
  ExpectedOutput,
  RecentEvalRun,
} from './schemas.js';
import type { LineIndex } from './domain/case-diff.js';
import type { CaseRecord, RunAggregate } from './domain/scoring.js';

export type LlmProviderId = 'openai' | 'anthropic' | 'openrouter';

// ---- cases ------------------------------------------------------------------

export interface NewCase {
  agentId: string;
  name: string;
  origin: 'finding' | 'manual';
  inputDiff: string;
  inputMeta: CaseMeta;
  expectedOutput: ExpectedOutput;
  notes: string | null;
  sourceFindingId: string | null;
  sourcePrId: string | null;
}

export interface CaseUpdate {
  name: string;
  inputDiff: string;
  inputMeta: CaseMeta;
  expectedOutput: ExpectedOutput;
  notes: string | null;
}

/** A case as the executor needs it (creation order). */
export interface RunnableCase {
  id: string;
  name: string;
  inputDiff: string;
  inputMeta: CaseMeta;
  expectedOutput: ExpectedOutput;
}

export type InsertCaseResult =
  | { kind: 'created'; case: EvalCase }
  | { kind: 'exists'; caseId: string };

export interface EvalCaseStore {
  insertCase(workspaceId: string, input: NewCase): Promise<InsertCaseResult>;
  /** Keeps `origin` and the source links; bumps `updated_at`. */
  updateCase(workspaceId: string, caseId: string, input: CaseUpdate): Promise<EvalCase | undefined>;
  getCase(workspaceId: string, caseId: string): Promise<EvalCase | undefined>;
  /** Newest first, latest result per case in one query. */
  listCases(workspaceId: string, agentId: string): Promise<EvalCaseSummary[]>;
  countCases(workspaceId: string, agentId: string): Promise<number>;
  /** Cases in creation order for a run. */
  runnableCases(workspaceId: string, agentId: string): Promise<RunnableCase[]>;
  /** Id of the existing case for (agent, finding), if any. */
  caseIdForFinding(workspaceId: string, agentId: string, findingId: string): Promise<string | null>;
  deleteCase(workspaceId: string, caseId: string): Promise<boolean>;
}

// ---- runs -------------------------------------------------------------------

export interface AgentSnapshot {
  agentVersion: number;
  provider: LlmProviderId;
  model: string;
  strategy: string;
  systemPrompt: string;
  skillIds: string[];
}

/** Everything persisted for one finished (or errored) per-case result. */
export interface CaseOutcome extends CaseRecord {
  expectedCount: number;
  gotCount: number;
  /** Grounded findings JSON; null for errored cases. */
  actualOutput: Finding[] | null;
  durationMs: number;
  errorReason: string | null;
}

export type StartCaseResult =
  | { kind: 'started'; resultId: string }
  | { kind: 'running'; resultId: string };

export type InsertRunResult =
  | { kind: 'created'; runId: string }
  | { kind: 'active_exists'; runId: string | null };

export interface RunFinalization extends RunAggregate {
  reason: string | null;
  durationMs: number;
}

export interface EvalRunStore {
  /** Inserts a `running` single-case result; reports the existing one on conflict. */
  startCaseResult(workspaceId: string, caseId: string): Promise<StartCaseResult>;
  /** Finishes a single-case result row. Returns false if the row/case is gone. */
  finishCaseResult(resultId: string, outcome: CaseOutcome): Promise<boolean>;

  insertAgentRun(
    workspaceId: string,
    agentId: string,
    snapshot: AgentSnapshot,
    casesTotal: number,
  ): Promise<InsertRunResult>;
  getAgentRun(workspaceId: string, runId: string): Promise<EvalAgentRunDetail | undefined>;
  /** Run row + per-case results (with case names) for `GET /eval-runs/:id`. */
  listRunResults(
    workspaceId: string,
    runId: string,
  ): Promise<(EvalCaseResult & { case_name: string | null })[]>;
  listAgentRuns(workspaceId: string, agentId: string, since?: Date): Promise<EvalAgentRun[]>;
  /** Id of the agent's active run, if any. */
  activeRunId(workspaceId: string, agentId: string): Promise<string | null>;
  /** True while the run row still exists (it is deleted with its agent). */
  runExists(runId: string): Promise<boolean>;
  /**
   * Records one finished per-case row and bumps the run counters atomically.
   * Returns false when the run no longer exists (agent deleted). When the case
   * itself was deleted mid-run no result row can be stored (FK), so only the
   * counters move.
   */
  recordCaseResult(runId: string, caseId: string, outcome: CaseOutcome): Promise<boolean>;
  /** Writes final metrics + status in one transaction. Returns false if the run is gone. */
  finalizeRun(runId: string, fin: RunFinalization): Promise<boolean>;
  /** Fails stale `running` runs and errors stale `running` results. */
  reapStale(): Promise<{ runs: number; results: number }>;
}

// ---- finding source (read-only) ---------------------------------------------

export interface FindingCaseSource {
  findingId: string;
  file: string;
  startLine: number;
  endLine: number;
  severity: string;
  category: string;
  title: string;
  kind: string | null;
  acceptedAt: Date | null;
  dismissedAt: Date | null;
  /** The review's agent id, or null when the review has none. */
  agentId: string | null;
  agentExists: boolean;
  prId: string;
  prTitle: string;
  prBody: string | null;
  /** Stored patch of the finding's file, or null when absent. */
  patch: string | null;
}

export interface FindingSource {
  /** Workspace-scoped; `undefined` for an unknown or foreign finding. */
  findingForCase(workspaceId: string, findingId: string): Promise<FindingCaseSource | undefined>;
}

// ---- agents (via the container) ---------------------------------------------

export interface EvalAgent {
  id: string;
  name: string;
  enabled: boolean;
  version: number;
  provider: LlmProviderId;
  model: string;
  strategy: string;
  systemPrompt: string;
}

export interface AgentSource {
  /** All agents of the workspace (used by "run all"). */
  list(workspaceId: string): Promise<EvalAgent[]>;
  get(workspaceId: string, agentId: string): Promise<EvalAgent | undefined>;
  /** Skill ids that reach the prompt (link enabled AND skill enabled). */
  enabledSkillIds(agentId: string): Promise<string[]>;
}

// ---- dashboard (read-only) ----------------------------------------------------

/** One agent with at least one eval case, with what the all-agents cards need. */
export interface DashboardAgentRow {
  id: string;
  name: string;
  provider: string;
  model: string;
  enabled: boolean;
  casesTotal: number;
  hasRunningRun: boolean;
  /** Up to 10 latest finished (`done|partial`) runs, newest first. */
  finishedRuns: EvalAgentRun[];
}

export interface EvalDashboardStore {
  /** Agents with >= 1 case, a fixed small number of queries regardless of agent count. */
  dashboardAgents(workspaceId: string): Promise<DashboardAgentRow[]>;
  /** Latest finished runs across agents, newest first, joined to agent names. */
  recentFinishedRuns(workspaceId: string, limit: number): Promise<RecentEvalRun[]>;
}

/** Whether a run's agent version is still reachable and equals the agent's live config. */
export interface AgentConfigs {
  isCurrentConfig(
    workspaceId: string,
    agentId: string,
    version: number,
  ): Promise<{ available: boolean; current: boolean }>;
}

// ---- engine + helpers --------------------------------------------------------

export interface ReviewEngineInput {
  systemPrompt: string;
  model: string;
  diff: UnifiedDiff;
  llm: LLMProvider;
  strategy: string;
  task: string;
  prDescription?: string;
  sessionId: string;
}

export interface ReviewEngineResult {
  kept: Finding[];
  dropped: number;
  costUsd: number | null;
}

export type ReviewEngine = (input: ReviewEngineInput) => Promise<ReviewEngineResult>;
export type DiffParser = (raw: string) => UnifiedDiff;
export type LineIndexer = (diff: UnifiedDiff) => LineIndex;
export type TaskLineBuilder = (input: { title: string }) => string;
export type LlmResolver = (provider: LlmProviderId) => Promise<LLMProvider>;

/** Logger for runs; never receives diff, PR body, prompt or finding text. */
export interface EvalLog {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
}

export interface EvalDeps {
  cases: EvalCaseStore;
  runs: EvalRunStore;
  findings: FindingSource;
  agents: AgentSource;
  dashboard: EvalDashboardStore;
  configs: AgentConfigs;
  engine: ReviewEngine;
  parseDiff: DiffParser;
  lineIndex: LineIndexer;
  isFullFileKind: (kind?: string | null) => boolean;
  taskLine: TaskLineBuilder;
  llm: LlmResolver;
  /** Distinguishes a missing-key failure from an ordinary error without importing the platform error type. */
  isConfigError: (err: unknown) => boolean;
  now?: () => Date;
}
