import type { AgentColumnFindingView } from './schemas.js';
import type { Limiter } from '../../platform/limiter.js';

/**
 * Application-layer ports of the multi-agent-run module. Plain TS, no
 * infrastructure imports (onion-architecture). The service depends only on
 * these narrow interfaces, never on `Container` or a concrete repository.
 */

/** One child `agent_runs` row as the service needs it, mapped — never a raw
 * Drizzle row (`$inferSelect`) leaking out of the repository). */
export interface MultiRunChildRow {
  runId: string;
  agentId: string | null;
  agentName: string | null;
  provider: string | null;
  model: string | null;
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
  verdict: string | null;
  score: number | null;
  summary: string | null;
  durationMs: number | null;
  costUsd: number | null;
  ranAt: Date | null;
  createdOrder: number;
  findings: AgentColumnFindingView[];
}

export interface MultiRunRow {
  id: string;
  workspaceId: string;
  prId: string;
  prNumber: number | null;
  ranAt: Date;
  requestedAgentIds: string[];
  cancelledAt: Date | null;
}

/** Persistence port for the multi-agent-run module's own data + the shared
 * `agent_runs`/`reviews`/`findings` tables it reads (allowed by the
 * architecture constraints: this module may query those tables directly). */
export interface MultiRunStore {
  /**
   * Create the parent + one child `agent_runs` row per requested agent, in
   * one transaction, locking the PR row first (AC-37's 409 guard). The first
   * `concurrency_limit` children are created `running`; the rest `queued`.
   */
  createWithChildren(input: {
    workspaceId: string;
    prId: string;
    agentIds: string[];
    concurrencyLimit: number;
  }): Promise<{ run: MultiRunRow } | { conflict: true }>;

  getById(workspaceId: string, id: string): Promise<MultiRunRow | undefined>;

  latestForPull(workspaceId: string, prId: string): Promise<MultiRunRow | undefined>;

  /** Every child (any status, any attempt) of a multi-run, with its findings. */
  childrenWithFindings(id: string): Promise<MultiRunChildRow[]>;

  /** Mark the whole run cancelled; returns the ids of children that were not
   * already terminal (for the caller to cancel through `ReviewRunPort`). */
  markCancelled(id: string): Promise<string[]>;

  /** Insert a new attempt for `agentId` under the same parent — `queued`
   * unless the parent is already cancelled, in which case `cancelled` (Q-10). */
  insertRetryChild(
    parentId: string,
    agent: { id: string; provider: string | null; model: string | null },
  ): Promise<{ runId: string; status: 'queued' | 'cancelled' }>;

  /** `requested_agent_ids` of the newest multi-run on any PR of this repo (Q-6). */
  lastSelectionForRepo(workspaceId: string, repoId: string): Promise<string[] | undefined>;
}

/** The reviews module's execution + cancellation, reached only through this
 * port (architecture constraint: multi-agent-run must not import
 * `reviews/repository*` or `reviews/run-executor.ts`). */
export interface ReviewRunPort {
  /** Fire-and-forget background execution of the given jobs, bounded by `limiter`. */
  execute(input: {
    workspaceId: string;
    prId: string;
    jobs: { agentId: string; runId: string }[];
    limiter: Limiter;
  }): void;

  /** Cancel one in-flight (running or queued) child run. */
  cancel(runId: string): Promise<void>;
}

/** Read-only view of the workspace's agent catalog (enabled agents + lookup). */
export interface AgentCatalog {
  listEnabled(
    workspaceId: string,
  ): Promise<{ id: string; name: string; provider: string | null; model: string | null }[]>;
}

/** PR/repo lookups + the workspace-ownership check every new route needs. */
export interface PullLookup {
  getPull(
    workspaceId: string,
    prId: string,
  ): Promise<{ id: string; number: number; repoId: string } | undefined>;
  repoInWorkspace(workspaceId: string, repoId: string): Promise<boolean>;
}
