import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import {
  CONFIG_DIFF,
  GHOST,
  StubLLM,
  caseBody,
  createAgent,
  reviewAnswer,
  seedFinding,
  seedPr,
  waitForEvalRun,
} from './helpers/eval.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[eval-cases] Docker not available — skipping integration tests.');
}

/** Eval case CRUD over HTTP: persistence, validation codes, delete/cascade semantics. */
d('eval: case CRUD (Testcontainers pg)', () => {
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

  const makeApp = (llm = new StubLLM(() => reviewAnswer([11]))) =>
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

  const create = (app: App, agentId: string, over: Record<string, unknown> = {}) =>
    app.inject({ method: 'POST', url: `/agents/${agentId}/eval-cases`, payload: caseBody(over) });

  it('create persists a manual case; list is newest first without the diff; update replaces content and keeps origin/source links', async () => {
    // Regression: P1-AC-8..9, PUT must not reset origin or sever the finding link.
    const app = await makeApp();
    const agent = await createAgent(app);

    const res = await create(app, agent.id, { name: '  trimmed name  ', notes: 'why' });
    expect(res.statusCode).toBe(201);
    const manual = res.json();
    expect(manual).toMatchObject({ agent_id: agent.id, origin: 'manual', name: 'trimmed name', notes: 'why', source_finding_id: null });

    const { prId } = await seedPr(pg.handle.db, workspaceId);
    const { findingId } = await seedFinding(pg.handle.db, workspaceId, prId, agent.id);
    const fromFinding = (await app.inject({ method: 'POST', url: `/findings/${findingId}/eval-case` })).json();

    const list = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-cases` })).json();
    expect(list.map((c: { id: string }) => c.id)).toEqual([fromFinding.id, manual.id]);
    expect(list[0]).not.toHaveProperty('input_diff');

    const put = await app.inject({
      method: 'PUT',
      url: `/eval-cases/${fromFinding.id}`,
      payload: caseBody({ name: 'renamed', expected_output: [], notes: 'edited' }),
    });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toMatchObject({
      origin: 'finding',
      source_finding_id: findingId,
      source_pr_id: prId,
      name: 'renamed',
      expected_output: [],
      notes: 'edited',
    });
    const got = (await app.inject({ method: 'GET', url: `/eval-cases/${fromFinding.id}` })).json();
    expect(got.input_diff).toBe(CONFIG_DIFF);
    expect(got.updated_at >= got.created_at).toBe(true);
    await app.close();
  });

  it('422 codes: unparsable diff, diff_too_large (1,000,001 chars reaches the service), expectation_outside_diff {index}, unknown key, ".." path; 404s', async () => {
    // Regression: P1-AC-10/11, E-5. The body limit must not turn the oversize diff into a 413.
    const app = await makeApp();
    const agent = await createAgent(app);
    const codeOf = async (res: Awaited<ReturnType<typeof create>>) => [res.statusCode, res.json().error.code] as const;

    expect(await codeOf(await create(app, agent.id, { input_diff: 'this is not a diff' }))).toEqual([422, 'diff_unparsable']);
    expect(await codeOf(await create(app, agent.id, { input_diff: 'x'.repeat(1_000_001) }))).toEqual([422, 'diff_too_large']);

    const outside = await create(app, agent.id, {
      expected_output: [
        { expect: 'must_find', file: 'src/config.ts', start_line: 11 },
        { expect: 'must_find', file: 'src/config.ts', start_line: 300 },
      ],
    });
    expect(outside.statusCode).toBe(422);
    expect(outside.json().error).toMatchObject({ code: 'expectation_outside_diff', details: { index: 1 } });

    expect(await codeOf(await create(app, agent.id, { surprise: true }))).toEqual([422, 'validation_error']);
    expect(
      await codeOf(await create(app, agent.id, { expected_output: [{ file: '../etc/passwd', start_line: 1 }] })),
    ).toEqual([422, 'validation_error']);
    expect(await codeOf(await create(app, agent.id, { expected_output: [{ file: 'a.ts', start_line: 5, end_line: 2 }] }))).toEqual([422, 'validation_error']);

    // PUT shares the validation; unknown ids are 404.
    const ok = (await create(app, agent.id)).json();
    const badPut = await app.inject({ method: 'PUT', url: `/eval-cases/${ok.id}`, payload: caseBody({ input_diff: 'nope' }) });
    expect([badPut.statusCode, badPut.json().error.code]).toEqual([422, 'diff_unparsable']);
    expect((await create(app, GHOST)).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/eval-cases/${GHOST}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'PUT', url: `/eval-cases/${GHOST}`, payload: caseBody() })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/eval-cases/${GHOST}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/agents/${GHOST}/eval-cases` })).statusCode).toBe(404);
    await app.close();
  });

  it('delete removes the case and its results, and leaves an earlier agent run metrics identical (P1-AC-14)', async () => {
    // Regression: deleting a case must not rewrite history of finished runs.
    const app = await makeApp();
    const agent = await createAgent(app);
    const c1 = (await create(app, agent.id, { name: 'one' })).json();
    const c2 = (await create(app, agent.id, { name: 'two' })).json();

    const start = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` });
    expect(start.statusCode).toBe(202);
    const before = await waitForEvalRun(app, start.json().eval_run_id);
    expect(before.run).toMatchObject({ status: 'done', cases_executed: 2, cases_passed: 2, recall: 1 });

    expect((await app.inject({ method: 'DELETE', url: `/eval-cases/${c1.id}` })).json()).toEqual({ ok: true });
    expect((await app.inject({ method: 'GET', url: `/eval-cases/${c1.id}` })).statusCode).toBe(404);
    expect(await pg.handle.db.select().from(t.evalRuns).where(eq(t.evalRuns.caseId, c1.id))).toHaveLength(0);
    expect(await pg.handle.db.select().from(t.evalRuns).where(eq(t.evalRuns.caseId, c2.id))).toHaveLength(1);

    const after = (await app.inject({ method: 'GET', url: `/eval-runs/${before.run.id}` })).json();
    expect(after.run).toEqual(before.run);
    expect(after.cases.map((r: { case_id: string }) => r.case_id)).toEqual([c2.id]);
    await app.close();
  });

  it('deleting the agent deletes its cases and eval runs', async () => {
    // Regression: eval_cases.owner_id has no FK, the agents repository must cascade by hand (E-12).
    const app = await makeApp();
    const agent = await createAgent(app);
    const keeper = await createAgent(app, 'Keeper');
    await create(app, agent.id);
    const keepCase = (await create(app, keeper.id)).json();
    const start = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` });
    await waitForEvalRun(app, start.json().eval_run_id);

    expect((await app.inject({ method: 'DELETE', url: `/agents/${agent.id}` })).statusCode).toBe(200);
    expect(await pg.handle.db.select().from(t.evalCases).where(eq(t.evalCases.ownerId, agent.id))).toHaveLength(0);
    expect(await pg.handle.db.select().from(t.evalAgentRuns).where(eq(t.evalAgentRuns.agentId, agent.id))).toHaveLength(0);
    expect((await app.inject({ method: 'GET', url: `/eval-runs/${start.json().eval_run_id}` })).statusCode).toBe(404);
    // Another agent's case is untouched.
    expect((await app.inject({ method: 'GET', url: `/eval-cases/${keepCase.id}` })).statusCode).toBe(200);
    await app.close();
  });
});
