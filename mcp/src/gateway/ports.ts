/**
 * Application-layer port: MCP-owned record types and the gateway interface the
 * tools depend on. Nothing here knows the HTTP wire format; the adapter
 * (http-gateway.ts) maps API responses onto these types, so API drift stops there.
 */

export type RunStatus = 'running' | 'done' | 'failed' | 'cancelled';
export type FindingSeverity = 'CRITICAL' | 'WARNING' | 'SUGGESTION';

export interface AgentRecord {
  id: string;
  name: string;
  description: string;
  provider: string;
  model: string;
  enabled: boolean;
}

export interface RepoRecord {
  id: string;
  owner: string;
  name: string;
  fullName: string;
}

export interface PullRecord {
  id: string;
  number: number;
  title: string;
}

export interface RunRecord {
  runId: string;
  agentId: string | null;
  agentName: string | null;
  status: RunStatus;
  error: string | null;
  score: number | null;
}

export interface ActiveRunRecord {
  runId: string;
  agentId: string | null;
}

export interface FindingRecord {
  id: string;
  severity: FindingSeverity;
  category: string;
  title: string;
  file: string;
  startLine: number;
  endLine: number;
  rationale: string;
  suggestion: string | null;
  confidence: number;
}

export interface ReviewRecord {
  id: string;
  runId: string | null;
  agentId: string | null;
  agentName: string | null;
  verdict: string | null;
  summary: string | null;
  score: number | null;
  findings: FindingRecord[];
}

export interface ConventionRecord {
  id: string;
  rule: string;
  evidencePath: string;
  evidenceSnippet: string;
  evidenceLine: number | null;
  confidence: number;
  accepted: boolean;
}

export interface BlastCallerRecord {
  name: string;
  file: string;
  line: number;
}

export interface BlastGroupRecord {
  symbol: string;
  callers: BlastCallerRecord[];
  endpoints: string[];
  crons: string[];
}

/** The server's blast map, as served (grouped, ranked, per-symbol capped; no recomputation here). */
export interface BlastRecord {
  changedSymbols: { name: string; file: string; kind: string }[];
  downstream: BlastGroupRecord[];
  summary: string;
  degraded: boolean;
  /** Server-side reason string; kept open so a new server reason does not break MCP. */
  reason: string | null;
  /** Commit the index (and every caller line) was built from. */
  refSha: string | null;
}

/** What the tools need from DevDigest. Implemented by HttpGateway (and in-memory fakes in tests). */
export interface DevDigestGateway {
  listAgents(): Promise<AgentRecord[]>;
  findRepo(fullName: string): Promise<RepoRecord | null>;
  findPull(repoId: string, number: number): Promise<PullRecord | null>;
  activeRuns(prId: string): Promise<ActiveRunRecord[]>;
  startReview(prId: string, agentId: string): Promise<{ runId: string }>;
  listRuns(prId: string): Promise<RunRecord[]>;
  reviewsForPull(prId: string): Promise<ReviewRecord[]>;
  conventions(repoId: string): Promise<{ headSha: string; items: ConventionRecord[] }>;
  /** GET /pulls/:id/blast — the precomputed blast map (no analysis, no LLM). */
  getBlastRadius(prId: string): Promise<BlastRecord>;
}
