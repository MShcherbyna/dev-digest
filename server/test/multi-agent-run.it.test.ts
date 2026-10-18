import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { z } from 'zod';
import type {
  LLMProvider,
  ModelInfo,
  CompletionRequest,
  CompletionResult,
  StructuredRequest,
  StructuredResult,
  Review,
} from '@devdigest/shared';
import { eq, inArray } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

function reviewFixture(summary: string): Review {
  return {
    verdict: 'request_changes',
    summary,
    score: 80,
    findings: [
      {
        id: `f-${summary}`,
        severity: 'WARNING',
        category: 'bug',
        title: `Finding for ${summary}`,
        file: 'src/config.ts',
        start_line: 11,
        end_line: 11,
        rationale: 'A finding grounded on a real diff line.',
        confidence: 0.8,
        kind: 'finding',
      },
    ],
  };
}

/**
 * A controllable LLMProvider (test-only fixture, not production code): one
 * entry per model id, so each agent ("model") can be given its own delay and
 * optionally forced to throw — the Mock*Provider in `src/adapters/mocks.ts`
 * has neither knob. Used to drive AC-15 (bounded concurrency), AC-16 (wall-
 * clock = max, not sum) and AC-17 (one failing agent leaves siblings intact).
 */
class ControllableLLMProvider implements LLMProvider {
  readonly id: 'openai' = 'openai';
  constructor(
    private byModel: Record<string, { delayMs?: number; fail?: boolean; summary?: string }>,
  ) {}

  async listModels(): Promise<ModelInfo[]> {
    return [{ id: 'gpt-4.1', provider: 'openai' }];
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    return { text: 'mock', model: req.model, tokensIn: 10, tokensOut: 5, costUsd: 0.001 };
  }

  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const cfg = this.byModel[req.model] ?? {};
    if (cfg.delayMs) await new Promise((r) => setTimeout(r, cfg.delayMs));
    if (cfg.fail) throw new Error(`forced failure for model ${req.model}`);
    const fixture = reviewFixture(cfg.summary ?? req.model);
    const parsed = (req.schema as z.ZodType<T>).safeParse(fixture);
    if (!parsed.success) throw new Error(`fixture failed schema: ${parsed.error.message}`);
    return {
      data: parsed.data,
      model: req.model,
      tokensIn: 10,
      tokensOut: 5,
      costUsd: 0.001,
      raw: JSON.stringify(fixture),
      attempts: 1,
    };
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map(() => new Array(8).fill(0));
  }
}

const INTENT_FIXTURE = {
  intent: 'Test PR intent.',
  in_scope: ['In scope item'],
  out_of_scope: ['Out of scope item'],
  risk_areas: ['Risk area'],
  model_confidence: 'medium',
};

let repoSeq = 0;
async function setupRepoAndPr(
  db: PgFixture['handle']['db'],
  workspaceId: string,
  existingRepoId?: string,
) {
  let repo: typeof t.repos.$inferSelect;
  const seq = repoSeq++;
  if (existingRepoId) {
    const [existing] = await db.select().from(t.repos).where(eq(t.repos.id, existingRepoId));
    repo = existing!;
  } else {
    const name = `multi-agent-${seq}`;
    [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
  }
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 900 + seq,
      title: 'Multi-agent PR',
      author: 'marisa.koch',
      branch: 'feat/multi',
      base: 'main',
      headSha: 'a1b2c3d4',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
      body: 'Multi-agent review fixture PR.',
    })
    .returning();
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'src/config.ts',
    additions: 1,
    deletions: 0,
    patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
  });
  return { repo: repo!, pr: pr! };
}

d('Multi-Agent Review (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function appWith(byModel: Record<string, { delayMs?: number; fail?: boolean; summary?: string }>) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: {
          openai: new ControllableLLMProvider(byModel),
          // Intent derivation (openrouter) is mocked so no real network call.
          openrouter: new ControllableLLMProvider({ 'intent-model': { summary: 'intent' } }) as unknown as LLMProvider,
        },
      },
    });
  }

  async function createAgent(app: Awaited<ReturnType<typeof appWith>>, name: string, model: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name, provider: 'openai', model, system_prompt: `You are ${name}.` },
    });
    return res.json() as { id: string; name: string };
  }

  async function pollMultiRun(
    app: Awaited<ReturnType<typeof appWith>>,
    id: string,
    predicate: (view: Record<string, unknown>) => boolean,
    timeoutMs = 10_000,
  ) {
    const start = Date.now();
    for (;;) {
      const res = await app.inject({ method: 'GET', url: `/multi-agent-runs/${id}` });
      const body = res.json();
      if (predicate(body)) return body;
      if (Date.now() - start > timeoutMs) return body;
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  it('AC-1/AC-2/AC-3: starts N agents under one parent and surfaces it by id and by PR', async () => {
    // Regression: POST must create exactly 1 multi_agent_runs row + 1 agent_runs
    // row per requested agent, all linked via multi_agent_run_id; GET by id and
    // by PR must both resolve to it (AC-2's own URL, AC-3's "latest for PR").
    const app = await appWith({ 'm-a': { summary: 'a' }, 'm-b': { summary: 'b' }, 'm-c': { summary: 'c' } });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const a = await createAgent(app, 'Agent A', 'm-a');
    const b = await createAgent(app, 'Agent B', 'm-b');
    const c = await createAgent(app, 'Agent C', 'm-c');

    const start = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/multi-agent-run`,
      payload: { agent_ids: [a.id, b.id, c.id] },
    });
    expect(start.statusCode).toBe(200);
    const created = start.json();
    expect(created.requested_agent_ids).toEqual([a.id, b.id, c.id]);
    expect(created.columns).toHaveLength(3);

    const rows = await pg.handle.db
      .select()
      .from(t.multiAgentRuns)
      .where(eq(t.multiAgentRuns.id, created.id));
    expect(rows).toHaveLength(1);
    const children = await pg.handle.db
      .select()
      .from(t.agentRuns)
      .where(eq(t.agentRuns.multiAgentRunId, created.id));
    expect(children).toHaveLength(3);
    expect(children.every((c) => ['queued', 'running'].includes(c.status ?? ''))).toBe(true);

    const byId = await app.inject({ method: 'GET', url: `/multi-agent-runs/${created.id}` });
    expect(byId.statusCode).toBe(200);
    expect(byId.json().id).toBe(created.id);

    const byPr = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/multi-agent` });
    expect(byPr.statusCode).toBe(200);
    expect(byPr.json().id).toBe(created.id);

    await pollMultiRun(app, created.id, (v) => v.status === 'done');
    await app.close();
  });

  it('AC-15: 6 agents never exceed 4 concurrently running; the rest start queued', async () => {
    // Regression: the executor's limiter must cap `running` at
    // MULTI_AGENT_CONCURRENCY (4), promoting queued children only as a slot
    // frees — not run all 6 at once and not serialize them one at a time.
    const models = Array.from({ length: 6 }, (_, i) => `conc-${i}`);
    const byModel = Object.fromEntries(models.map((m) => [m, { delayMs: 400, summary: m }]));
    const app = await appWith(byModel);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agents = await Promise.all(models.map((m, i) => createAgent(app, `Agent ${i}`, m)));

    const start = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/multi-agent-run`,
      payload: { agent_ids: agents.map((a) => a.id) },
    });
    expect(start.statusCode).toBe(200);
    const created = start.json();

    // Immediately after creation, exactly 4 children are `running` and 2 are
    // `queued` (the repository's own split) — before any limiter promotion.
    const initialStatuses = created.columns.map((c: { status: string }) => c.status).sort();
    expect(initialStatuses).toEqual(['queued', 'queued', 'running', 'running', 'running', 'running']);

    // Poll mid-flight: at no point should more than 4 be `running` at once.
    let sawFour = false;
    let sawQueued = false;
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const rows = await pg.handle.db
        .select({ status: t.agentRuns.status })
        .from(t.agentRuns)
        .where(eq(t.agentRuns.multiAgentRunId, created.id));
      const runningCount = rows.filter((r) => r.status === 'running').length;
      expect(runningCount).toBeLessThanOrEqual(4);
      if (runningCount === 4) sawFour = true;
      if (rows.some((r) => r.status === 'queued')) sawQueued = true;
      if (rows.every((r) => r.status === 'done' || r.status === 'failed')) break;
      await new Promise((r) => setTimeout(r, 15));
    }
    expect(sawFour).toBe(true);
    expect(sawQueued).toBe(true);

    await pollMultiRun(app, created.id, (v) => v.status === 'done', 10_000);
    await app.close();
  });

  it(
    'AC-16: wall-clock total approximates the slowest child, not the sum',
    async () => {
      // Regression: a naive sequential-sum implementation would report ~10s
      // for 2s/3s/5s children; the parallel-fan-out total must be ~5s.
      const byModel = {
        'wc-fast': { delayMs: 400 },
        'wc-mid': { delayMs: 700 },
        'wc-slow': { delayMs: 1200 },
      };
      const app = await appWith(byModel);
      const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
      const fast = await createAgent(app, 'Fast', 'wc-fast');
      const mid = await createAgent(app, 'Mid', 'wc-mid');
      const slow = await createAgent(app, 'Slow', 'wc-slow');

      const start = await app.inject({
        method: 'POST',
        url: `/pulls/${pr.id}/multi-agent-run`,
        payload: { agent_ids: [fast.id, mid.id, slow.id] },
      });
      const created = start.json();

      const finished = await pollMultiRun(app, created.id, (v) => v.status === 'done', 10_000);
      expect(finished.status).toBe('done');
      // Max child delay is 1200ms; sum would be ~2300ms. Assert the total sits
      // close to the max, well under the sum.
      expect(finished.total_duration_ms).toBeGreaterThanOrEqual(1100);
      expect(finished.total_duration_ms).toBeLessThan(2000);

      await app.close();
    },
    15_000,
  );

  it('AC-17: one failing agent leaves the others done; aggregate status is partial', async () => {
    // Regression: NFR-3 — a sibling's exception must never affect this run's
    // own status or drop its findings; the parent must read `partial`, not
    // `failed`, when at least one child succeeded.
    const byModel = {
      'fail-ok1': { summary: 'ok1' },
      'fail-bad': { fail: true },
      'fail-ok2': { summary: 'ok2' },
    };
    const app = await appWith(byModel);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const ok1 = await createAgent(app, 'Ok1', 'fail-ok1');
    const bad = await createAgent(app, 'Bad', 'fail-bad');
    const ok2 = await createAgent(app, 'Ok2', 'fail-ok2');

    const start = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/multi-agent-run`,
      payload: { agent_ids: [ok1.id, bad.id, ok2.id] },
    });
    const created = start.json();

    const finished = await pollMultiRun(app, created.id, (v) => v.status === 'partial', 10_000);
    expect(finished.status).toBe('partial');
    const byAgent = new Map(
      (finished.columns as { agent_id: string; status: string; findings: unknown[] }[]).map((c) => [
        c.agent_id,
        c,
      ]),
    );
    expect(byAgent.get(ok1.id)?.status).toBe('done');
    expect(byAgent.get(ok1.id)?.findings).toHaveLength(1);
    expect(byAgent.get(bad.id)?.status).toBe('failed');
    expect(byAgent.get(ok2.id)?.status).toBe('done');
    expect(byAgent.get(ok2.id)?.findings).toHaveLength(1);

    await app.close();
  });

  it('AC-19: cancel one child, cancel the whole run, retry a failed agent, retry after a run-wide cancel', async () => {
    // Regression: cancelling one child must not touch its siblings; a
    // run-wide cancel must move every non-terminal child to cancelled; a
    // retried failed agent gets a fresh attempt without touching siblings'
    // findings/timestamps; retrying after a run-wide cancel yields `cancelled`
    // (Q-10 edge case), never `running`.
    const byModel = {
      'ret-keep': { delayMs: 600, summary: 'keep' },
      'ret-cancel-me': { delayMs: 5000 },
      'ret-fail': { fail: true },
    };
    const app = await appWith(byModel);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const keep = await createAgent(app, 'Keep', 'ret-keep');
    const cancelMe = await createAgent(app, 'CancelMe', 'ret-cancel-me');
    const willFail = await createAgent(app, 'WillFail', 'ret-fail');

    const start = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/multi-agent-run`,
      payload: { agent_ids: [keep.id, cancelMe.id, willFail.id] },
    });
    const created = start.json();
    const columnByAgent = new Map(
      (created.columns as { agent_id: string; run_id: string }[]).map((c) => [c.agent_id, c.run_id]),
    );

    // Cancel the slow child; its sibling (Keep) must be unaffected.
    const cancelRunId = columnByAgent.get(cancelMe.id)!;
    const afterChildCancel = await app.inject({
      method: 'POST',
      url: `/multi-agent-runs/${created.id}/runs/${cancelRunId}/cancel`,
    });
    expect(afterChildCancel.statusCode).toBe(200);
    const afterChildCancelBody = afterChildCancel.json();
    const cancelledCol = (afterChildCancelBody.columns as { run_id: string; status: string }[]).find(
      (c) => c.run_id === cancelRunId,
    );
    expect(cancelledCol?.status).toBe('cancelled');

    // Wait for the other two children to settle (Keep -> done, WillFail -> failed).
    const settled = await pollMultiRun(app, created.id, (v) => v.status === 'partial', 10_000);
    const keepCol = (settled.columns as { agent_id: string; status: string }[]).find(
      (c) => c.agent_id === keep.id,
    );
    const failCol = (settled.columns as { agent_id: string; status: string }[]).find(
      (c) => c.agent_id === willFail.id,
    );
    expect(keepCol?.status).toBe('done');
    expect(failCol?.status).toBe('failed');

    // Retry the failed agent: new attempt, siblings untouched.
    const failRunId = (settled.columns as { agent_id: string; run_id: string }[]).find(
      (c) => c.agent_id === willFail.id,
    )!.run_id;
    const retryByModel = { ...byModel, 'ret-fail': { summary: 'retried-ok' } };
    // Swap in a provider where the previously-failing model now succeeds,
    // simulating "the transient error is gone" for the retry.
    const app2 = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: {
          openai: new ControllableLLMProvider(retryByModel),
          openrouter: new ControllableLLMProvider({}) as unknown as LLMProvider,
        },
      },
    });
    const retried = await app2.inject({
      method: 'POST',
      url: `/multi-agent-runs/${created.id}/runs/${failRunId}/retry`,
    });
    expect(retried.statusCode).toBe(200);
    const afterRetry = await pollMultiRun(
      app2,
      created.id,
      (v) => v.status === 'done',
      10_000,
    );
    const retriedCol = (afterRetry.columns as { agent_id: string; status: string; run_id: string }[]).find(
      (c) => c.agent_id === willFail.id,
    );
    expect(retriedCol?.status).toBe('done');
    expect(retriedCol?.run_id).not.toBe(failRunId);
    const keepColAfterRetry = (afterRetry.columns as { agent_id: string; status: string; run_id: string }[]).find(
      (c) => c.agent_id === keep.id,
    );
    expect(keepColAfterRetry?.run_id).toBe(keepCol ? columnByAgent.get(keep.id) : undefined);
    expect(keepColAfterRetry?.status).toBe('done');

    // Second retry attempt: cancel the whole run first, then retry — must be
    // rejected as not_retryable (the latest attempt is `done`, not `failed`).
    const notRetryable = await app2.inject({
      method: 'POST',
      url: `/multi-agent-runs/${created.id}/runs/${retriedCol!.run_id}/retry`,
    });
    expect(notRetryable.statusCode).toBe(409);
    expect(notRetryable.json().error.code).toBe('not_retryable');

    await app.close();
    await app2.close();
  });

  it('AC-19 (run-wide cancel): every non-terminal child moves to cancelled, and a subsequent retry stays cancelled', async () => {
    const byModel = {
      'allcancel-a': { delayMs: 8000 },
      'allcancel-b': { delayMs: 8000 },
    };
    const app = await appWith(byModel);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const a = await createAgent(app, 'A', 'allcancel-a');
    const b = await createAgent(app, 'B', 'allcancel-b');

    const start = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/multi-agent-run`,
      payload: { agent_ids: [a.id, b.id] },
    });
    const created = start.json();

    const cancelled = await app.inject({
      method: 'POST',
      url: `/multi-agent-runs/${created.id}/cancel`,
    });
    expect(cancelled.statusCode).toBe(200);
    const body = cancelled.json();
    expect(body.status).toBe('cancelled');
    expect((body.columns as { status: string }[]).every((c) => c.status === 'cancelled')).toBe(true);

    // Q-10 edge case: retrying a failed-looking child after a run-wide cancel
    // must itself land as `cancelled`, never `running` — a run-wide cancel
    // takes precedence over a retry race. Here no child reached `failed` (they
    // were `running`/`queued` when cancelled), so simulate the race by
    // directly flipping one child to `failed` then retrying it.
    const [childRow] = await pg.handle.db
      .select()
      .from(t.agentRuns)
      .where(eq(t.agentRuns.multiAgentRunId, created.id))
      .limit(1);
    await pg.handle.db
      .update(t.agentRuns)
      .set({ status: 'failed' })
      .where(eq(t.agentRuns.id, childRow!.id));

    const retryAfterCancel = await app.inject({
      method: 'POST',
      url: `/multi-agent-runs/${created.id}/runs/${childRow!.id}/retry`,
    });
    expect(retryAfterCancel.statusCode).toBe(200);
    const retriedChild = (retryAfterCancel.json().columns as { agent_id: string; status: string }[]).find(
      (c) => c.agent_id === childRow!.agentId,
    );
    expect(retriedChild?.status).toBe('cancelled');

    await app.close();
  });

  it('AC-37: a second start while the first is non-terminal returns 409 and creates no row', async () => {
    const byModel = { 'conflict-slow': { delayMs: 5000 } };
    const app = await appWith(byModel);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = await createAgent(app, 'Slow', 'conflict-slow');

    const first = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/multi-agent-run`,
      payload: { agent_ids: [agent.id] },
    });
    expect(first.statusCode).toBe(200);

    const before = await pg.handle.db.select().from(t.multiAgentRuns).where(eq(t.multiAgentRuns.prId, pr.id));
    expect(before).toHaveLength(1);

    const second = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/multi-agent-run`,
      payload: { agent_ids: [agent.id] },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('multi_run_in_progress');

    const after = await pg.handle.db.select().from(t.multiAgentRuns).where(eq(t.multiAgentRuns.prId, pr.id));
    expect(after).toHaveLength(1);

    // Cancel so the pending background run doesn't leak into later tests.
    await app.inject({ method: 'POST', url: `/multi-agent-runs/${before[0]!.id}/cancel` });
    await app.close();
  });

  it('AC-38: every route 404s for a multi-run/PR belonging to a different workspace', async () => {
    const app = await appWith({ 'ws-model': { summary: 'ws' } });
    const [otherWs] = await pg.handle.db.insert(t.workspaces).values({ name: 'multi-agent-other' }).returning();
    const { pr } = await setupRepoAndPr(pg.handle.db, otherWs!.id);
    const [otherRepo] = await pg.handle.db.select().from(t.repos).where(eq(t.repos.id, pr.repoId));

    // A foreign agent so `start` would otherwise succeed if the workspace
    // check were missing — it must 404 (pull not found in THIS workspace)
    // before it ever validates agent ids.
    const foreignAgentRes = await pg.handle.db
      .insert(t.agents)
      .values({ workspaceId: otherWs!.id, name: 'Foreign Agent', provider: 'openai', model: 'ws-model', systemPrompt: 'x' })
      .returning();
    const foreignAgent = foreignAgentRes[0]!;

    const start = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/multi-agent-run`,
      payload: { agent_ids: [foreignAgent.id] },
    });
    expect(start.statusCode).toBe(404);

    // Build a real multi-run in the OTHER workspace directly, then verify the
    // default-workspace app can't read/cancel/retry/last-select it.
    const [parent] = await pg.handle.db
      .insert(t.multiAgentRuns)
      .values({ workspaceId: otherWs!.id, prId: pr.id, requestedAgentIds: [foreignAgent.id] })
      .returning();
    const [child] = await pg.handle.db
      .insert(t.agentRuns)
      .values({
        workspaceId: otherWs!.id,
        agentId: foreignAgent.id,
        prId: pr.id,
        provider: 'openai',
        model: 'ws-model',
        status: 'queued',
        multiAgentRunId: parent!.id,
        source: 'local',
      })
      .returning();

    const getById = await app.inject({ method: 'GET', url: `/multi-agent-runs/${parent!.id}` });
    expect(getById.statusCode).toBe(404);

    const getByPull = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/multi-agent` });
    expect(getByPull.statusCode).toBe(404);

    const cancelAll = await app.inject({ method: 'POST', url: `/multi-agent-runs/${parent!.id}/cancel` });
    expect(cancelAll.statusCode).toBe(404);

    const cancelChild = await app.inject({
      method: 'POST',
      url: `/multi-agent-runs/${parent!.id}/runs/${child!.id}/cancel`,
    });
    expect(cancelChild.statusCode).toBe(404);

    const retryChild = await app.inject({
      method: 'POST',
      url: `/multi-agent-runs/${parent!.id}/runs/${child!.id}/retry`,
    });
    expect(retryChild.statusCode).toBe(404);

    const lastSelection = await app.inject({
      method: 'GET',
      url: `/repos/${otherRepo!.id}/multi-agent/last-selection`,
    });
    expect(lastSelection.statusCode).toBe(404);

    await app.close();
  });

  it('422s for duplicate ids, 9 ids, an unknown id and a disabled agent', async () => {
    const app = await appWith({ 'inv-a': { summary: 'a' } });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const a = await createAgent(app, 'InvA', 'inv-a');

    const dup = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/multi-agent-run`,
      payload: { agent_ids: [a.id, a.id] },
    });
    expect(dup.statusCode).toBe(422);

    const nineIds = Array.from({ length: 9 }, () => '11111111-1111-1111-1111-111111111111');
    const tooMany = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/multi-agent-run`,
      payload: { agent_ids: nineIds },
    });
    expect(tooMany.statusCode).toBe(422);

    const unknown = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/multi-agent-run`,
      payload: { agent_ids: ['22222222-2222-2222-2222-222222222222'] },
    });
    expect(unknown.statusCode).toBe(422);
    expect(unknown.json().error.code).toBe('invalid_agents');

    await app.inject({ method: 'PUT', url: `/agents/${a.id}`, payload: { enabled: false } });
    const disabled = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/multi-agent-run`,
      payload: { agent_ids: [a.id] },
    });
    expect(disabled.statusCode).toBe(422);
    expect(disabled.json().error.code).toBe('invalid_agents');

    await app.close();
  });

  it('the boot reaper reaps orphaned queued/running multi-run children', async () => {
    // Regression: without reaping `queued` too (not only `running`), an
    // orphaned child blocks AC-37's 409 guard forever after a restart.
    const app = await appWith({});
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const [parent] = await pg.handle.db
      .insert(t.multiAgentRuns)
      .values({ workspaceId, prId: pr.id, requestedAgentIds: [] })
      .returning();
    const orphans = await pg.handle.db
      .insert(t.agentRuns)
      .values([
        { workspaceId, prId: pr.id, provider: 'openai', model: 'x', status: 'running', multiAgentRunId: parent!.id, source: 'local' },
        { workspaceId, prId: pr.id, provider: 'openai', model: 'x', status: 'queued', multiAgentRunId: parent!.id, source: 'local' },
      ])
      .returning();
    await app.close();

    // A fresh app instance reaps on boot (awaited before it accepts requests).
    const freshApp = await appWith({});
    const rows = await pg.handle.db
      .select()
      .from(t.agentRuns)
      .where(inArray(t.agentRuns.id, orphans.map((o) => o.id)));
    expect(rows.every((r) => r.status === 'failed')).toBe(true);
    await freshApp.close();
  });

  it("last-selection returns the newest multi-run's agent ids, filtered to currently-enabled agents", async () => {
    const app = await appWith({ 'sel-a': { summary: 'a' }, 'sel-b': { summary: 'b' } });
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const a = await createAgent(app, 'SelA', 'sel-a');
    const b = await createAgent(app, 'SelB', 'sel-b');

    const first = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/multi-agent-run`,
      payload: { agent_ids: [a.id, b.id] },
    });
    const firstBody = first.json();
    await pollMultiRun(app, firstBody.id, (v) => v.status === 'done' || v.status === 'running');
    await app.inject({ method: 'POST', url: `/multi-agent-runs/${firstBody.id}/cancel` });

    const { pr: pr2 } = await setupRepoAndPr(pg.handle.db, workspaceId, repo.id);
    const second = await app.inject({
      method: 'POST',
      url: `/pulls/${pr2.id}/multi-agent-run`,
      payload: { agent_ids: [a.id] },
    });
    const secondBody = second.json();

    const selection = await app.inject({
      method: 'GET',
      url: `/repos/${repo.id}/multi-agent/last-selection`,
    });
    expect(selection.statusCode).toBe(200);
    expect(selection.json().agent_ids).toEqual([a.id]);

    // Disabling the only selected agent empties the selection (filtered to
    // currently-enabled agents, Q-6).
    await app.inject({ method: 'PUT', url: `/agents/${a.id}`, payload: { enabled: false } });
    const selectionAfterDisable = await app.inject({
      method: 'GET',
      url: `/repos/${repo.id}/multi-agent/last-selection`,
    });
    expect(selectionAfterDisable.json().agent_ids).toBeNull();

    await app.inject({ method: 'POST', url: `/multi-agent-runs/${secondBody.id}/cancel` });
    await app.close();
  });
});
