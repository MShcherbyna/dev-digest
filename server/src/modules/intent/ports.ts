/**
 * Application-layer ports of the intent module. Plain TS: no drizzle, fastify,
 * zod or SDK imports here — infrastructure (repository.ts, sources.ts,
 * factory.ts) implements them, the composition root wires them.
 */

export type Confidence = 'high' | 'medium' | 'low';
export type IntentTrigger = 'page_visit' | 'regenerate' | 'review_run';
export type DeriveMode = 'ifAbsent' | 'regenerate';
export type DeriveOutcome = 'existing' | 'derived' | 'reused';

export interface SourceRef {
  kind: 'title' | 'description' | 'branch' | 'commits' | 'files' | 'issue' | 'doc' | 'link';
  ref: string;
  status: 'used' | 'unfetched' | 'failed' | 'truncated';
}

/** The stored intent (what `pr_intent` holds). */
export interface IntentRecord {
  prId: string;
  intent: string;
  inScope: string[];
  outOfScope: string[];
  riskAreas: string[];
  confidence: Confidence;
  sources: SourceRef[];
  headSha: string | null;
  inputHash: string | null;
  trigger: IntentTrigger | null;
  provider: string | null;
  model: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  derivedAt: Date;
}

/** A stored intent plus the read-time staleness verdict. */
export interface PrIntent extends IntentRecord {
  stale: boolean;
}

/** The slice of a PR the intent module needs (structurally satisfied by the PR row). */
export interface IntentPull {
  id: string;
  number: number;
  title: string;
  branch: string;
  base: string;
  headSha: string;
  body: string | null;
}

export interface IntentRepoRef {
  owner: string;
  name: string;
}

export interface IntentPullWithRepo {
  pull: IntentPull;
  repo: IntentRepoRef;
}

export interface IntentStore {
  get(prId: string): Promise<IntentRecord | undefined>;
  /** First writer wins: returns the row that ended up stored (maybe someone else's). */
  insertIfAbsent(record: IntentRecord): Promise<IntentRecord>;
  upsert(record: IntentRecord): Promise<IntentRecord>;
}

/** Workspace-scoped PR reads the service needs (and the DB-side fallbacks for sources). */
export interface IntentPullReader {
  getPullWithRepo(workspaceId: string, prId: string): Promise<IntentPullWithRepo | undefined>;
  listPrFiles(prId: string): Promise<{ path: string; patch: string | null }[]>;
  listPrCommits(prId: string): Promise<{ message: string }[]>;
}

export interface GatheredDoc {
  path: string;
  content: string;
  truncated: boolean;
}

/** Everything the classifier reads, already capped. `refs` never contain content. */
export interface GatheredSources {
  title: string;
  body: string;
  issue: { number: number; title: string; body: string } | null;
  docs: GatheredDoc[];
  branch: string;
  commits: string[];
  paths: string[];
  refs: SourceRef[];
}

export interface GatherContext {
  pull: IntentPull;
  repo: IntentRepoRef;
  /** Changed paths already known to the caller (run path); used when no file list is stored. */
  changedPaths?: string[];
  /**
   * Try GitHub for fresh title/body/issue/commits/files (default true). The review
   * run sets false: it must not wait on the network, so it reads what is persisted.
   */
  fresh?: boolean;
}

export interface IntentSourcesPort {
  gather(ctx: GatherContext): Promise<GatheredSources>;
}

/** Progress/audit sink: the route wraps `req.log`, the run path wraps the RunLogger. */
export interface IntentLog {
  info(msg: string, data?: Record<string, unknown>): void;
  tool(msg: string, data?: Record<string, unknown>): void;
  /** Never surfaced as an error toast: the run path maps this to an info line. */
  warn(msg: string, data?: Record<string, unknown>): void;
}

export interface DeriveResult {
  intent: PrIntent;
  outcome: DeriveOutcome;
}

export type RunIntentOrigin = 'stored' | 'stored-stale' | 'derived';

/** What the reviews module consumes. Reached only through `container.intent`. */
export interface IntentDeriver {
  /** Pure read (workspace-scoped). */
  get(workspaceId: string, prId: string): Promise<PrIntent | null>;
  /** Throws `AppError('intent_failed')` when the classifier fails; keeps any stored row. */
  derive(workspaceId: string, prId: string, mode: DeriveMode, log: IntentLog): Promise<DeriveResult>;
  /** Run-time read-or-derive. NEVER throws; `undefined` → run without intent. */
  intentForRun(
    args: { workspaceId: string; pull: IntentPull; repo: IntentRepoRef; changedPaths?: string[] },
    log: IntentLog,
  ): Promise<{ intent: PrIntent; origin: RunIntentOrigin } | undefined>;
  toPromptIntent(intent: PrIntent): {
    summary: string;
    inScope: string[];
    outOfScope: string[];
    riskAreas: string[];
    confidence: Confidence;
  };
}
