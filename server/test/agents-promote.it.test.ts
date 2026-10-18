import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { AgentsRepository } from '../src/modules/agents/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[agents-promote] Docker not available — skipping integration tests.');
}

const GHOST = '00000000-0000-0000-0000-000000000000';

/** POST /agents/:id/promote: re-applies a recorded version as a NEW version (append-only history). */
d('POST /agents/:id/promote', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  const makeApp = () =>
    buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  type App = Awaited<ReturnType<typeof makeApp>>;

  /** Agent at v1, edited to v2 (model, prompt, strategy), with one linked skill. */
  async function setup(app: App) {
    const created = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name: `Promo ${Math.random()}`, provider: 'openai', model: 'gpt-4o-mini', system_prompt: 'Original prompt.', ci_fail_on: 'critical' },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().id as string;
    const skill = (
      await app.inject({ method: 'POST', url: '/skills', payload: { name: `Promo skill ${id}`, type: 'rubric', body: 'Check.' } })
    ).json();
    const linked = await app.inject({ method: 'POST', url: `/agents/${id}/skills`, payload: { skill_ids: [skill.id] } });
    expect(linked.statusCode).toBe(200);
    const edited = await app.inject({
      method: 'PUT',
      url: `/agents/${id}`,
      payload: { model: 'gpt-4o', system_prompt: 'Edited prompt.', strategy: 'map-reduce', ci_fail_on: 'never' },
    });
    expect(edited.json().version).toBe(2);
    return { id, skillId: skill.id as string };
  }

  const promote = (app: App, id: string, version: unknown) =>
    app.inject({ method: 'POST', url: `/agents/${id}/promote`, payload: { version } });
  const versions = async (app: App, id: string) =>
    (await app.inject({ method: 'GET', url: `/agents/${id}/versions` })).json() as Array<{
      version: number;
      config: Record<string, unknown>;
    }>;

  it('promote v1 appends v3 whose config equals the v1 snapshot; skill links and the v1/v2 history stay untouched', async () => {
    // Regression: P2-AC-15, promote must roll the agent back by APPENDING a version (never rewriting history),
    // restoring all seven config fields and leaving skill links alone.
    const app = await makeApp();
    const { id } = await setup(app);
    const linksBefore = (await app.inject({ method: 'GET', url: `/agents/${id}/skills` })).json();
    const before = await versions(app, id);
    const v1 = before.find((v) => v.version === 1)!;

    const res = await promote(app, id, 1);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.newVersion).toBe(3);
    expect(body.agent).toMatchObject({
      id,
      version: 3,
      provider: v1.config.provider,
      model: v1.config.model,
      system_prompt: v1.config.system_prompt,
      strategy: v1.config.strategy,
      ci_fail_on: v1.config.ci_fail_on,
      repo_intel: v1.config.repo_intel,
    });

    const after = await versions(app, id);
    expect(after.map((v) => v.version)).toEqual([3, 2, 1]);
    const strip = ({ skills: _skills, ...rest }: Record<string, unknown>) => rest;
    expect(strip(after[0]!.config)).toEqual(strip(v1.config));
    expect(after[1]).toEqual(before[0]); // v2 unchanged
    expect(after[2]).toEqual(before[1]); // v1 unchanged

    expect((await app.inject({ method: 'GET', url: `/agents/${id}/skills` })).json()).toEqual(linksBefore);

    // Promoting again right after is identical to the live config => 409 (E-4 aside, no no-op versions).
    expect((await promote(app, id, 1)).statusCode).toBe(409);
    await app.close();
  });

  it('404 version_missing leaves the agent untouched; 409 identical when the version equals the live config', async () => {
    // Regression: P2-AC-15 failure modes must not mutate or bump the agent.
    const app = await makeApp();
    const { id } = await setup(app);
    const agentBefore = (await app.inject({ method: 'GET', url: `/agents/${id}` })).json();
    const versionsBefore = await versions(app, id);

    const missing = await promote(app, id, 99);
    expect([missing.statusCode, missing.json().error.code]).toEqual([404, 'version_missing']);

    const identical = await promote(app, id, 2);
    expect([identical.statusCode, identical.json().error.code]).toEqual([409, 'identical']);

    expect((await app.inject({ method: 'GET', url: `/agents/${id}` })).json()).toEqual(agentBefore);
    expect(await versions(app, id)).toEqual(versionsBefore);
    await app.close();
  });

  it('404 for an unknown or foreign-workspace agent; 422 for a bad body (version 0, extra key)', async () => {
    // Regression: tenancy (no promoting another workspace's agent) and the strict body schema.
    const app = await makeApp();
    const [otherWs] = await pg.handle.db.insert(t.workspaces).values({ name: `promo-other-${Math.random()}` }).returning();
    const foreign = await new AgentsRepository(pg.handle.db).insert({
      workspaceId: otherWs!.id,
      name: 'Foreign',
      provider: 'openai',
      model: 'gpt-4o-mini',
      systemPrompt: 'x',
    });
    expect((await promote(app, GHOST, 1)).statusCode).toBe(404);
    expect((await promote(app, foreign.id, 1)).statusCode).toBe(404);

    const { id } = await setup(app);
    expect((await promote(app, id, 0)).statusCode).toBe(422);
    const extra = await app.inject({ method: 'POST', url: `/agents/${id}/promote`, payload: { version: 1, name: 'x' } });
    expect(extra.statusCode).toBe(422);
    await app.close();
  });
});
