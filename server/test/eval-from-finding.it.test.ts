import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { CONFIG_DIFF, GHOST, StubLLM, createAgent, seedFinding, seedPr } from './helpers/eval.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[eval-from-finding] Docker not available — skipping integration tests.');
}

/** POST /findings/:id/eval-case: decision -> expectation, 409/422/404 branches, eval_case_id on the reviews read. */
d('eval: create case from finding (Testcontainers pg)', () => {
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

  const makeApp = () =>
    buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient(),
        llm: { openai: new StubLLM(), openrouter: new StubLLM() },
      },
    });

  const post = (app: Awaited<ReturnType<typeof makeApp>>, id: string) =>
    app.inject({ method: 'POST', url: `/findings/${id}/eval-case` });

  it('accepted -> must_find, dismissed -> must_not_flag; stores diff, PR meta, slug name, source links', async () => {
    // Regression: AC-3..AC-6, the case must freeze exactly what the reviewer decided.
    const app = await makeApp();
    const agent = await createAgent(app);
    const { prId } = await seedPr(pg.handle.db, workspaceId, { title: 'Add rate limiting', body: 'Throttles the API.' });
    const acc = await seedFinding(pg.handle.db, workspaceId, prId, agent.id, { decision: 'accepted' });
    const dis = await seedFinding(pg.handle.db, workspaceId, prId, agent.id, {
      decision: 'dismissed',
      title: 'Noisy lint nit',
      startLine: 12,
    });

    const a = await post(app, acc.findingId);
    expect(a.statusCode).toBe(201);
    expect(a.json()).toMatchObject({
      agent_id: agent.id,
      origin: 'finding',
      name: 'hardcoded-stripe-secret-key',
      input_diff: CONFIG_DIFF,
      input_meta: { title: 'Add rate limiting', body: 'Throttles the API.' },
      source_finding_id: acc.findingId,
      source_pr_id: prId,
      latest_result: null,
      expected_output: [{ expect: 'must_find', file: 'src/config.ts', start_line: 11, end_line: 11, severity: 'CRITICAL' }],
    });

    const b = await post(app, dis.findingId);
    expect(b.statusCode).toBe(201);
    expect(b.json()).toMatchObject({
      name: 'noisy-lint-nit',
      expected_output: [{ expect: 'must_not_flag', start_line: 12 }],
    });
    await app.close();
  });

  it('second create is 409 with the existing case id and the case count is unchanged; reviews read shows eval_case_id', async () => {
    // Regression: AC-5, duplicates must be impossible and the PR panel must be able to show "In eval set".
    const app = await makeApp();
    const agent = await createAgent(app);
    const { prId } = await seedPr(pg.handle.db, workspaceId);
    const { findingId } = await seedFinding(pg.handle.db, workspaceId, prId, agent.id);
    const other = await seedFinding(pg.handle.db, workspaceId, prId, agent.id, { startLine: 12 });

    const first = await post(app, findingId);
    expect(first.statusCode).toBe(201);
    const second = await post(app, findingId);
    expect(second.statusCode).toBe(409);
    expect(second.json().error).toMatchObject({ code: 'eval_case_exists', details: { case_id: first.json().id } });

    const list = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-cases` })).json();
    expect(list).toHaveLength(1);

    const reviews = (await app.inject({ method: 'GET', url: `/pulls/${prId}/reviews` })).json() as Array<{
      findings: Array<{ id: string; eval_case_id: string | null }>;
    }>;
    const links = Object.fromEntries(reviews.flatMap((r) => r.findings).map((x) => [x.id, x.eval_case_id]));
    expect(links[findingId]).toBe(first.json().id);
    expect(links[other.findingId]).toBeNull();
    await app.close();
  });

  it('422 for undecided, range_outside_diff, diff_unavailable, agent_missing; 404 for unknown and foreign-workspace findings', async () => {
    // Regression: each rejection keeps its code; tenancy must hide other workspaces' findings.
    const app = await makeApp();
    const agent = await createAgent(app);
    const { prId } = await seedPr(pg.handle.db, workspaceId);
    const code = async (id: string) => {
      const res = await post(app, id);
      return [res.statusCode, res.json().error.code];
    };

    const undecided = await seedFinding(pg.handle.db, workspaceId, prId, agent.id, { decision: 'none' });
    expect(await code(undecided.findingId)).toEqual([422, 'undecided']);

    const outside = await seedFinding(pg.handle.db, workspaceId, prId, agent.id, { startLine: 400, endLine: 401 });
    expect(await code(outside.findingId)).toEqual([422, 'range_outside_diff']);

    const noPatch = await seedPr(pg.handle.db, workspaceId, { patch: null });
    const np = await seedFinding(pg.handle.db, workspaceId, noPatch.prId, agent.id);
    expect(await code(np.findingId)).toEqual([422, 'diff_unavailable']);

    const doomed = await createAgent(app, 'Doomed');
    const orphan = await seedFinding(pg.handle.db, workspaceId, prId, doomed.id);
    expect((await app.inject({ method: 'DELETE', url: `/agents/${doomed.id}` })).statusCode).toBe(200);
    expect(await code(orphan.findingId)).toEqual([422, 'agent_missing']);

    expect(await code(GHOST)).toEqual([404, 'not_found']);

    const [foreignWs] = await pg.handle.db.insert(t.workspaces).values({ name: 'foreign' }).returning();
    const [foreignAgent] = await pg.handle.db
      .insert(t.agents)
      .values({ workspaceId: foreignWs!.id, name: 'x', provider: 'openai', model: 'm', systemPrompt: 'p' })
      .returning();
    const fpr = await seedPr(pg.handle.db, foreignWs!.id);
    const foreign = await seedFinding(pg.handle.db, foreignWs!.id, fpr.prId, foreignAgent!.id);
    expect(await code(foreign.findingId)).toEqual([404, 'not_found']);
    expect(await pg.handle.db.select().from(t.evalCases).where(eq(t.evalCases.sourceFindingId, foreign.findingId))).toHaveLength(0);
    await app.close();
  });
});
