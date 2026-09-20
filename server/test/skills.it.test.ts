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
  console.warn('[skills] Docker not available — skipping integration tests.');
}

/** Skills module: CRUD + versioning, agent bindings (tenancy, enabled), stats, import preview. */
d('skills module', () => {
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

  const skillBody = { name: 'Edge cases', type: 'rubric', body: 'Check the edges.' };
  const agentBody = {
    name: 'Skill Host',
    provider: 'openai' as const,
    model: 'gpt-4o-mini',
    system_prompt: 'Review.',
  };
  const ghost = '00000000-0000-0000-0000-000000000000';

  it('create -> v1, update bumps version, versions newest-first, delete 404s after', async () => {
    const app = await makeApp();
    const created = await app.inject({ method: 'POST', url: '/skills', payload: skillBody });
    expect(created.statusCode).toBe(201);
    const skill = created.json();
    expect(skill).toMatchObject({ name: 'Edge cases', source: 'manual', enabled: true, version: 1 });

    const upd = await app.inject({
      method: 'PUT',
      url: `/skills/${skill.id}`,
      payload: { body: 'Check the edges twice.' },
    });
    expect(upd.statusCode).toBe(200);
    expect(upd.json()).toMatchObject({ version: 2, body: 'Check the edges twice.' });

    const versions = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` })).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    expect(versions[1].body).toBe('Check the edges.');

    const listed = (await app.inject({ method: 'GET', url: '/skills' })).json();
    const row = listed.find((s: { id: string }) => s.id === skill.id);
    expect(row).toMatchObject({
      tokens: Math.ceil('Check the edges twice.'.length / 4),
      agents_count: 0,
      pull_pct: null,
      accept_pct: null,
    });

    expect((await app.inject({ method: 'DELETE', url: `/skills/${skill.id}` })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/skills/${skill.id}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'PUT', url: `/skills/${ghost}`, payload: { name: 'x' } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/skills/${ghost}/stats` })).statusCode).toBe(404);
    await app.close();
  });

  it('restore copies a past body into a NEW version; v1 and current are refused', async () => {
    const app = await makeApp();
    const skill = (await app.inject({ method: 'POST', url: '/skills', payload: skillBody })).json();
    await app.inject({ method: 'PUT', url: `/skills/${skill.id}`, payload: { body: 'second' } });
    await app.inject({ method: 'PUT', url: `/skills/${skill.id}`, payload: { body: 'third' } });
    const restore = (v: number) =>
      app.inject({ method: 'POST', url: `/skills/${skill.id}/versions/${v}/restore` });

    const r2 = await restore(2);
    expect(r2.statusCode).toBe(200);
    expect(r2.json()).toMatchObject({ version: 4, body: 'second' });

    const versions = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` })).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([4, 3, 2, 1]);
    expect(versions[1].body).toBe('third');

    expect((await restore(1)).statusCode).toBe(422);
    expect((await restore(4)).statusCode).toBe(422);
    expect((await restore(9)).statusCode).toBe(404);
    expect(
      (await app.inject({ method: 'POST', url: `/skills/${ghost}/versions/2/restore` })).statusCode,
    ).toBe(404);
    await app.close();
  });

  it('GET /agents/skill-counts counts only enabled links', async () => {
    const app = await makeApp();
    const a = (await app.inject({ method: 'POST', url: '/skills', payload: { ...skillBody, name: 'C1' } })).json();
    const b = (await app.inject({ method: 'POST', url: '/skills', payload: { ...skillBody, name: 'C2' } })).json();
    const agent = (await app.inject({ method: 'POST', url: '/agents', payload: agentBody })).json();
    const bare = (await app.inject({ method: 'POST', url: '/agents', payload: agentBody })).json();
    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { links: [{ skill_id: a.id }, { skill_id: b.id, enabled: false }] },
    });
    const counts = (await app.inject({ method: 'GET', url: '/agents/skill-counts' })).json();
    expect(counts[agent.id]).toBe(1);
    expect(counts[bare.id]).toBeUndefined();
    await app.close();
  });

  it('rejects invalid bodies at the edge (422)', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'POST', url: '/skills', payload: { ...skillBody, type: 'nope' } });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('agent links carry enabled; snapshot lists only enabled skills; skills stay foreign-safe', async () => {
    const app = await makeApp();
    const a = (await app.inject({ method: 'POST', url: '/skills', payload: { ...skillBody, name: 'A' } })).json();
    const b = (await app.inject({ method: 'POST', url: '/skills', payload: { ...skillBody, name: 'B' } })).json();
    const agent = (await app.inject({ method: 'POST', url: '/agents', payload: agentBody })).json();

    const set = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { links: [{ skill_id: b.id, enabled: false }, { skill_id: a.id }] },
    });
    expect(set.statusCode).toBe(200);
    expect(set.json()).toEqual([
      { agent_id: agent.id, skill_id: b.id, order: 0, enabled: false },
      { agent_id: agent.id, skill_id: a.id, order: 1, enabled: true },
    ]);

    // Legacy skill_ids form still works (all enabled).
    const legacy = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_ids: [a.id, b.id] },
    });
    expect(legacy.json().map((l: { enabled: boolean }) => l.enabled)).toEqual([true, true]);

    // Single link toggles enabled without losing order.
    const one = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_id: a.id, order: 0, enabled: false },
    });
    expect(one.json().find((l: { skill_id: string }) => l.skill_id === a.id).enabled).toBe(false);

    // Snapshot on the next config change lists only enabled skills, in order.
    await app.inject({ method: 'PUT', url: `/agents/${agent.id}`, payload: { model: 'gpt-4o' } });
    const v = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/versions/2` })).json();
    expect(v.config.skills).toEqual([b.id]);

    const stats = (await app.inject({ method: 'GET', url: `/skills/${a.id}/stats` })).json();
    expect(stats).toMatchObject({ used_by: 1, pull_pct: null, accept_pct: null, findings_30d: 0, by_category: [] });
    expect(stats.agents).toEqual([{ id: agent.id, name: 'Skill Host' }]);
    await app.close();
  });

  it('refuses to bind a skill from another workspace', async () => {
    const app = await makeApp();
    const [otherWs] = await pg.handle.db.insert(t.workspaces).values({ name: 'skills-other' }).returning();
    const [foreign] = await pg.handle.db
      .insert(t.skills)
      .values({
        workspaceId: otherWs!.id,
        name: 'Foreign',
        description: '',
        type: 'custom',
        source: 'manual',
        body: 'x',
      })
      .returning();
    const agent = (await app.inject({ method: 'POST', url: '/agents', payload: agentBody })).json();

    for (const payload of [
      { skill_ids: [foreign!.id] },
      { links: [{ skill_id: foreign!.id }] },
      { skill_id: foreign!.id },
    ]) {
      const res = await app.inject({ method: 'POST', url: `/agents/${agent.id}/skills`, payload });
      expect(res.statusCode).toBe(404);
    }
    expect((await app.inject({ method: 'GET', url: `/agents/${agent.id}/skills` })).json()).toEqual([]);
    // And the foreign skill is invisible through the skills API.
    expect((await app.inject({ method: 'GET', url: `/skills/${foreign!.id}` })).statusCode).toBe(404);
    await app.close();
  });

  it('stats compute pull%, accept% and by_category from runs of bound agents', async () => {
    const { db } = pg.handle;
    const app = await makeApp();
    const [ws] = await db.select().from(t.workspaces).where(eq(t.workspaces.name, 'default'));
    const skill = (await app.inject({ method: 'POST', url: '/skills', payload: { ...skillBody, name: 'Stat Skill' } })).json();
    const agent = (await app.inject({ method: 'POST', url: '/agents', payload: agentBody })).json();
    await app.inject({ method: 'POST', url: `/agents/${agent.id}/skills`, payload: { skill_ids: [skill.id] } });

    const mkRun = async (skills: string | null) => {
      const [run] = await db
        .insert(t.agentRuns)
        .values({ workspaceId: ws!.id, agentId: agent.id, status: 'done' })
        .returning();
      await db.insert(t.runTraces).values({
        runId: run!.id,
        trace: { prompt_assembly: { system: 's', skills, user: 'u' } },
      });
      return run!;
    };
    const withSkill = await mkRun('## Skills / rules\n### Stat Skill\nCheck.');
    await mkRun(null);

    const [pr] = await db.select().from(t.pullRequests).limit(1);
    const [review] = await db
      .insert(t.reviews)
      .values({ workspaceId: ws!.id, prId: pr!.id, agentId: agent.id, runId: withSkill.id, kind: 'review' })
      .returning();
    const f = (category: string, accepted: boolean) => ({
      reviewId: review!.id,
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
    await db.insert(t.findings).values([f('tests', true), f('tests', false), f('style', false), f('style', false)]);

    const stats = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/stats` })).json();
    expect(stats).toMatchObject({ used_by: 1, pull_pct: 50, accept_pct: 25, findings_30d: 4 });
    expect(stats.by_category).toEqual([
      { category: 'style', count: 2 },
      { category: 'tests', count: 2 },
    ]);
    const row = (await app.inject({ method: 'GET', url: '/skills' })).json().find((s: { id: string }) => s.id === skill.id);
    expect(row).toMatchObject({ agents_count: 1, pull_pct: 50, accept_pct: 25 });
    await app.close();
  });

  it('import preview parses front-matter and persists nothing', async () => {
    const app = await makeApp();
    const before = (await pg.handle.db.select().from(t.skills)).length;
    const res = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: {
        filename: 'flaky.md',
        content: '---\nname: Flaky\ntype: security\n---\n# H\n\nSee https://x.test\n',
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ name: 'Flaky', type: 'security' });
    expect(res.json().warnings.length).toBeGreaterThan(0);
    expect((await pg.handle.db.select().from(t.skills)).length).toBe(before);

    const big = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { filename: 'big.md', content: 'x'.repeat(100_001) },
    });
    expect(big.statusCode).toBe(422);
    await app.close();
  });
});
