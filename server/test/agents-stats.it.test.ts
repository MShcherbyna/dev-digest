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

  const emptyStats = {
    runs_30d: 0,
    runs_trend: new Array(30).fill(0),
    accept_pct: null,
    avg_cost_usd: null,
    cost_delta_usd: null,
    avg_duration_ms: null,
    findings_30d: 0,
    skill_usage: [],
    memory_usage: [],
    severity_weekly: ['w1', 'w2', 'w3', 'w4', 'w5', 'w6'].map((week) => ({
      week,
      CRITICAL: 0,
      WARNING: 0,
      SUGGESTION: 0,
    })),
    by_category: [],
    recent_runs: [],
  };

  it('no data -> zeros and nulls; unknown agent -> 404', async () => {
    const app = await makeApp();
    const agent = (await app.inject({ method: 'POST', url: '/agents', payload: agentBody })).json();
    const res = await app.inject({ method: 'GET', url: `/agents/${agent.id}/stats` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(emptyStats);
    expect((await app.inject({ method: 'GET', url: `/agents/${ghost}/stats` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/agents/nope/stats' })).statusCode).toBe(422);
    await app.close();
  });

  it('seeded runs, traces and findings across windows produce every field', async () => {
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
    const ago = (days: number) => new Date(Date.now() - days * day);
    const [pr] = await db.select().from(t.pullRequests).limit(1);
    const mk = async (over: Partial<typeof t.agentRuns.$inferInsert>) => {
      const [run] = await db
        .insert(t.agentRuns)
        .values({ workspaceId: ws!.id, agentId: agent.id, status: 'done', ...over })
        .returning();
      return run!;
    };
    const trace = (runId: string, skills: string | null, memory: unknown[]) =>
      db.insert(t.runTraces).values({
        runId,
        trace: { prompt_assembly: { system: 's', skills, memory: null, specs: null, user: '' }, memory_pulled: memory },
      });

    const r1 = await mk({ ranAt: ago(0.5), costUsd: 0.1, durationMs: 1000, tokensIn: 100, tokensOut: 50, source: 'ci', prId: pr!.id });
    const r2 = await mk({ ranAt: ago(3.5), costUsd: 0.3, durationMs: 3000 });
    const r3 = await mk({ ranAt: ago(10.5), tokensIn: 5 }); // no cost / duration / trace
    await mk({ ranAt: ago(1), status: 'failed', costUsd: 9 }); // not done
    const r5 = await mk({ ranAt: ago(35), costUsd: 0.05 }); // previous window
    const r6 = await mk({ ranAt: ago(70), costUsd: 9 }); // before both windows
    const [otherWs] = await db.insert(t.workspaces).values({ name: 'stats-isolation' }).returning();
    await db
      .insert(t.agentRuns)
      .values({ workspaceId: otherWs!.id, agentId: agent.id, status: 'done', ranAt: ago(1), costUsd: 100 });

    await trace(r1.id, '### On\nbody', [{ pr: 1, text: 'm1' }, { text: 'm2' }]);
    await trace(r2.id, '### On\nbody\n\n### LinkOff\nbody', [{ text: 'm1' }]);

    const review = async (runId: string) => {
      const [rev] = await db
        .insert(t.reviews)
        .values({ workspaceId: ws!.id, prId: pr!.id, agentId: agent.id, runId, kind: 'review' })
        .returning();
      return rev!;
    };
    const rev1 = await review(r1.id);
    const rev2 = await review(r2.id);
    const rev5 = await review(r5.id);
    const f = (reviewId: string, category: string, severity: string, accepted = false, kind = 'finding') => ({
      reviewId,
      file: 'a.ts',
      startLine: 1,
      endLine: 1,
      severity,
      category,
      kind,
      title: 't',
      rationale: 'r',
      confidence: 0.9,
      ...(accepted ? { acceptedAt: new Date() } : {}),
    });
    await db.insert(t.findings).values([
      f(rev1.id, 'tests', 'CRITICAL', true),
      f(rev1.id, 'style', 'WARNING'),
      f(rev1.id, 'style', 'WARNING', false, 'summary-note'), // not kind='finding'
      f(rev2.id, 'style', 'SUGGESTION'),
      f(rev2.id, 'style', 'SUGGESTION'),
      f(rev5.id, 'bug', 'CRITICAL'), // previous window: only the weekly chart sees it
    ]);

    const res = await app.inject({ method: 'GET', url: `/agents/${agent.id}/stats` });
    expect(res.statusCode).toBe(200);
    const stats = res.json();

    expect(stats.runs_30d).toBe(3);
    expect(stats.runs_trend).toHaveLength(30);
    expect(stats.runs_trend[29]).toBe(1);
    expect(stats.runs_trend[26]).toBe(1);
    expect(stats.runs_trend[19]).toBe(1);
    expect(stats.runs_trend.reduce((a: number, b: number) => a + b, 0)).toBe(3);
    expect(stats.avg_cost_usd).toBeCloseTo(0.2);
    expect(stats.cost_delta_usd).toBeCloseTo(0.15);
    expect(stats.avg_duration_ms).toBe(2000);
    expect(stats.findings_30d).toBe(4);
    expect(stats.accept_pct).toBe(25);
    expect(stats.by_category).toEqual([
      { category: 'style', count: 3 },
      { category: 'tests', count: 1 },
    ]);
    expect(stats.skill_usage).toEqual([
      { id: sOn.id, name: 'On', enabled: true, pct: 66.7 },
      { id: sLink.id, name: 'LinkOff', enabled: false, pct: 33.3 },
      { id: sGlobal.id, name: 'GlobalOff', enabled: false, pct: 0 },
    ]);
    expect(stats.memory_usage).toEqual([
      { label: 'm1', pct: 66.7 },
      { label: 'm2', pct: 33.3 },
    ]);
    expect(stats.severity_weekly).toEqual([
      { week: 'w1', CRITICAL: 1, WARNING: 0, SUGGESTION: 0 },
      { week: 'w2', CRITICAL: 0, WARNING: 0, SUGGESTION: 0 },
      { week: 'w3', CRITICAL: 0, WARNING: 0, SUGGESTION: 0 },
      { week: 'w4', CRITICAL: 0, WARNING: 0, SUGGESTION: 0 },
      { week: 'w5', CRITICAL: 0, WARNING: 0, SUGGESTION: 0 },
      { week: 'w6', CRITICAL: 1, WARNING: 1, SUGGESTION: 2 },
    ]);
    expect(stats.recent_runs.map((r: { run_id: string }) => r.run_id)).toEqual([r1.id, r2.id, r3.id, r5.id, r6.id]);
    expect(stats.recent_runs[0]).toEqual({
      run_id: r1.id,
      ran_at: r1.ranAt.toISOString(),
      pr_number: pr!.number,
      repo_id: pr!.repoId,
      tokens: 150,
      cost_usd: 0.1,
      findings: 2,
      source: 'ci',
    });
    expect(stats.recent_runs[1]).toMatchObject({ pr_number: null, repo_id: null, tokens: null, findings: 2, source: 'local' });
    expect(stats.recent_runs[2]).toMatchObject({ tokens: 5, cost_usd: null, findings: 0 });
    expect(stats.recent_runs[3]).toMatchObject({ findings: 1 });
    await app.close();
  });

  it('caps recent_runs at 20, newest first', async () => {
    const { db } = pg.handle;
    const app = await makeApp();
    const [ws] = await db.select().from(t.workspaces).where(eq(t.workspaces.name, 'default'));
    const agent = (await app.inject({ method: 'POST', url: '/agents', payload: agentBody })).json();
    await db.insert(t.agentRuns).values(
      Array.from({ length: 25 }, (_, i) => ({
        workspaceId: ws!.id,
        agentId: agent.id,
        status: 'done',
        ranAt: new Date(Date.now() - (i + 1) * 60 * 60 * 1000),
      })),
    );
    const stats = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/stats` })).json();
    expect(stats.runs_30d).toBe(25);
    expect(stats.recent_runs).toHaveLength(20);
    const times = stats.recent_runs.map((r: { ran_at: string }) => r.ran_at);
    expect([...times].sort().reverse()).toEqual(times);
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
