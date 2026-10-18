import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { RunTrace } from '@devdigest/shared';
import type { RunSummaryWithParent, RunTraceStored } from '../schemas.js';

// ---- in-flight / history --------------------------------------------------

/** In-flight runs for a PR (status IN ('running','queued')) — the server-side
 *  source of truth for "which agents are running now". Joined with the agent
 *  name. `queued` counts as active so AC-37's 409 guard and the UI's polling
 *  both see a multi-run's not-yet-started children. */
export async function activeRunsForPull(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<{ run_id: string; agent_id: string | null; agent_name: string | null; ran_at: string | null }[]> {
  const rows = await db
    .select({
      id: t.agentRuns.id,
      agentId: t.agentRuns.agentId,
      ranAt: t.agentRuns.ranAt,
      agentName: t.agents.name,
    })
    .from(t.agentRuns)
    .leftJoin(t.agents, eq(t.agents.id, t.agentRuns.agentId))
    .where(
      and(
        eq(t.agentRuns.workspaceId, workspaceId),
        eq(t.agentRuns.prId, prId),
        inArray(t.agentRuns.status, ['running', 'queued']),
      ),
    );
  return rows.map((r) => ({
    run_id: r.id,
    agent_id: r.agentId,
    agent_name: r.agentName ?? null,
    ran_at: r.ranAt ? r.ranAt.toISOString() : null,
  }));
}

/** All runs for a PR (any status), newest first — the PR run history. */
export async function listRunsForPull(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<RunSummaryWithParent[]> {
  const rows = await db
    .select({ run: t.agentRuns, agentName: t.agents.name })
    .from(t.agentRuns)
    .leftJoin(t.agents, eq(t.agents.id, t.agentRuns.agentId))
    .where(and(eq(t.agentRuns.workspaceId, workspaceId), eq(t.agentRuns.prId, prId)))
    .orderBy(desc(t.agentRuns.ranAt));
  return rows.map(({ run, agentName }) => ({
    run_id: run.id,
    agent_id: run.agentId,
    agent_name: agentName ?? null,
    provider: run.provider,
    model: run.model,
    status: run.status,
    error: run.error,
    duration_ms: run.durationMs,
    tokens_in: run.tokensIn,
    tokens_out: run.tokensOut,
    cost_usd: run.costUsd,
    findings_count: run.findingsCount,
    grounding: run.grounding,
    ran_at: run.ranAt ? run.ranAt.toISOString() : null,
    score: run.score,
    blockers: run.blockers,
    // Module-local extension (RunSummaryWithParent on the client, Q-1): null
    // for a single-agent run, the parent multi_agent_runs id for a child row.
    multi_agent_run_id: run.multiAgentRunId,
  }));
}

/**
 * Delete one agent run (+ its trace via FK cascade) AND the review it produced.
 * Workspace-scoped. `reviews.run_id` has no FK to `agent_runs`, so the review
 * (and its findings, which DO cascade from `reviews`) must be removed explicitly
 * here — otherwise deleting a run from the timeline leaves its findings orphaned
 * in the Review Runs list below.
 */
export async function deleteAgentRun(
  db: Db,
  workspaceId: string,
  runId: string,
): Promise<boolean> {
  await db
    .delete(t.reviews)
    .where(and(eq(t.reviews.runId, runId), eq(t.reviews.workspaceId, workspaceId)));
  const rows = await db
    .delete(t.agentRuns)
    .where(and(eq(t.agentRuns.id, runId), eq(t.agentRuns.workspaceId, workspaceId)))
    .returning({ id: t.agentRuns.id });
  return rows.length > 0;
}

/** Mark a still-running (or still-queued) run as cancelled (no-op if it
 *  already reached a terminal state). `queued` matters for AC-19: cancelling
 *  a multi-run must also cancel children that never got a slot. */
export async function cancelRunIfRunning(db: Db, runId: string): Promise<boolean> {
  const rows = await db
    .update(t.agentRuns)
    .set({ status: 'cancelled' })
    .where(and(eq(t.agentRuns.id, runId), inArray(t.agentRuns.status, ['running', 'queued'])))
    .returning({ id: t.agentRuns.id });
  return rows.length > 0;
}

/** On boot: any run still 'running' OR 'queued' is orphaned (its process died
 *  / restarted — the in-memory limiter that would have promoted it is gone
 *  too), so mark it failed. Without reaping `queued` too, an orphaned child
 *  would keep the parent PR "non-terminal" and AC-37's 409 guard would never
 *  clear after a restart. */
export async function reapStaleRunningRuns(db: Db): Promise<number> {
  const rows = await db
    .update(t.agentRuns)
    .set({ status: 'failed' })
    .where(inArray(t.agentRuns.status, ['running', 'queued']))
    .returning({ id: t.agentRuns.id });
  return rows.length;
}

// ---- observability: agent_runs + run_traces -------------------------------

/** Create an agent_runs row. Defaults to `running`/no parent so the existing
 *  single-agent call sites are unchanged; the multi-agent-run repository
 *  passes `status: 'queued'` for children beyond the concurrency bound and
 *  `multiAgentRunId` to link the child to its parent. Returns the row id
 *  (= the runId). */
export async function createAgentRun(
  db: Db,
  values: {
    workspaceId: string;
    agentId: string | null;
    prId: string;
    provider: string | null;
    model: string | null;
    status?: 'queued' | 'running';
    multiAgentRunId?: string | null;
  },
): Promise<string> {
  const [row] = await db
    .insert(t.agentRuns)
    .values({
      workspaceId: values.workspaceId,
      agentId: values.agentId,
      prId: values.prId,
      provider: values.provider,
      model: values.model,
      status: values.status ?? 'running',
      multiAgentRunId: values.multiAgentRunId ?? null,
      source: 'local',
    })
    .returning({ id: t.agentRuns.id });
  return row!.id;
}

/**
 * Promote a `queued` child to `running` as a limiter slot frees, resetting
 * `ran_at` so the wall-clock total (AC-16) measures from when the agent
 * actually started, not when the multi-run was created (R9). A row already
 * `running` (the first `concurrency_limit` children, created running so they
 * can start immediately) is a no-op pass-through — `ran_at` is left alone —
 * so the SAME gate works uniformly for every job the executor's limiter
 * schedules, whatever its initial state. Returns `false` only when the row is
 * in neither state (cancelled before a slot opened) — the executor treats
 * that as "do not run", gated from the DB rather than `runBus.isCancelled`,
 * because `runBus.complete()` clears the cancel flag before this could run.
 */
export async function markRunningIfQueued(db: Db, runId: string): Promise<boolean> {
  const rows = await db
    .update(t.agentRuns)
    .set({
      status: 'running',
      ranAt: sql`case when ${t.agentRuns.status} = 'queued' then now() else ${t.agentRuns.ranAt} end`,
    })
    .where(and(eq(t.agentRuns.id, runId), inArray(t.agentRuns.status, ['queued', 'running'])))
    .returning({ id: t.agentRuns.id });
  return rows.length > 0;
}

export async function completeAgentRun(
  db: Db,
  runId: string,
  values: {
    status: 'done' | 'failed' | 'cancelled';
    durationMs: number;
    tokensIn: number;
    tokensOut: number;
    /** USD cost estimate; null when the model's price is unknown or the run failed/was cancelled. */
    costUsd: number | null;
    findingsCount: number;
    grounding: string;
    /** Review score (0-100); null on failed/cancelled runs. */
    score?: number | null;
    /** Findings that tripped the agent's gate; 0 on failed/cancelled runs. */
    blockers?: number | null;
    /** Failure reason (status='failed') / cancellation note. Null clears it. */
    error?: string | null;
  },
): Promise<void> {
  // Status-guarded: never overwrite a row a run-wide cancel already moved to
  // 'cancelled' (the multi-agent pre-work `failAll` path can race a cancel —
  // the cancel's terminal state must win).
  await db
    .update(t.agentRuns)
    .set({
      status: values.status,
      durationMs: values.durationMs,
      tokensIn: values.tokensIn,
      tokensOut: values.tokensOut,
      costUsd: values.costUsd,
      findingsCount: values.findingsCount,
      grounding: values.grounding,
      score: values.score ?? null,
      blockers: values.blockers ?? null,
      error: values.error ?? null,
    })
    .where(and(eq(t.agentRuns.id, runId), ne(t.agentRuns.status, 'cancelled')));
}

/** Persist the WHOLE run log as ONE document. PK = runId → agent_runs. */
export async function saveRunTrace(db: Db, runId: string, trace: RunTraceStored): Promise<void> {
  await db
    .insert(t.runTraces)
    .values({ runId, trace })
    .onConflictDoUpdate({ target: t.runTraces.runId, set: { trace } });
}

export async function getRunTrace(db: Db, runId: string): Promise<RunTrace | undefined> {
  const [row] = await db.select().from(t.runTraces).where(eq(t.runTraces.runId, runId));
  return row ? (row.trace as RunTrace) : undefined;
}
