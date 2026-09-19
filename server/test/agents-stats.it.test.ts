import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[agents-stats] Docker not available — skipping integration tests.');
}

/** GET /agents/:id/stats — last-30d usage: runs, accept%, avg cost, skills, categories. */
d('GET /agents/:id/stats', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  const agentBody = {
    name: 'Stats Host',
    provider: 'openai' as const,
    model: 'gpt-4o-mini',
    system_prompt: 'Review.',
  };
  const skillBody = { name: 'S', type: 'rubric', body: 'Check.' };
  const ghost = '00000000-0000-0000-0000-000000000000';

  it('no data -> zeros and nulls; unknown agent -> 404', async () => {
    const app = await makeApp();
    const agent = (await app.inject({ method: 'POST', url: '/agents', payload: agentBody })).json();
    const res = await app.inject({ method: 'GET', url: `/agents/${agent.id}/stats` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      runs_30d: 0,
      accept_pct: null,
      avg_cost_usd: null,
      findings_30d: 0,
      skills: [],
      by_category: [],
    });
    expect((await app.inject({ method: 'GET', url: `/agents/${ghost}/stats` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/agents/nope/stats' })).statusCode).toBe(422);
    await app.close();
  });

  it('seeded runs + findings produce correct numbers', async () => {
    const { db } = pg.handle;
    const app = await makeApp();
    const [ws] = await db.select().from(t.workspaces).where(eq(t.workspaces.name, 'default'));
    const agent = (await app.inject({ method: 'POST', url: '/agents', payload: agentBody })).json();
    const sOn = (await app.inject({ method: 'POST', url: '/skills', payload: { ...skillBody, name: 'On' } })).json();
    const sLink = (await app.inject({ method: 'POST', url: '/skills', payload: { ...skillBody, name: 'LinkOff' } })).json();
    const sGlobal = (await app.inject({ method: 'POST', url: '/skills', payload: { ...skillBody, name: 'GlobalOff' } })).json();
    await app.inject({ method: 'PUT', url: `/skills/${sGlobal.id}`, payload: { enabled: false } });
    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: {
        links: [
          { skill_id: sLink.id, enabled: false },
          { skill_id: sOn.id },
          { skill_id: sGlobal.id },
        ],
      },
    });

    const day = 24 * 60 * 60 * 1000;
    const mk = async (over: Partial<typeof t.agentRuns.$inferInsert>) => {
      const [run] = await db
        .insert(t.agentRuns)
        .values({ workspaceId: ws!.id, agentId: agent.id, status: 'done', ...over })
        .returning();
      return run!;
    };
    const r1 = await mk({ costUsd: 0.1 });
    const r2 = await mk({ costUsd: 0.3 });
    await mk({}); // done, no cost -> counts as a run, ignored for the average
    await mk({ status: 'failed', costUsd: 9 });
    await mk({ costUsd: 9, ranAt: new Date(Date.now() - 40 * day) }); // outside the window

    const [pr] = await db.select().from(t.pullRequests).limit(1);
    const review = async (runId: string) => {
      const [rev] = await db
        .insert(t.reviews)
        .values({ workspaceId: ws!.id, prId: pr!.id, agentId: agent.id, runId, kind: 'review' })
        .returning();
      return rev!;
    };
    const rev1 = await review(r1.id);
    const rev2 = await review(r2.id);
    const f = (reviewId: string, category: string, accepted: boolean) => ({
      reviewId,
      file: 'a.ts',
      startLine: 1,
      endLine: 1,
      severity: 'warning',
      category,
      title: 't',
      rationale: 'r',
      confidence: 0.9,
      ...(accepted ? { acceptedAt: new Date() } : {}),
    });
    await db
      .insert(t.findings)
      .values([
        f(rev1.id, 'tests', true),
        f(rev1.id, 'style', false),
        f(rev2.id, 'style', false),
        f(rev2.id, 'style', false),
      ]);

    const res = await app.inject({ method: 'GET', url: `/agents/${agent.id}/stats` });
    expect(res.statusCode).toBe(200);
    const stats = res.json();
    expect(stats).toMatchObject({ runs_30d: 3, accept_pct: 25, findings_30d: 4 });
    expect(stats.avg_cost_usd).toBeCloseTo(0.2);
    expect(stats.by_category).toEqual([
      { category: 'style', count: 3 },
      { category: 'tests', count: 1 },
    ]);
    expect(stats.skills).toEqual([
      { id: sLink.id, name: 'LinkOff', enabled: false },
      { id: sOn.id, name: 'On', enabled: true },
      { id: sGlobal.id, name: 'GlobalOff', enabled: false },
    ]);
    await app.close();
  });

  it("another workspace's agent -> 404", async () => {
    const { db } = pg.handle;
    const app = await makeApp();
    const [otherWs] = await db.insert(t.workspaces).values({ name: 'stats-other' }).returning();
    const [foreign] = await db
      .insert(t.agents)
      .values({
        workspaceId: otherWs!.id,
        name: 'Foreign',
        provider: 'openai',
        model: 'gpt-4o-mini',
        systemPrompt: 'x',
      })
      .returning();
    const res = await app.inject({ method: 'GET', url: `/agents/${foreign!.id}/stats` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
