import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type {
  AgentSnapshot,
  CaseOutcome,
  CaseUpdate,
  EvalCaseStore,
  EvalRunStore,
  FindingCaseSource,
  FindingSource,
  InsertCaseResult,
  DashboardAgentRow,
  EvalDashboardStore,
  InsertRunResult,
  NewCase,
  RunFinalization,
  RunnableCase,
  StartCaseResult,
} from './ports.js';
import type {
  CaseMeta,
  EvalAgentRun,
  EvalAgentRunDetail,
  EvalAgentRunStatus,
  EvalCase,
  EvalCaseResult,
  EvalCaseStatus,
  EvalCaseSummary,
  ExpectedOutput,
  RecentEvalRun,
} from './schemas.js';
import { EVAL_REASON } from './constants.js';
import { caseMetrics } from './domain/scoring.js';

/**
 * Eval data access. Implements the eval ports plus `EvalCaseLinks` (consumed by
 * the reviews module through the container). Workspace scoping: cases and
 * agent-level runs carry `workspace_id`; per-case results are reached through
 * their (scoped) case or run. Reads `findings`/`reviews`/`pull_requests`/
 * `pr_files`/`agents` read-only for the finding source.
 */

type CaseRow = typeof t.evalCases.$inferSelect;
type ResultRow = typeof t.evalRuns.$inferSelect;
type AgentRunRow = typeof t.evalAgentRuns.$inferSelect;

const NO_META: CaseMeta = { title: '', body: '' };

function iso(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

/** Postgres unique violation (SQLSTATE 23505), also when the driver error is wrapped in `cause`. */
function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === '23505' || e?.cause?.code === '23505';
}

function toResult(row: ResultRow): EvalCaseResult {
  return {
    id: row.id,
    case_id: row.caseId,
    eval_run_id: row.evalAgentRunId,
    status: row.status as EvalCaseStatus,
    ran_at: row.ranAt.toISOString(),
    finished_at: iso(row.finishedAt),
    expected_count: row.expectedCount,
    got_count: row.gotCount,
    kept_count: row.keptCount,
    dropped_count: row.droppedCount,
    duration_ms: row.durationMs,
    cost_usd: row.costUsd,
    error_reason: row.errorReason,
  };
}

function toSummary(row: CaseRow, latest: ResultRow | undefined): EvalCaseSummary {
  return {
    id: row.id,
    agent_id: row.ownerId,
    name: row.name,
    origin: row.origin,
    input_meta: (row.inputMeta as CaseMeta | null) ?? NO_META,
    expected_output: (row.expectedOutput as ExpectedOutput | null) ?? [],
    notes: row.notes,
    source_finding_id: row.sourceFindingId,
    source_pr_id: row.sourcePrId,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    latest_result: latest ? toResult(latest) : null,
  };
}

function toCase(row: CaseRow, latest: ResultRow | undefined): EvalCase {
  return { ...toSummary(row, latest), input_diff: row.inputDiff ?? '' };
}

function toAgentRun(row: AgentRunRow): EvalAgentRun {
  return {
    id: row.id,
    agent_id: row.agentId,
    agent_version: row.agentVersion,
    provider: row.provider,
    model: row.model,
    strategy: row.strategy,
    skill_ids: row.skillIds,
    status: row.status as EvalAgentRunStatus,
    reason: row.reason,
    started_at: row.startedAt.toISOString(),
    finished_at: iso(row.finishedAt),
    cases_total: row.casesTotal,
    cases_executed: row.casesExecuted,
    cases_errored: row.casesErrored,
    cases_passed: row.casesPassed,
    recall: row.recall,
    precision: row.precision,
    citation_accuracy: row.citationAccuracy,
    cost_usd: row.costUsd,
    duration_ms: row.durationMs,
  };
}

function resultValues(outcome: CaseOutcome) {
  const m = caseMetrics(outcome);
  return {
    status: (outcome.errored ? 'error' : outcome.pass ? 'passed' : 'failed') as EvalCaseStatus,
    finishedAt: new Date(),
    errorReason: outcome.errorReason,
    actualOutput: outcome.actualOutput,
    pass: outcome.errored ? null : outcome.pass,
    recall: outcome.errored ? null : m.recall,
    precision: outcome.errored ? null : m.precision,
    citationAccuracy: outcome.errored ? null : m.citationAccuracy,
    durationMs: outcome.durationMs,
    costUsd: outcome.costUsd,
    expectedCount: outcome.expectedCount,
    gotCount: outcome.gotCount,
    keptCount: outcome.keptCount,
    droppedCount: outcome.droppedCount,
    mustFindTotal: outcome.mustFindTotal,
    mustFindMatched: outcome.mustFindMatched,
    positiveFindings: outcome.positiveFindings,
    negativeFindings: outcome.negativeFindings,
  };
}

export class EvalRepository implements EvalCaseStore, EvalRunStore, FindingSource, EvalDashboardStore {
  constructor(private db: Db) {}

  // ---- cases ----------------------------------------------------------------

  private ownedCase(workspaceId: string, caseId: string) {
    return and(
      eq(t.evalCases.workspaceId, workspaceId),
      eq(t.evalCases.ownerKind, 'agent'),
      eq(t.evalCases.id, caseId),
    );
  }

  private async latestResults(caseIds: string[]): Promise<Map<string, ResultRow>> {
    if (caseIds.length === 0) return new Map();
    const rows = await this.db
      .selectDistinctOn([t.evalRuns.caseId])
      .from(t.evalRuns)
      .where(inArray(t.evalRuns.caseId, caseIds))
      .orderBy(t.evalRuns.caseId, desc(t.evalRuns.ranAt));
    return new Map(rows.map((r) => [r.caseId, r]));
  }

  async insertCase(workspaceId: string, input: NewCase): Promise<InsertCaseResult> {
    try {
      const [row] = await this.db
        .insert(t.evalCases)
        .values({
          workspaceId,
          ownerKind: 'agent',
          ownerId: input.agentId,
          name: input.name,
          origin: input.origin,
          inputDiff: input.inputDiff,
          inputMeta: input.inputMeta,
          expectedOutput: input.expectedOutput,
          notes: input.notes,
          sourceFindingId: input.sourceFindingId,
          sourcePrId: input.sourcePrId,
        })
        .returning();
      return { kind: 'created', case: toCase(row!, undefined) };
    } catch (err) {
      if (!isUniqueViolation(err) || !input.sourceFindingId) throw err;
      const existing = await this.caseIdForFinding(workspaceId, input.agentId, input.sourceFindingId);
      if (!existing) throw err;
      return { kind: 'exists', caseId: existing };
    }
  }

  async updateCase(workspaceId: string, caseId: string, input: CaseUpdate): Promise<EvalCase | undefined> {
    const [row] = await this.db
      .update(t.evalCases)
      .set({
        name: input.name,
        inputDiff: input.inputDiff,
        inputMeta: input.inputMeta,
        expectedOutput: input.expectedOutput,
        notes: input.notes,
        updatedAt: new Date(),
      })
      .where(this.ownedCase(workspaceId, caseId))
      .returning();
    if (!row) return undefined;
    const latest = await this.latestResults([row.id]);
    return toCase(row, latest.get(row.id));
  }

  async getCase(workspaceId: string, caseId: string): Promise<EvalCase | undefined> {
    const [row] = await this.db.select().from(t.evalCases).where(this.ownedCase(workspaceId, caseId));
    if (!row) return undefined;
    const latest = await this.latestResults([row.id]);
    return toCase(row, latest.get(row.id));
  }

  async listCases(workspaceId: string, agentId: string): Promise<EvalCaseSummary[]> {
    const rows = await this.db
      .select()
      .from(t.evalCases)
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.ownerKind, 'agent'),
          eq(t.evalCases.ownerId, agentId),
        ),
      )
      .orderBy(desc(t.evalCases.createdAt), desc(t.evalCases.id));
    const latest = await this.latestResults(rows.map((r) => r.id));
    return rows.map((r) => toSummary(r, latest.get(r.id)));
  }

  async countCases(workspaceId: string, agentId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(t.evalCases)
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.ownerKind, 'agent'),
          eq(t.evalCases.ownerId, agentId),
        ),
      );
    return row?.n ?? 0;
  }

  async runnableCases(workspaceId: string, agentId: string): Promise<RunnableCase[]> {
    const rows = await this.db
      .select()
      .from(t.evalCases)
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.ownerKind, 'agent'),
          eq(t.evalCases.ownerId, agentId),
        ),
      )
      .orderBy(asc(t.evalCases.createdAt), asc(t.evalCases.id));
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      inputDiff: r.inputDiff ?? '',
      inputMeta: (r.inputMeta as CaseMeta | null) ?? NO_META,
      expectedOutput: (r.expectedOutput as ExpectedOutput | null) ?? [],
    }));
  }

  async caseIdForFinding(workspaceId: string, agentId: string, findingId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ id: t.evalCases.id })
      .from(t.evalCases)
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.ownerKind, 'agent'),
          eq(t.evalCases.ownerId, agentId),
          eq(t.evalCases.sourceFindingId, findingId),
        ),
      );
    return row?.id ?? null;
  }

  async deleteCase(workspaceId: string, caseId: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.evalCases)
      .where(this.ownedCase(workspaceId, caseId))
      .returning({ id: t.evalCases.id });
    return rows.length > 0;
  }

  /** `EvalCaseLinks` (reviews port): finding id -> case id, workspace-scoped, one query. */
  async caseIdsForFindings(workspaceId: string, findingIds: string[]): Promise<Map<string, string>> {
    if (findingIds.length === 0) return new Map();
    const rows = await this.db
      .select({ id: t.evalCases.id, findingId: t.evalCases.sourceFindingId })
      .from(t.evalCases)
      .where(
        and(eq(t.evalCases.workspaceId, workspaceId), inArray(t.evalCases.sourceFindingId, findingIds)),
      );
    const map = new Map<string, string>();
    for (const r of rows) if (r.findingId && !map.has(r.findingId)) map.set(r.findingId, r.id);
    return map;
  }

  // ---- single-case results ----------------------------------------------------

  async startCaseResult(workspaceId: string, caseId: string): Promise<StartCaseResult> {
    void workspaceId; // scope already enforced by the service via getCase()
    try {
      const [row] = await this.db.insert(t.evalRuns).values({ caseId, status: 'running' }).returning({ id: t.evalRuns.id });
      return { kind: 'started', resultId: row!.id };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      const [running] = await this.db
        .select({ id: t.evalRuns.id })
        .from(t.evalRuns)
        .where(
          and(
            eq(t.evalRuns.caseId, caseId),
            eq(t.evalRuns.status, 'running'),
            sql`${t.evalRuns.evalAgentRunId} IS NULL`,
          ),
        );
      if (!running) throw err;
      return { kind: 'running', resultId: running.id };
    }
  }

  async finishCaseResult(resultId: string, outcome: CaseOutcome): Promise<boolean> {
    const rows = await this.db
      .update(t.evalRuns)
      .set(resultValues(outcome))
      .where(eq(t.evalRuns.id, resultId))
      .returning({ id: t.evalRuns.id });
    return rows.length > 0;
  }

  // ---- agent-level runs ---------------------------------------------------------

  async insertAgentRun(
    workspaceId: string,
    agentId: string,
    snapshot: AgentSnapshot,
    casesTotal: number,
  ): Promise<InsertRunResult> {
    try {
      const [row] = await this.db
        .insert(t.evalAgentRuns)
        .values({
          workspaceId,
          agentId,
          agentVersion: snapshot.agentVersion,
          provider: snapshot.provider,
          model: snapshot.model,
          strategy: snapshot.strategy,
          systemPrompt: snapshot.systemPrompt,
          skillIds: snapshot.skillIds,
          status: 'running',
          casesTotal,
        })
        .returning({ id: t.evalAgentRuns.id });
      return { kind: 'created', runId: row!.id };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      return { kind: 'active_exists', runId: await this.activeRunId(workspaceId, agentId) };
    }
  }

  async activeRunId(workspaceId: string, agentId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ id: t.evalAgentRuns.id })
      .from(t.evalAgentRuns)
      .where(
        and(
          eq(t.evalAgentRuns.workspaceId, workspaceId),
          eq(t.evalAgentRuns.agentId, agentId),
          eq(t.evalAgentRuns.status, 'running'),
        ),
      );
    return row?.id ?? null;
  }

  async getAgentRun(workspaceId: string, runId: string): Promise<EvalAgentRunDetail | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalAgentRuns)
      .where(and(eq(t.evalAgentRuns.workspaceId, workspaceId), eq(t.evalAgentRuns.id, runId)));
    return row ? { ...toAgentRun(row), system_prompt: row.systemPrompt } : undefined;
  }

  async listRunResults(
    workspaceId: string,
    runId: string,
  ): Promise<(EvalCaseResult & { case_name: string | null })[]> {
    const rows = await this.db
      .select({ result: t.evalRuns, caseName: t.evalCases.name })
      .from(t.evalRuns)
      .innerJoin(t.evalAgentRuns, eq(t.evalRuns.evalAgentRunId, t.evalAgentRuns.id))
      .leftJoin(t.evalCases, eq(t.evalRuns.caseId, t.evalCases.id))
      .where(and(eq(t.evalAgentRuns.workspaceId, workspaceId), eq(t.evalAgentRuns.id, runId)))
      .orderBy(asc(t.evalRuns.ranAt));
    return rows.map((r) => ({ ...toResult(r.result), case_name: r.caseName }));
  }

  async listAgentRuns(workspaceId: string, agentId: string, since?: Date): Promise<EvalAgentRun[]> {
    const rows = await this.db
      .select()
      .from(t.evalAgentRuns)
      .where(
        and(
          eq(t.evalAgentRuns.workspaceId, workspaceId),
          eq(t.evalAgentRuns.agentId, agentId),
          since ? gte(t.evalAgentRuns.startedAt, since) : undefined,
        ),
      )
      .orderBy(desc(t.evalAgentRuns.startedAt), desc(t.evalAgentRuns.id));
    return rows.map(toAgentRun);
  }

  async runExists(runId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: t.evalAgentRuns.id })
      .from(t.evalAgentRuns)
      .where(eq(t.evalAgentRuns.id, runId));
    return Boolean(row);
  }

  async recordCaseResult(runId: string, caseId: string, outcome: CaseOutcome): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const bumped = await tx
        .update(t.evalAgentRuns)
        .set(
          outcome.errored
            ? { casesErrored: sql`${t.evalAgentRuns.casesErrored} + 1` }
            : {
                casesExecuted: sql`${t.evalAgentRuns.casesExecuted} + 1`,
                ...(outcome.pass ? { casesPassed: sql`${t.evalAgentRuns.casesPassed} + 1` } : {}),
              },
        )
        .where(eq(t.evalAgentRuns.id, runId))
        .returning({ id: t.evalAgentRuns.id });
      if (bumped.length === 0) return false;
      const [existing] = await tx
        .select({ id: t.evalCases.id })
        .from(t.evalCases)
        .where(eq(t.evalCases.id, caseId));
      if (existing) {
        await tx.insert(t.evalRuns).values({ caseId, evalAgentRunId: runId, ...resultValues(outcome) });
      }
      return true;
    });
  }

  async finalizeRun(runId: string, fin: RunFinalization): Promise<boolean> {
    const rows = await this.db
      .update(t.evalAgentRuns)
      .set({
        status: fin.status,
        reason: fin.reason,
        finishedAt: new Date(),
        casesExecuted: fin.casesExecuted,
        casesErrored: fin.casesErrored,
        casesPassed: fin.casesPassed,
        recall: fin.recall,
        precision: fin.precision,
        citationAccuracy: fin.citationAccuracy,
        costUsd: fin.costUsd,
        durationMs: fin.durationMs,
      })
      .where(eq(t.evalAgentRuns.id, runId))
      .returning({ id: t.evalAgentRuns.id });
    return rows.length > 0;
  }

  async reapStale(): Promise<{ runs: number; results: number }> {
    return this.db.transaction(async (tx) => {
      const now = new Date();
      const runs = await tx
        .update(t.evalAgentRuns)
        .set({ status: 'failed', reason: EVAL_REASON.interrupted, finishedAt: now })
        .where(eq(t.evalAgentRuns.status, 'running'))
        .returning({ id: t.evalAgentRuns.id });
      const results = await tx
        .update(t.evalRuns)
        .set({ status: 'error', errorReason: EVAL_REASON.interrupted, finishedAt: now })
        .where(eq(t.evalRuns.status, 'running'))
        .returning({ id: t.evalRuns.id });
      return { runs: runs.length, results: results.length };
    });
  }

  // ---- dashboard (read-only) ------------------------------------------------------

  /** Agents with >= 1 case: 3 queries total (cases+agents, running ids, last 10 finished per agent). */
  async dashboardAgents(workspaceId: string): Promise<DashboardAgentRow[]> {
    const agents = await this.db
      .select({
        id: t.agents.id,
        name: t.agents.name,
        provider: t.agents.provider,
        model: t.agents.model,
        enabled: t.agents.enabled,
        casesTotal: sql<number>`count(${t.evalCases.id})::int`,
      })
      .from(t.agents)
      .innerJoin(
        t.evalCases,
        and(
          eq(t.evalCases.ownerId, t.agents.id),
          eq(t.evalCases.ownerKind, 'agent'),
          eq(t.evalCases.workspaceId, workspaceId),
        ),
      )
      .where(eq(t.agents.workspaceId, workspaceId))
      .groupBy(t.agents.id)
      .orderBy(asc(t.agents.name), asc(t.agents.id));
    if (agents.length === 0) return [];

    const running = await this.db
      .select({ agentId: t.evalAgentRuns.agentId })
      .from(t.evalAgentRuns)
      .where(and(eq(t.evalAgentRuns.workspaceId, workspaceId), eq(t.evalAgentRuns.status, 'running')));
    const runningIds = new Set(running.map((r) => r.agentId));

    const ranked = this.db
      .select({
        id: t.evalAgentRuns.id,
        rn: sql<number>`row_number() over (partition by ${t.evalAgentRuns.agentId} order by ${t.evalAgentRuns.startedAt} desc, ${t.evalAgentRuns.id} desc)`.as(
          'rn',
        ),
      })
      .from(t.evalAgentRuns)
      .where(
        and(
          eq(t.evalAgentRuns.workspaceId, workspaceId),
          inArray(t.evalAgentRuns.status, ['done', 'partial']),
        ),
      )
      .as('ranked');
    const finished = await this.db
      .select({ run: t.evalAgentRuns })
      .from(t.evalAgentRuns)
      .innerJoin(ranked, eq(ranked.id, t.evalAgentRuns.id))
      .where(lte(ranked.rn, 10))
      .orderBy(desc(t.evalAgentRuns.startedAt), desc(t.evalAgentRuns.id));
    const byAgent = new Map<string, EvalAgentRun[]>();
    for (const { run } of finished) {
      const list = byAgent.get(run.agentId) ?? [];
      list.push(toAgentRun(run));
      byAgent.set(run.agentId, list);
    }

    return agents.map((a) => ({
      ...a,
      hasRunningRun: runningIds.has(a.id),
      finishedRuns: byAgent.get(a.id) ?? [],
    }));
  }

  async recentFinishedRuns(workspaceId: string, limit: number): Promise<RecentEvalRun[]> {
    const rows = await this.db
      .select({ run: t.evalAgentRuns, agentName: t.agents.name })
      .from(t.evalAgentRuns)
      .innerJoin(
        t.agents,
        and(eq(t.agents.id, t.evalAgentRuns.agentId), eq(t.agents.workspaceId, workspaceId)),
      )
      .where(
        and(
          eq(t.evalAgentRuns.workspaceId, workspaceId),
          inArray(t.evalAgentRuns.status, ['done', 'partial']),
        ),
      )
      .orderBy(desc(t.evalAgentRuns.startedAt), desc(t.evalAgentRuns.id))
      .limit(limit);
    return rows.map(({ run, agentName }) => ({
      id: run.id,
      agent_id: run.agentId,
      agent_name: agentName,
      agent_version: run.agentVersion,
      started_at: run.startedAt.toISOString(),
      recall: run.recall,
      precision: run.precision,
      citation_accuracy: run.citationAccuracy,
      cases_passed: run.casesPassed,
      cases_executed: run.casesExecuted,
    }));
  }

  // ---- finding source (read-only) -------------------------------------------------

  async findingForCase(workspaceId: string, findingId: string): Promise<FindingCaseSource | undefined> {
    const [row] = await this.db
      .select({
        f: t.findings,
        agentId: t.reviews.agentId,
        agentRowId: t.agents.id,
        prId: t.pullRequests.id,
        prTitle: t.pullRequests.title,
        prBody: t.pullRequests.body,
        patch: t.prFiles.patch,
      })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.findings.reviewId, t.reviews.id))
      .innerJoin(t.pullRequests, eq(t.reviews.prId, t.pullRequests.id))
      .leftJoin(
        t.agents,
        and(eq(t.agents.id, t.reviews.agentId), eq(t.agents.workspaceId, workspaceId)),
      )
      .leftJoin(
        t.prFiles,
        and(eq(t.prFiles.prId, t.pullRequests.id), eq(t.prFiles.path, t.findings.file)),
      )
      .where(
        and(
          eq(t.findings.id, findingId),
          eq(t.reviews.workspaceId, workspaceId),
          eq(t.pullRequests.workspaceId, workspaceId),
        ),
      )
      .limit(1);
    if (!row) return undefined;
    return {
      findingId: row.f.id,
      file: row.f.file,
      startLine: row.f.startLine,
      endLine: row.f.endLine,
      severity: row.f.severity,
      category: row.f.category,
      title: row.f.title,
      kind: row.f.kind,
      acceptedAt: row.f.acceptedAt,
      dismissedAt: row.f.dismissedAt,
      agentId: row.agentId,
      agentExists: row.agentRowId !== null,
      prId: row.prId,
      prTitle: row.prTitle,
      prBody: row.prBody,
      patch: row.patch,
    };
  }
}
