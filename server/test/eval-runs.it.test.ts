import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import {
  GHOST,
  StubLLM,
  caseBody,
  createAgent,
  reviewAnswer,
  waitForCaseResult,
  waitForEvalRun,
} from './helpers/eval.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[eval-runs] Docker not available — skipping integration tests.');
}

/** Agent-level and single-case eval runs through the real executor, repository and engine with a stub LLM. */
d('eval: runs (Testcontainers pg)', () => {
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

  const makeApp = (llm: StubLLM) =>
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
    return res.json() as { id: string };
  };
  const startRun = (app: App, agentId: string) => app.inject({ method: 'POST', url: `/agents/${agentId}/eval-runs` });

  it('202 body, recorded agent snapshot, and a prompt built only from case diff + PR meta (no repo/intent/context/skills)', async () => {
    // Regression: P1-AC-15/16, runs must be reproducible from the case and attributable to a version.
    const llm = new StubLLM(() => reviewAnswer([11]));
    const app = await makeApp(llm);
    const agent = await createAgent(app);
    const c = await addCase(app, agent.id, { input_meta: { title: 'Throttle the API', body: 'PR body marker 4411' } });

    const start = await startRun(app, agent.id);
    expect(start.statusCode).toBe(202);
    expect(start.json()).toMatchObject({ status: 'running', cases_total: 1 });
    const done = await waitForEvalRun(app, start.json().eval_run_id);

    expect(done.run).toMatchObject({
      agent_id: agent.id,
      agent_version: agent.version,
      provider: 'openai',
      model: 'gpt-4.1',
      system_prompt: 'You are a strict reviewer.',
      status: 'done',
      cases_total: 1,
      cases_executed: 1,
      cases_errored: 0,
      cases_passed: 1,
      recall: 1,
      precision: 1,
      citation_accuracy: 1,
    });
    expect(done.progress).toEqual({ done: 1, total: 1 });
    expect(done.cases).toHaveLength(1);
    expect(done.cases[0]).toMatchObject({ case_id: c.id, case_name: 'manual case', status: 'passed', expected_count: 1, got_count: 1 });

    expect(llm.prompts).toHaveLength(1);
    const prompt = llm.prompts[0]!;
    expect(prompt).toContain('stripeKey');
    expect(prompt).toContain('Throttle the API');
    expect(prompt).toContain('## PR description');
    expect(prompt).toContain('PR body marker 4411');
    expect(prompt).toContain('You are a strict reviewer.');
    for (const section of ['## Repo skeleton', '## Callers of changed symbols', '## Derived intent', '## Project context', '## Skills / rules', '## Relevant memory']) {
      expect(prompt).not.toContain(section);
    }
    await app.close();
  });

  it('GET /agents/:id/eval-runs lists newest first and honours ?since; bad since is 422; unknown agent 404', async () => {
    // Regression: the dashboard refresh and trend read this list.
    const app = await makeApp(new StubLLM(() => reviewAnswer([11])));
    const agent = await createAgent(app);
    await addCase(app, agent.id);
    const r1 = (await startRun(app, agent.id)).json().eval_run_id;
    await waitForEvalRun(app, r1);
    const r2 = (await startRun(app, agent.id)).json().eval_run_id;
    await waitForEvalRun(app, r2);

    const list = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-runs` })).json();
    expect(list.map((r: { id: string }) => r.id)).toEqual([r2, r1]);

    const future = encodeURIComponent(new Date(Date.now() + 60_000).toISOString());
    expect((await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-runs?since=${future}` })).json()).toEqual([]);
    expect((await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-runs?since=yesterday` })).statusCode).toBe(422);
    expect((await app.inject({ method: 'GET', url: `/agents/${GHOST}/eval-runs` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/eval-runs/${GHOST}` })).statusCode).toBe(404);
    await app.close();
  });

  it('one failing case of three => partial with metrics over the two executed (P1-AC-19)', async () => {
    // Regression: one provider error must not fail the run nor dilute recall/precision with the errored case.
    const llm = new StubLLM((prompt) => {
      if (prompt.includes('BOOM')) throw new Error('provider exploded');
      return reviewAnswer([11]);
    });
    const app = await makeApp(llm);
    const agent = await createAgent(app);
    await addCase(app, agent.id, { name: 'a' });
    const bad = await addCase(app, agent.id, { name: 'b', input_meta: { title: 't', body: 'BOOM' } });
    await addCase(app, agent.id, { name: 'c' });

    const done = await waitForEvalRun(app, (await startRun(app, agent.id)).json().eval_run_id);
    expect(done.run).toMatchObject({
      status: 'partial',
      cases_total: 3,
      cases_executed: 2,
      cases_errored: 1,
      cases_passed: 2,
      recall: 1,
      precision: 1,
      citation_accuracy: 1,
    });
    expect(done.progress).toEqual({ done: 3, total: 3 });
    const errored = done.cases.find((r: { case_id: string }) => r.case_id === bad.id);
    expect(errored).toMatchObject({ status: 'error', error_reason: 'provider exploded' });
    await app.close();
  });

  it('all cases failing => failed with null metrics', async () => {
    // Regression: a fully errored run must show "no data", not 0%.
    const app = await makeApp(
      new StubLLM(() => {
        throw new Error('down');
      }),
    );
    const agent = await createAgent(app);
    await addCase(app, agent.id, { name: 'a' });
    await addCase(app, agent.id, { name: 'b' });
    const done = await waitForEvalRun(app, (await startRun(app, agent.id)).json().eval_run_id);
    expect(done.run).toMatchObject({
      status: 'failed',
      cases_executed: 0,
      cases_errored: 2,
      recall: null,
      precision: null,
      citation_accuracy: null,
      cost_usd: null,
    });
    await app.close();
  });

  it('409 eval_run_active while a run is in flight, 422 no_cases, 404 unknown agent; a new run works after completion', async () => {
    // Regression: P1-AC-17, one active run per agent; the 409 carries the active run id.
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const app = await makeApp(new StubLLM(async () => (await gate, reviewAnswer([11]))));
    const agent = await createAgent(app);
    const empty = await createAgent(app, 'Empty');
    await addCase(app, agent.id);

    expect((await startRun(app, empty.id)).json().error.code).toBe('no_cases');
    expect((await startRun(app, GHOST)).statusCode).toBe(404);

    const first = await startRun(app, agent.id);
    expect(first.statusCode).toBe(202);
    const second = await startRun(app, agent.id);
    expect(second.statusCode).toBe(409);
    expect(second.json().error).toMatchObject({ code: 'eval_run_active', details: { eval_run_id: first.json().eval_run_id } });
    const running = (await app.inject({ method: 'GET', url: `/eval-runs/${first.json().eval_run_id}` })).json();
    expect(running.run.status).toBe('running');

    release();
    await waitForEvalRun(app, first.json().eval_run_id);
    expect((await startRun(app, agent.id)).statusCode).toBe(202);
    await app.close();
  });

  it('single-case run stores a result and no agent-level run (P1-AC-13); 409 eval_case_running while it runs', async () => {
    // Regression: running one case must not create an agent run (dashboards) and must not double-run.
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const app = await makeApp(new StubLLM(async () => (await gate, reviewAnswer([11]))));
    const agent = await createAgent(app);
    const c = await addCase(app, agent.id);

    const run = await app.inject({ method: 'POST', url: `/eval-cases/${c.id}/run` });
    expect(run.statusCode).toBe(202);
    const dup = await app.inject({ method: 'POST', url: `/eval-cases/${c.id}/run` });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error).toMatchObject({ code: 'eval_case_running', details: { result_id: run.json().result_id } });
    expect((await app.inject({ method: 'POST', url: `/eval-cases/${GHOST}/run` })).statusCode).toBe(404);

    release();
    const result = await waitForCaseResult(app, c.id);
    expect(result).toMatchObject({ id: run.json().result_id, status: 'passed', eval_run_id: null, got_count: 1, kept_count: 1, dropped_count: 0 });
    expect(await pg.handle.db.select().from(t.evalAgentRuns).where(eq(t.evalAgentRuns.agentId, agent.id))).toHaveLength(0);
    // A finished case can be run again.
    expect((await app.inject({ method: 'POST', url: `/eval-cases/${c.id}/run` })).statusCode).toBe(202);
    await waitForCaseResult(app, c.id);
    await app.close();
  });

  it('a fresh buildApp fails stale running runs (interrupted) and errors stale running results (P1-AC-20)', async () => {
    // Regression: after a crash the agent must not be blocked by a forever-"running" row.
    const app = await makeApp(new StubLLM(() => reviewAnswer([11])));
    const agent = await createAgent(app);
    const c = await addCase(app, agent.id);
    const [staleRun] = await pg.handle.db
      .insert(t.evalAgentRuns)
      .values({
        workspaceId,
        agentId: agent.id,
        agentVersion: 1,
        provider: 'openai',
        model: 'gpt-4.1',
        strategy: 'single-pass',
        systemPrompt: 'p',
        status: 'running',
        casesTotal: 1,
      })
      .returning();
    const [staleResult] = await pg.handle.db.insert(t.evalRuns).values({ caseId: c.id, status: 'running' }).returning();
    await app.close();

    const fresh = await makeApp(new StubLLM(() => reviewAnswer([11])));
    const run = (await fresh.inject({ method: 'GET', url: `/eval-runs/${staleRun!.id}` })).json();
    expect(run.run).toMatchObject({ status: 'failed', reason: 'interrupted' });
    expect(run.run.finished_at).not.toBeNull();
    const [result] = await pg.handle.db.select().from(t.evalRuns).where(eq(t.evalRuns.id, staleResult!.id));
    expect(result).toMatchObject({ status: 'error', errorReason: 'interrupted' });

    const again = await startRun(fresh, agent.id);
    expect(again.statusCode).toBe(202);
    await waitForEvalRun(fresh, again.json().eval_run_id);
    await fresh.close();
  });
});
