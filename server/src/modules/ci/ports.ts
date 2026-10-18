import type {
  AgentManifest,
  CiInstallMode,
  CiPostAs,
  CiRun,
  CiRunStatus,
  CiRunsQuery,
  CiSecretStatus,
  CiTarget,
  CiTrigger,
  RunTrace,
} from '@devdigest/shared';

/**
 * Ports of the ci module (application layer). Implemented by adapters
 * (`adapters/github/ci.ts`, `adapters/runner-bundle/fs.ts`) and the repository.
 * No SDK or DB types appear here.
 */

// ------------------------------------------------------------------ GitHub

export type CiGitHubErrorKind = 'permission' | 'auth' | 'rate_limited' | 'network' | 'unexpected';
export type CiGitHubPermission = 'contents' | 'pull_requests' | 'workflows' | 'actions';

/** Every CiGitHub failure; the adapter classifies, the service maps it to an HTTP error. */
export class CiGitHubError extends Error {
  constructor(
    public readonly kind: CiGitHubErrorKind,
    message: string,
    public readonly permission?: CiGitHubPermission,
  ) {
    super(message);
    this.name = 'CiGitHubError';
  }
}

export interface BranchHead {
  commitSha: string;
  treeSha: string;
}

export interface CiCommitInput {
  branch: string;
  parent: BranchHead;
  /** true = create the branch from `parent`; false = fast-forward the existing branch. */
  createBranch: boolean;
  message: string;
  upserts: { path: string; contents: string }[];
  deletes: string[];
}

export interface CiPr {
  url: string;
  number: number;
}

export type CiPrState = 'open' | 'merged' | 'closed';

export interface CiWorkflowRun {
  id: number;
  status: string;
  conclusion: string | null;
  htmlUrl: string;
  headSha: string;
  createdAt: string;
  displayTitle: string | null;
  prNumber: number | null;
  headRepoIsFork: boolean;
}

export interface CiArtifactRef {
  id: number;
  sizeBytes: number;
  expired: boolean;
}

export type CiArtifactDownload =
  | { kind: 'ok'; text: string }
  | { kind: 'expired' }
  | { kind: 'too_large' };

export interface CiGitHub {
  getBranchHead(repo: string, branch: string): Promise<BranchHead | null>;
  /** Blob paths of a tree, recursive. */
  listTreePaths(repo: string, treeSha: string): Promise<Set<string>>;
  readFile(repo: string, ref: string, path: string): Promise<string | null>;
  /** 200 -> ready, 404 -> not_set, anything else -> unknown. Never throws, never reads the value. */
  secretStatus(repo: string, name: string): Promise<CiSecretStatus>;
  commit(repo: string, input: CiCommitInput): Promise<{ commitSha: string }>;
  findOpenPr(repo: string, headBranch: string): Promise<CiPr | null>;
  openPr(repo: string, input: { title: string; head: string; base: string; body: string }): Promise<CiPr>;
  prState(repo: string, number: number): Promise<CiPrState>;
  listWorkflowRuns(repo: string, workflowFile: string, sinceIso: string, limit: number): Promise<CiWorkflowRun[]>;
  findArtifact(repo: string, runId: number, name: string): Promise<CiArtifactRef | null>;
  downloadArtifactJson(repo: string, artifactId: number, maxBytes: number): Promise<CiArtifactDownload>;
}

// ------------------------------------------------------------------ Agents / bundle / log

export interface CiAgent {
  id: string;
  name: string;
  provider: 'openai' | 'anthropic' | 'openrouter';
  model: string;
  systemPrompt: string;
  strategy: AgentManifest['strategy'];
  ciFailOn: AgentManifest['ci_fail_on'];
  version: number;
}

export interface CiSkill {
  id: string;
  name: string;
  body: string;
}

/** Narrow view of the agents module: only what the generator needs. */
export interface AgentSource {
  get(workspaceId: string, agentId: string): Promise<CiAgent | undefined>;
  /** Skills enabled on the link and globally, in link order. */
  enabledSkills(agentId: string): Promise<CiSkill[]>;
}

export interface RunnerBundle {
  /** The built agent-runner `index.js`. Throws `AppError('runner_bundle_missing')` when absent. */
  read(): Promise<string>;
}

export interface CiLog {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
}

// ------------------------------------------------------------------ Store

export interface RepoRecord {
  id: string;
  fullName: string;
  defaultBranch: string;
}

export interface MemoryExportItem {
  kind: string;
  scope: 'global' | 'repo';
  content: string;
}

/** A stored installation plus the owning agent's current name/version (status is derived from them). */
export interface InstallationRecord {
  id: string;
  agentId: string;
  agentName: string;
  agentVersion: number;
  repo: string;
  targetType: CiTarget;
  installedAt: Date;
  agentSlug: string;
  mode: CiInstallMode;
  manifestVersion: number;
  postAs: CiPostAs;
  triggers: CiTrigger[];
  skillSlugs: string[];
  prUrl: string | null;
  removalPrUrl: string | null;
  lastRunAt: Date | null;
  lastRunStatus: CiRunStatus | null;
}

export interface InstallationUpsert {
  agentId: string;
  repo: string;
  agentSlug: string;
  mode: CiInstallMode;
  manifestVersion: number;
  postAs: CiPostAs;
  triggers: CiTrigger[];
  skillSlugs: string[];
  prUrl: string | null;
}

export interface NewCiRun {
  githubRunId: number;
  agentSlug: string;
  agentId: string;
  agentName: string;
  repo: string;
  prNumber: number | null;
  prTitle: string | null;
  ranAt: Date;
  status: CiRunStatus;
  findingsCount: number | null;
  costUsd: number | null;
  /** https://github.com/ run URL, or null when the allow-list rejected it. */
  jobUrl: string | null;
  verdict: string | null;
  critical: number | null;
  warning: number | null;
  suggestion: number | null;
  blockers: number | null;
  durationMs: number | null;
}

export interface NewAgentRun {
  prId: string | null;
  ranAt: Date;
  provider: string | null;
  model: string | null;
  durationMs: number | null;
  costUsd: number | null;
  status: 'done' | 'failed';
  error: string | null;
  findingsCount: number | null;
  blockers: number | null;
}

export interface IngestWrite {
  workspaceId: string;
  installationId: string;
  ciRun: NewCiRun;
  /** Omitted for a still-running CI run (no agent_runs row yet). */
  agentRun?: NewAgentRun;
  trace?: RunTrace;
}

export interface StoredRunRef {
  id: string;
  agentRunId: string | null;
  status: CiRunStatus | null;
}

export interface LocalPr {
  id: string;
  title: string;
}

export interface CiStore {
  repoForWorkspace(workspaceId: string, fullName: string): Promise<RepoRecord | undefined>;
  memoryForExport(workspaceId: string, repoId: string): Promise<MemoryExportItem[]>;

  listInstallationsByAgent(workspaceId: string, agentId: string): Promise<InstallationRecord[]>;
  listInstallationsByRepo(workspaceId: string, repo: string): Promise<InstallationRecord[]>;
  /** All GitHub Actions installations of the workspace, optionally of one agent. */
  listInstallations(workspaceId: string, agentId?: string): Promise<InstallationRecord[]>;
  getInstallation(workspaceId: string, id: string): Promise<InstallationRecord | undefined>;
  upsertInstallation(workspaceId: string, input: InstallationUpsert): Promise<InstallationRecord>;
  setRemovalPr(id: string, url: string): Promise<void>;
  clearRemovalPr(id: string): Promise<void>;
  deleteInstallation(id: string): Promise<void>;
  setLastRun(id: string, at: Date, status: CiRunStatus): Promise<void>;

  listRuns(workspaceId: string, query: CiRunsQuery): Promise<CiRun[]>;
  oldestRunningRunAt(installationId: string): Promise<Date | null>;
  lastTerminalRunAt(installationId: string): Promise<Date | null>;
  findRun(workspaceId: string, githubRunId: number, agentSlug: string): Promise<StoredRunRef | undefined>;
  prFor(workspaceId: string, repo: string, prNumber: number): Promise<LocalPr | undefined>;
  /** One transaction: agent_runs + run_traces (only when the ci_run has none yet) + ci_runs upsert. */
  ingestRun(write: IngestWrite): Promise<void>;
}
