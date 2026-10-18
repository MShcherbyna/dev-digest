import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { MultiRunChildRow, MultiRunRow, MultiRunStore, PullLookup, RecentMultiRunRow } from './ports.js';
import type { AgentColumnFindingView } from './schemas.js';

/**
 * Data-access for the multi-agent-run module. Owns `multi_agent_runs` and may
 * additionally query the shared `agent_runs`/`reviews`/`findings`/`agents`
 * tables directly (architecture constraint explicitly allows this — it does
 * NOT go through `reviews/repository*`). Returns only mapped `ports.ts`
 * shapes, never a raw Drizzle row.
 */
export class MultiAgentRunRepository implements MultiRunStore {
  constructor(private db: Db) {}

  async createWithChildren(input: {
    workspaceId: string;
    prId: string;
    agentIds: string[];
    concurrencyLimit: number;
  }): Promise<{ run: MultiRunRow } | { conflict: true }> {
    return this.db.transaction(async (tx) => {
      // Lock the PR row so a concurrent start against the same PR serializes
      // here (AC-37's 409 guard).
      const [pull] = await tx
        .select({ id: t.pullRequests.id, number: t.pullRequests.number })
        .from(t.pullRequests)
        .where(and(eq(t.pullRequests.workspaceId, input.workspaceId), eq(t.pullRequests.id, input.prId)))
        .for('update');
      if (!pull) return { conflict: true } as const;

      const [existingNonTerminal] = await tx
        .select({ id: t.agentRuns.id })
        .from(t.agentRuns)
        .innerJoin(t.multiAgentRuns, eq(t.multiAgentRuns.id, t.agentRuns.multiAgentRunId))
        .where(
          and(
            eq(t.multiAgentRuns.prId, input.prId),
            inArray(t.agentRuns.status, ['queued', 'running']),
          ),
        )
        .limit(1);
      if (existingNonTerminal) return { conflict: true } as const;

      const [parent] = await tx
        .insert(t.multiAgentRuns)
        .values({
          workspaceId: input.workspaceId,
          prId: input.prId,
          requestedAgentIds: input.agentIds,
        })
        .returning();

      const agentRows = await tx
        .select()
        .from(t.agents)
        .where(and(eq(t.agents.workspaceId, input.workspaceId), inArray(t.agents.id, input.agentIds)));
      const byId = new Map(agentRows.map((a) => [a.id, a]));

      await tx.insert(t.agentRuns).values(
        input.agentIds.map((agentId, i) => {
          const agent = byId.get(agentId);
          return {
            workspaceId: input.workspaceId,
            agentId,
            prId: input.prId,
            provider: agent?.provider ?? null,
            model: agent?.model ?? null,
            status: i < input.concurrencyLimit ? ('running' as const) : ('queued' as const),
            multiAgentRunId: parent!.id,
            source: 'local' as const,
          };
        }),
      );

      return {
        run: {
          id: parent!.id,
          workspaceId: parent!.workspaceId,
          prId: parent!.prId,
          prNumber: pull.number,
          ranAt: parent!.ranAt,
          requestedAgentIds: parent!.requestedAgentIds,
          cancelledAt: parent!.cancelledAt,
        },
      };
    });
  }

  async getById(workspaceId: string, id: string): Promise<MultiRunRow | undefined> {
    const [row] = await this.db
      .select({ run: t.multiAgentRuns, prNumber: t.pullRequests.number })
      .from(t.multiAgentRuns)
      .leftJoin(t.pullRequests, eq(t.pullRequests.id, t.multiAgentRuns.prId))
      .where(and(eq(t.multiAgentRuns.workspaceId, workspaceId), eq(t.multiAgentRuns.id, id)));
    return row ? this.toMultiRunRow(row.run, row.prNumber ?? null) : undefined;
  }

  async latestForPull(workspaceId: string, prId: string): Promise<MultiRunRow | undefined> {
    const [row] = await this.db
      .select({ run: t.multiAgentRuns, prNumber: t.pullRequests.number })
      .from(t.multiAgentRuns)
      .leftJoin(t.pullRequests, eq(t.pullRequests.id, t.multiAgentRuns.prId))
      .where(and(eq(t.multiAgentRuns.workspaceId, workspaceId), eq(t.multiAgentRuns.prId, prId)))
      .orderBy(desc(t.multiAgentRuns.ranAt))
      .limit(1);
    return row ? this.toMultiRunRow(row.run, row.prNumber ?? null) : undefined;
  }

  async recent(workspaceId: string, limit: number): Promise<RecentMultiRunRow[]> {
    const rows = await this.db
      .select({
        run: t.multiAgentRuns,
        prNumber: t.pullRequests.number,
        prTitle: t.pullRequests.title,
        repoFullName: t.repos.fullName,
      })
      .from(t.multiAgentRuns)
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.multiAgentRuns.prId))
      .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId))
      .where(eq(t.multiAgentRuns.workspaceId, workspaceId))
      .orderBy(desc(t.multiAgentRuns.ranAt))
      .limit(limit);
    return rows.map(({ run, prNumber, prTitle, repoFullName }) => ({
      id: run.id,
      prId: run.prId,
      prNumber,
      prTitle,
      repoFullName,
      ranAt: run.ranAt,
      agentCount: run.requestedAgentIds.length,
      cancelledAt: run.cancelledAt,
    }));
  }

  async childrenWithFindings(id: string): Promise<MultiRunChildRow[]> {
    const children = await this.db
      .select({ run: t.agentRuns, agentName: t.agents.name })
      .from(t.agentRuns)
      .leftJoin(t.agents, eq(t.agents.id, t.agentRuns.agentId))
      .where(eq(t.agentRuns.multiAgentRunId, id))
      // Deterministic creation order: ranAt is NOT NULL/defaultNow(), but
      // several children can share the same millisecond (batch insert), so
      // id breaks ties. Without this, Postgres gives no row-order guarantee
      // and `createdOrder`'s `i`-fallback below would not be stable across
      // calls.
      .orderBy(asc(t.agentRuns.ranAt), asc(t.agentRuns.id));
    if (children.length === 0) return [];

    const runIds = children.map((c) => c.run.id);
    const findingRows = await this.db
      .select({ runId: t.reviews.runId, finding: t.findings })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
      .where(inArray(t.reviews.runId, runIds));

    const findingsByRun = new Map<string, AgentColumnFindingView[]>();
    for (const { runId, finding } of findingRows) {
      if (!runId) continue;
      const list = findingsByRun.get(runId) ?? [];
      list.push({
        id: finding.id,
        severity: finding.severity as AgentColumnFindingView['severity'],
        category: finding.category as AgentColumnFindingView['category'],
        title: finding.title,
        file: finding.file,
        start_line: finding.startLine,
        end_line: finding.endLine,
        kind: finding.kind ?? null,
        confidence: finding.confidence,
        rationale: finding.rationale,
        suggested_fix: finding.suggestion ?? null,
        group_id: null,
      });
      findingsByRun.set(runId, list);
    }

    // Verdict/score/summary come from the review row (one per run, kind='review').
    const reviewRows = await this.db
      .select({ review: t.reviews })
      .from(t.reviews)
      .where(and(inArray(t.reviews.runId, runIds), eq(t.reviews.kind, 'review')));
    const reviewByRun = new Map(reviewRows.map((r) => [r.review.runId as string, r.review]));

    return children.map(({ run, agentName }, i) => {
      const review = run.id ? reviewByRun.get(run.id) : undefined;
      return {
        runId: run.id,
        agentId: run.agentId,
        agentName: agentName ?? null,
        provider: run.provider,
        model: run.model,
        status: (run.status ?? 'failed') as MultiRunChildRow['status'],
        verdict: review?.verdict ?? null,
        score: run.score,
        summary: review?.summary ?? null,
        durationMs: run.durationMs,
        costUsd: run.costUsd,
        ranAt: run.ranAt,
        createdOrder: run.ranAt ? run.ranAt.getTime() : i,
        findings: findingsByRun.get(run.id) ?? [],
      };
    });
  }

  async markCancelled(id: string): Promise<string[]> {
    return this.db.transaction(async (tx) => {
      await tx
        .update(t.multiAgentRuns)
        .set({ cancelledAt: sql`coalesce(${t.multiAgentRuns.cancelledAt}, now())` })
        .where(eq(t.multiAgentRuns.id, id));
      const nonTerminal = await tx
        .select({ id: t.agentRuns.id })
        .from(t.agentRuns)
        .where(and(eq(t.agentRuns.multiAgentRunId, id), inArray(t.agentRuns.status, ['queued', 'running'])));
      return nonTerminal.map((r) => r.id);
    });
  }

  async insertRetryChild(
    parentId: string,
    agent: { id: string; provider: string | null; model: string | null },
  ): Promise<{ runId: string; status: 'queued' | 'cancelled' }> {
    return this.db.transaction(async (tx) => {
      const [parent] = await tx
        .select({ id: t.multiAgentRuns.id, cancelledAt: t.multiAgentRuns.cancelledAt, workspaceId: t.multiAgentRuns.workspaceId, prId: t.multiAgentRuns.prId })
        .from(t.multiAgentRuns)
        .where(eq(t.multiAgentRuns.id, parentId))
        .for('update');
      if (!parent) throw new Error('multi_agent_run not found');
      // Q-10: a retry started after a run-wide cancel is created already
      // `cancelled` — it is never actually executed.
      const status = parent.cancelledAt ? ('cancelled' as const) : ('queued' as const);
      const [row] = await tx
        .insert(t.agentRuns)
        .values({
          workspaceId: parent.workspaceId,
          agentId: agent.id,
          prId: parent.prId,
          provider: agent.provider,
          model: agent.model,
          status,
          multiAgentRunId: parentId,
          source: 'local',
        })
        .returning({ id: t.agentRuns.id });
      return { runId: row!.id, status };
    });
  }

  async lastSelectionForRepo(workspaceId: string, repoId: string): Promise<string[] | undefined> {
    const [row] = await this.db
      .select({ requestedAgentIds: t.multiAgentRuns.requestedAgentIds })
      .from(t.multiAgentRuns)
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.multiAgentRuns.prId))
      .where(and(eq(t.multiAgentRuns.workspaceId, workspaceId), eq(t.pullRequests.repoId, repoId)))
      .orderBy(desc(t.multiAgentRuns.ranAt))
      .limit(1);
    return row?.requestedAgentIds;
  }

  private toMultiRunRow(
    run: typeof t.multiAgentRuns.$inferSelect,
    prNumber: number | null,
  ): MultiRunRow {
    return {
      id: run.id,
      workspaceId: run.workspaceId,
      prId: run.prId,
      prNumber,
      ranAt: run.ranAt,
      requestedAgentIds: run.requestedAgentIds,
      cancelledAt: run.cancelledAt,
    };
  }
}

/**
 * `PullLookup` over the shared `pull_requests`/`repos` tables — kept separate
 * from `MultiAgentRunRepository` because it is a cross-cutting read, not
 * `multi_agent_runs` data access, but still infrastructure (Drizzle), so it
 * lives here rather than in `service.ts`.
 */
export class MultiAgentPullLookup implements PullLookup {
  constructor(private db: Db) {}

  async getPull(
    workspaceId: string,
    prId: string,
  ): Promise<{ id: string; number: number; repoId: string } | undefined> {
    const [row] = await this.db
      .select({ id: t.pullRequests.id, number: t.pullRequests.number, repoId: t.pullRequests.repoId })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row;
  }

  async repoInWorkspace(workspaceId: string, repoId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: t.repos.id })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row != null;
  }
}
