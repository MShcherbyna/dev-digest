import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { AgentsRepository } from '../src/modules/agents/repository.js';
import { GHOST, StubLLM, caseBody, createAgent, reviewAnswer, waitForEvalRun } from './helpers/eval.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[eval-dashboard] Docker not available — skipping integration tests.');
}

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

/** Dashboards, compare and run-all (eval part 2) over the real repository with a stub LLM. */
d('eval: dashboard, compare, run-all (Testcontainers pg)', () => {
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

  const makeApp = (llm: StubLLM = new StubLLM(() => reviewAnswer([11]))) =>
    buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient(),
        llm: { openai: llm, openrouter: llm },
      },
    });
  type App = Awaited<ReturnType<typeof makeApp>>;

  const addCase = async (app: App, agentId: string, over: Record<string, unknown> = {}) => {
    const res = await app.inject({ method: 'POST', url: `/agents/${agentId}/eval-cases`, payload: caseBody(over) });
    expect(res.statusCode).toBe(201);
  };

  interface RunOver {
    startedAt: Date;
    status?: 'running' | 'done' | 'partial' | 'failed';
    version?: number;
    recall?: number | null;
    precision?: number | null;
    citation?: number | null;
    cost?: number | null;
    prompt?: string;
    passed?: number;
    executed?: number;
    wsId?: string;
  }
  /** Inserts a finished/failed/running agent run with exact metrics and start time. */
  const insertRun = async (agentId: string, o: RunOver) => {
    const [row] = await pg.handle.db
      .insert(t.evalAgentRuns)
      .values({
        workspaceId: o.wsId ?? workspaceId,
        agentId,
        agentVersion: o.version ?? 1,
        provider: 'openai',
        model: 'gpt-4.1',
        strategy: 'auto',
        systemPrompt: o.prompt ?? 'You are a strict reviewer.',
        status: o.status ?? 'done',
        startedAt: o.startedAt,
        casesTotal: o.executed ?? 4,
        casesExecuted: o.executed ?? 4,
        casesPassed: o.passed ?? 3,
        recall: o.recall === undefined ? 0.8 : o.recall,
        precision: o.precision === undefined ? 0.8 : o.precision,
        citationAccuracy: o.citation === undefined ? 0.8 : o.citation,
        costUsd: o.cost === undefined ? 0.05 : o.cost,
      })
      .returning({ id: t.evalAgentRuns.id });
    return row!.id;
  };

  const foreignAgent = async () => {
    const [otherWs] = await pg.handle.db.insert(t.workspaces).values({ name: `other-${Math.random()}` }).returning();
    const agent = await new AgentsRepository(pg.handle.db).insert({
      workspaceId: otherWs!.id,
      name: 'Foreign',
      provider: 'openai',
      model: 'gpt-4.1',
      systemPrompt: 'x',
    });
    return { wsId: otherWs!.id, agentId: agent.id };
  };

  it('GET /eval/dashboard: only agents with cases, never-run card, latest finished metrics, 10-point sparkline, recent runs', async () => {
    // Regression: P2-AC-1/2/3 shapes. Agents without cases must not appear, failed/running runs must not
    // be "latest" or recent, the sparkline is chronological and capped at 10.
    const app = await makeApp();
    const active = await createAgent(app, 'Dash Active');
    const never = await createAgent(app, 'Dash Never Run');
    const noCases = await createAgent(app, 'Dash No Cases');
    await addCase(app, active.id);
    await addCase(app, active.id, { name: 'second' });
    await addCase(app, never.id);

    for (let i = 0; i < 12; i++) {
      await insertRun(active.id, { startedAt: daysAgo(20 - i), recall: 0.5 + i / 100, version: 1 });
    }
    // Newer failed run: must not become `last_run` or enter the sparkline.
    await insertRun(active.id, { startedAt: daysAgo(1), status: 'failed', recall: null, precision: null, citation: null });
    const runningId = await insertRun(active.id, { startedAt: daysAgo(0.5), status: 'running' });

    const res = await app.inject({ method: 'GET', url: '/eval/dashboard' });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    const ids = body.agents.map((a: { id: string }) => a.id);
    expect(ids).toContain(active.id);
    expect(ids).toContain(never.id);
    expect(ids).not.toContain(noCases.id);

    const card = body.agents.find((a: { id: string }) => a.id === active.id);
    expect(card).toMatchObject({ name: 'Dash Active', cases_total: 2, has_running_run: true, enabled: true });
    expect(card.last_run).toMatchObject({ agent_version: 1, cases_passed: 3, cases_executed: 4 });
    expect(card.last_run.id).not.toBe(runningId);
    expect(card.latest.recall).toBeCloseTo(0.61);
    expect(card.recall_trend).toHaveLength(10);
    expect(card.recall_trend[0]).toBeCloseTo(0.52);
    expect(card.recall_trend[9]).toBeCloseTo(0.61);

    const neverCard = body.agents.find((a: { id: string }) => a.id === never.id);
    expect(neverCard).toMatchObject({
      cases_total: 1,
      has_running_run: false,
      last_run: null,
      recall_trend: [],
      latest: { recall: null, precision: null, citation_accuracy: null },
    });

    const recent = body.recent_runs as Array<{ agent_name: string; started_at: string; agent_id: string }>;
    expect(recent.length).toBeLessThanOrEqual(20);
    expect(recent.every((r) => r.agent_id === active.id)).toBe(true);
    expect(recent[0]?.agent_name).toBe('Dash Active');
    const times = recent.map((r) => Date.parse(r.started_at));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(recent).toHaveLength(12);
    await app.close();
  });

  it('GET /agents/:id/eval-dashboard: current, delta, chronological trend, newest-first runs incl. failed, regression alert', async () => {
    // Regression: P2-AC-7/8/9/11 payload; exactly 1.0 point drop raises the alert and a failed run is listed
    // but never counted as the latest finished run.
    const app = await makeApp();
    const agent = await createAgent(app, 'Dash Detail');
    await addCase(app, agent.id);
    const r1 = await insertRun(agent.id, { startedAt: daysAgo(5), recall: 0.8, precision: 0.8, citation: 0.9, version: 1 });
    const r2 = await insertRun(agent.id, { startedAt: daysAgo(3), recall: 0.85, precision: 0.79, citation: 0.9, version: 2, cost: 0.1 });
    const rFail = await insertRun(agent.id, { startedAt: daysAgo(1), status: 'failed', recall: null, precision: null, citation: null });

    const res = await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-dashboard?range=30d` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.agent).toMatchObject({ id: agent.id, name: 'Dash Detail', provider: 'openai', model: 'gpt-4.1', enabled: true });
    expect(body).toMatchObject({ cases_total: 1, runs_in_range: 3 });
    expect(body.current).toMatchObject({ run_id: r2, agent_version: 2, cost_usd: 0.1, cases_passed: 3, cases_executed: 4 });
    expect(body.delta.recall).toBeCloseTo(0.05);
    expect(body.delta.precision).toBeCloseTo(-0.01);
    expect(body.delta.citation_accuracy).toBeCloseTo(0);
    expect(body.trend.map((p: { run_id: string }) => p.run_id)).toEqual([r1, r2]);
    expect(body.runs.map((r: { id: string }) => r.id)).toEqual([rFail, r2, r1]);
    expect(body.alert).toEqual({
      version: 2,
      dropped: [{ metric: 'precision', points: 1 }],
      rose: ['recall'],
      held: ['citation_accuracy'],
    });
    await app.close();
  });

  it('range filter keeps only runs started inside the window; default is 30d; all is unbounded; bad range is 422', async () => {
    // Regression: P2-AC-6, cards, trend and table must agree on the same window.
    const app = await makeApp();
    const agent = await createAgent(app, 'Dash Range');
    await addCase(app, agent.id);
    const recent = await insertRun(agent.id, { startedAt: daysAgo(2) });
    const mid = await insertRun(agent.id, { startedAt: daysAgo(20) });
    const old = await insertRun(agent.id, { startedAt: daysAgo(60) });
    const ancient = await insertRun(agent.id, { startedAt: daysAgo(200) });

    const ids = async (query: string) =>
      ((await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-dashboard${query}` })).json().runs as Array<{ id: string }>).map(
        (r) => r.id,
      );
    expect(await ids('?range=7d')).toEqual([recent]);
    expect(await ids('')).toEqual([recent, mid]);
    expect(await ids('?range=30d')).toEqual([recent, mid]);
    expect(await ids('?range=90d')).toEqual([recent, mid, old]);
    expect(await ids('?range=all')).toEqual([recent, mid, old, ancient]);

    // E-7: a window without runs yields empty cards/chart, not an error.
    const empty = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-dashboard?range=7d` })).json();
    expect(empty.current.run_id).toBe(recent);
    const none = await createAgent(app, 'Dash Range Empty');
    await addCase(app, none.id);
    await insertRun(none.id, { startedAt: daysAgo(100), status: 'failed', recall: null, precision: null, citation: null });
    const emptyBody = (await app.inject({ method: 'GET', url: `/agents/${none.id}/eval-dashboard?range=all` })).json();
    expect(emptyBody).toMatchObject({ current: null, delta: null, trend: [], alert: null, runs_in_range: 1 });

    expect((await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-dashboard?range=1y` })).statusCode).toBe(422);
    await app.close();
  });

  it('per-agent dashboard 404s for an unknown and a foreign-workspace agent', async () => {
    // Regression: P2-E-5 / tenancy, no cross-workspace reads.
    const app = await makeApp();
    const foreign = await foreignAgent();
    expect((await app.inject({ method: 'GET', url: `/agents/${GHOST}/eval-dashboard` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/agents/${foreign.agentId}/eval-dashboard` })).statusCode).toBe(404);
    await app.close();
  });

  it('GET /eval-runs/compare: orders by start time not version, flags current config / missing version, sums deltas and prompts', async () => {
    // Regression: P2-AC-12, E-2, E-3: A is always the earlier run; is_current_config and version_available
    // come from the agent's version snapshots; the static route is not swallowed by /eval-runs/:id.
    const app = await makeApp();
    const agent = await createAgent(app, 'Dash Compare');
    await addCase(app, agent.id);
    // v1 -> v2 (model change) so a v1 run is no longer the live config.
    expect((await app.inject({ method: 'PUT', url: `/agents/${agent.id}`, payload: { model: 'gpt-4o' } })).json().version).toBe(2);

    const early = await insertRun(agent.id, {
      startedAt: daysAgo(4), version: 2, recall: 0.5, precision: 0.6, citation: null, cost: 0.1, prompt: 'prompt early',
    });
    const late = await insertRun(agent.id, {
      startedAt: daysAgo(1), version: 1, recall: 0.75, precision: 0.8, citation: 0.9, cost: 0.3, prompt: 'prompt late',
    });
    const missing = await insertRun(agent.id, { startedAt: daysAgo(2), version: 99, prompt: 'prompt missing' });

    // Passing the later run first must not matter.
    const res = await app.inject({ method: 'GET', url: `/eval-runs/compare?a=${late}&b=${early}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.a).toMatchObject({ id: early, agent_version: 2, is_current_config: true, version_available: true });
    expect(body.b).toMatchObject({ id: late, agent_version: 1, is_current_config: false, version_available: true });
    expect(body.deltas.recall).toBeCloseTo(0.25);
    expect(body.deltas.precision).toBeCloseTo(0.2);
    expect(body.deltas.citation_accuracy).toBeNull();
    expect(body.deltas.cost_usd).toBeCloseTo(0.2);
    expect(body).toMatchObject({ prompt_a: 'prompt early', prompt_b: 'prompt late', cases_total: 1 });

    // v99 was never recorded.
    const cur = (await app.inject({ method: 'GET', url: `/eval-runs/compare?a=${early}&b=${missing}` })).json();
    expect(cur.b).toMatchObject({ id: missing, is_current_config: false, version_available: false });

    // E-2: the same run twice is allowed.
    expect((await app.inject({ method: 'GET', url: `/eval-runs/compare?a=${early}&b=${early}` })).statusCode).toBe(200);
    await app.close();
  });

  it('compare errors: 422 compare_cross_agent, 422 compare_not_finished, 404 unknown/foreign, 422 for non-uuid', async () => {
    // Regression: P2-AC-12 guards; the client maps these codes to messages.
    const app = await makeApp();
    const one = await createAgent(app, 'Dash Cmp 1');
    const two = await createAgent(app, 'Dash Cmp 2');
    await addCase(app, one.id);
    await addCase(app, two.id);
    const a1 = await insertRun(one.id, { startedAt: daysAgo(3) });
    const a2 = await insertRun(one.id, { startedAt: daysAgo(2), status: 'partial' });
    const b1 = await insertRun(two.id, { startedAt: daysAgo(2) });
    const running = await insertRun(one.id, { startedAt: daysAgo(1), status: 'running' });
    const failed = await insertRun(two.id, { startedAt: daysAgo(1), status: 'failed', recall: null });
    const foreign = await foreignAgent();
    const foreignRun = await insertRun(foreign.agentId, { startedAt: daysAgo(1), wsId: foreign.wsId });
    const get = (a: string, b: string) => app.inject({ method: 'GET', url: `/eval-runs/compare?a=${a}&b=${b}` });

    expect((await get(a1, a2)).statusCode).toBe(200); // `partial` counts as finished
    const cross = await get(a1, b1);
    expect([cross.statusCode, cross.json().error.code]).toEqual([422, 'compare_cross_agent']);
    const notDone = await get(a1, running);
    expect([notDone.statusCode, notDone.json().error.code]).toEqual([422, 'compare_not_finished']);
    expect((await get(b1, failed)).json().error.code).toBe('compare_not_finished');
    expect((await get(a1, GHOST)).statusCode).toBe(404);
    expect((await get(a1, foreignRun)).statusCode).toBe(404);
    expect((await get(foreignRun, foreignRun)).statusCode).toBe(404);
    expect((await get('nope', a1)).statusCode).toBe(422);
    await app.close();
  });

  it('POST /eval-runs/all: starts eligible agents; skips disabled, no_cases, already_running; one agent never blocks the others', async () => {
    // Regression: P2-AC-4 / E-6 mixed eligibility; skipped reasons are reported per agent and only the
    // eligible agent gets a real run.
    const llm = new StubLLM(() => reviewAnswer([11]));
    const app = await makeApp(llm);
    const eligible = await createAgent(app, 'Run All Eligible');
    const disabled = await createAgent(app, 'Run All Disabled');
    const empty = await createAgent(app, 'Run All Empty');
    const busy = await createAgent(app, 'Run All Busy');
    for (const a of [eligible, disabled, busy]) await addCase(app, a.id);
    expect((await app.inject({ method: 'PUT', url: `/agents/${disabled.id}`, payload: { enabled: false } })).statusCode).toBe(200);
    await insertRun(busy.id, { startedAt: daysAgo(0), status: 'running' });

    const res = await app.inject({ method: 'POST', url: '/eval-runs/all' });
    expect(res.statusCode).toBe(202);
    const body = res.json() as {
      started: Array<{ agent_id: string; eval_run_id: string }>;
      skipped: Array<{ agent_id: string; reason: string }>;
    };
    const mine = [eligible.id, disabled.id, empty.id, busy.id];
    expect(body.started.filter((s) => mine.includes(s.agent_id)).map((s) => s.agent_id)).toEqual([eligible.id]);
    const reasons = Object.fromEntries(body.skipped.filter((s) => mine.includes(s.agent_id)).map((s) => [s.agent_id, s.reason]));
    expect(reasons).toEqual({
      [disabled.id]: 'disabled',
      [empty.id]: 'no_cases',
      [busy.id]: 'already_running',
    });

    const runId = body.started.find((s) => s.agent_id === eligible.id)!.eval_run_id;
    const done = await waitForEvalRun(app, runId);
    expect(done.run).toMatchObject({ agent_id: eligible.id, status: 'done', cases_passed: 1 });

    // Once the first run finished the agent is eligible again, so run-all is repeatable.
    const again = (await app.inject({ method: 'POST', url: '/eval-runs/all' })).json() as typeof body;
    expect(again.started.some((s) => s.agent_id === eligible.id)).toBe(true);
    await waitForEvalRun(app, again.started.find((s) => s.agent_id === eligible.id)!.eval_run_id);
    await app.close();
  });
});
