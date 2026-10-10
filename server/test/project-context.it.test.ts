import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import {
  MockEmbedder,
  MockGitClient,
  MockGitHubClient,
  MockLLMProvider,
} from '../src/adapters/mocks.js';
import type { Review } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[project-context] Docker not available — skipping integration tests.');
}

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

const REVIEW: Review = {
  verdict: 'comment',
  summary: 'ok',
  score: 90,
  findings: [],
};

const INTENT_FIXTURE = {
  intent: 'Test PR intent.',
  in_scope: ['a'],
  out_of_scope: ['b'],
  risk_areas: ['c'],
  model_confidence: 'medium',
};

const GHOST = '00000000-0000-0000-0000-000000000000';
const BIG = 3 * 1024 * 1024 + 1;

/** Throws like a provider error (context overflow) after the prompt was assembled (AC-32). */
class ThrowingLLM extends MockLLMProvider {
  override async completeStructured<T>(): Promise<never> {
    throw new Error('provider exploded');
  }
}

async function put(root: string, rel: string, content: string | Buffer) {
  const full = join(root, rel);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, content);
}

d('project context (Testcontainers pg, tmp-dir clone)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let base: string;
  let clone: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;

    base = await mkdtemp(join(tmpdir(), 'pc-it-'));
    clone = join(base, 'clone');
    const outside = join(base, 'outside');
    await put(outside, 'secret.md', 'TOP SECRET');
    await put(clone, 'specs/a.md', '# A\nalpha rule');
    await put(clone, 'server/docs/b.md', 'bravo rule');
    await put(clone, '.devdigest/specs/c.md', 'charlie rule');
    await put(clone, 'node_modules/x/docs/d.md', 'excluded');
    await put(clone, 'INSIGHTS.md', 'package root insights');
    await put(clone, 'adr/0001.md', 'adr one');
    await put(clone, '.env', 'SECRET=1');
    await put(clone, 'docs/blank.md', '  \n ');
    await put(clone, 'docs/bad.md', Buffer.from([0xff, 0xfe, 0x41]));
    await put(clone, 'docs/huge.md', Buffer.alloc(BIG, 'x'));
    await symlink('/etc/hosts', join(clone, 'docs/evil.md'));
    await symlink(outside, join(clone, 'docs/linked'));
  });
  afterAll(async () => {
    await pg?.stop();
    if (base) await rm(base, { recursive: true, force: true });
  });

  /** Every LLM provider and the GitHub port are overridden (server INSIGHTS 2026-09-24). */
  async function makeApp(opts: { openai?: MockLLMProvider; env?: Record<string, string> } = {}) {
    const openai = opts.openai ?? new MockLLMProvider('openai', { structured: REVIEW });
    const app = await buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test', ...opts.env } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        github: new MockGitHubClient(),
        llm: {
          openai,
          anthropic: new MockLLMProvider('anthropic', { structured: REVIEW }),
          openrouter: new MockLLMProvider('openai', { structured: INTENT_FIXTURE }),
        },
      },
    });
    return { app, openai };
  }

  let seq = 0;
  async function newRepo(clonePath: string | null, wsId = workspaceId) {
    const name = `ctx-${seq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: wsId, owner: 'acme', name, fullName: `acme/${name}`, clonePath })
      .returning();
    return repo!;
  }
  async function newPr(repoId: string) {
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: 482,
        title: 'Add rate limiting',
        author: 'a',
        branch: 'feat',
        base: 'main',
        headSha: 'a1b2c3d4',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
        body: 'Body.',
      })
      .returning();
    await pg.handle.db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
    });
    return pr!;
  }

  type App = Awaited<ReturnType<typeof makeApp>>['app'];
  async function newAgent(app: App, name: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name, provider: 'openai', model: 'gpt-4.1', system_prompt: 'review' },
    });
    return res.json() as { id: string; version: number };
  }
  async function newSkill(app: App, name: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name, type: 'rubric', body: 'Check things.' },
    });
    return res.json() as { id: string; version: number };
  }
  const putCtx = (app: App, kind: 'agents' | 'skills', id: string, repoId: string, paths: string[]) =>
    app.inject({ method: 'PUT', url: `/${kind}/${id}/context?repo_id=${repoId}`, payload: { paths } });
  const getCtx = (app: App, kind: 'agents' | 'skills', id: string, repoId: string) =>
    app.inject({ method: 'GET', url: `/${kind}/${id}/context?repo_id=${repoId}` });
  const storedPaths = async (kind: 'agents' | 'skills', id: string, repoId: string) => {
    const db = pg.handle.db;
    const rows =
      kind === 'agents'
        ? await db
            .select()
            .from(t.agentRepoContext)
            .where(and(eq(t.agentRepoContext.agentId, id), eq(t.agentRepoContext.repoId, repoId)))
        : await db
            .select()
            .from(t.skillRepoContext)
            .where(and(eq(t.skillRepoContext.skillId, id), eq(t.skillRepoContext.repoId, repoId)));
    return rows.map((r) => r.paths);
  };

  /** Run one review and return its stored trace. */
  async function runReview(app: App, prId: string, agentId: string, expectedRunStatus = 'done') {
    const res = await app.inject({ method: 'POST', url: `/pulls/${prId}/review`, payload: { agentId } });
    expect(res.statusCode).toBe(200);
    const runId = res.json().runs[0].run_id as string;
    const runs = await waitForPrRuns(pg.handle.db, prId, { expected: 1 });
    expect(runs[0]!.status).toBe(expectedRunStatus);
    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
    return trace;
  }
  const reviewPrompts = (llm: MockLLMProvider): string[] =>
    llm.calls
      .filter((c) => c.method === 'completeStructured')
      .map((c) => (c.req as { messages: { content: string }[] }).messages[1]!.content)
      .filter((u) => u.includes('## Diff to review'));

  // ------------------------------------------------------------------ discovery
  it('AC-1/4/5/9: lists exactly a, b, c (+ blank/bad/huge docs), no symlinks, excluded dirs or INSIGHTS.md; used_by counts direct + enabled-skill agents once', async () => {
    // Catches: excluded dirs / symlinks / package-root INSIGHTS.md leaking into discovery,
    // used_by counting a disabled skill link or double-counting an agent.
    const { app } = await makeApp();
    const repo = await newRepo(clone);
    const direct = await newAgent(app, 'Direct');
    const viaSkill = await newAgent(app, 'ViaSkill');
    const viaDisabledLink = await newAgent(app, 'ViaDisabledLink');
    const both = await newAgent(app, 'Both'); // direct AND via skill: counts once
    const enabledSkill = await newSkill(app, 'Enabled skill');
    const disabledLinkSkill = await newSkill(app, 'Disabled-link skill');
    const otherRepo = await newRepo(clone);
    const onlyB = await newAgent(app, 'OnlyOtherRepo');
    await putCtx(app, 'agents', direct.id, repo.id, ['specs/a.md']);
    await putCtx(app, 'agents', both.id, repo.id, ['specs/a.md']);
    await putCtx(app, 'skills', enabledSkill.id, repo.id, ['specs/a.md']);
    await putCtx(app, 'skills', disabledLinkSkill.id, repo.id, ['specs/a.md']);
    // AC-9: an agent attaching the same path only in ANOTHER repo must not count here
    await putCtx(app, 'agents', onlyB.id, otherRepo.id, ['specs/a.md']);
    await app.inject({
      method: 'POST',
      url: `/agents/${viaSkill.id}/skills`,
      payload: { links: [{ skill_id: enabledSkill.id }] },
    });
    await app.inject({
      method: 'POST',
      url: `/agents/${both.id}/skills`,
      payload: { links: [{ skill_id: enabledSkill.id }] },
    });
    await app.inject({
      method: 'POST',
      url: `/agents/${viaDisabledLink.id}/skills`,
      payload: { links: [{ skill_id: disabledLinkSkill.id, enabled: false }] },
    });

    const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/context` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.cloned).toBe(true);
    expect(body.glob).toBe('**/{specs,docs,insights}/**/*.md');
    expect(body.files.map((f: { path: string }) => f.path)).toEqual([
      '.devdigest/specs/c.md',
      'docs/bad.md',
      'docs/blank.md',
      'docs/huge.md',
      'server/docs/b.md',
      'specs/a.md',
    ]);
    const byPath = Object.fromEntries(body.files.map((f: { path: string }) => [f.path, f]));
    expect(byPath['specs/a.md']).toMatchObject({
      type: 'specs',
      size: '# A\nalpha rule'.length,
      tokens: Math.ceil('# A\nalpha rule'.length / 4),
      too_large: false,
      used_by: 3, // direct + both + viaSkill (the disabled link does not count)
    });
    expect(byPath['docs/huge.md']).toMatchObject({
      too_large: true,
      size: BIG,
      tokens: Math.ceil(BIG / 4),
    });
    expect(byPath['server/docs/b.md'].used_by).toBe(0);
    // the other repo sees only its own single attachment
    const otherBody = (await app.inject({ method: 'GET', url: `/repos/${otherRepo.id}/context` })).json();
    expect(
      otherBody.files.find((f: { path: string }) => f.path === 'specs/a.md').used_by,
    ).toBe(1);

    // unknown repo and a repo of another workspace -> 404
    expect((await app.inject({ method: 'GET', url: `/repos/${GHOST}/context` })).statusCode).toBe(404);
    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: 'other' }).returning();
    const foreign = await newRepo(clone, other!.id);
    expect((await app.inject({ method: 'GET', url: `/repos/${foreign.id}/context` })).statusCode).toBe(404);

    // not cloned -> cloned:false, no files
    const bare = await newRepo(null);
    expect((await app.inject({ method: 'GET', url: `/repos/${bare.id}/context` })).json()).toMatchObject({
      cloned: false,
      files: [],
      total: 0,
    });
    await app.close();
  });

  it('AC-2: PROJECT_CONTEXT_GLOB selects only ADR files; an invalid glob falls back to the default', async () => {
    // Catches: the env glob being ignored, or a bad value breaking discovery.
    const repo = await newRepo(clone);
    const adr = await makeApp({ env: { PROJECT_CONTEXT_GLOB: '**/adr/**/*.md' } });
    const r = (await adr.app.inject({ method: 'GET', url: `/repos/${repo.id}/context` })).json();
    expect(r.glob).toBe('**/adr/**/*.md');
    expect(r.files.map((f: { path: string }) => f.path)).toEqual(['adr/0001.md']);
    await adr.app.close();

    const bad = await makeApp({ env: { PROJECT_CONTEXT_GLOB: 'docs/[ab].md' } });
    const r2 = (await bad.app.inject({ method: 'GET', url: `/repos/${repo.id}/context` })).json();
    expect(r2.glob).toBe('**/{specs,docs,insights}/**/*.md');
    expect(r2.files.length).toBeGreaterThan(1);
    await bad.app.close();
  });

  it('AC-36: 2,001 matching files return 2,000 sorted entries, truncated:true, total 2001', async () => {
    // Catches: unbounded discovery responses / missing truncation flag.
    const big = join(base, 'many');
    await mkdir(join(big, 'docs'), { recursive: true });
    const names = Array.from({ length: 2001 }, (_, i) => `f${String(i).padStart(4, '0')}.md`);
    for (let i = 0; i < names.length; i += 200) {
      await Promise.all(names.slice(i, i + 200).map((n) => writeFile(join(big, 'docs', n), 'x')));
    }
    const { app } = await makeApp();
    const repo = await newRepo(big);
    const body = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/context` })).json();
    expect(body.files).toHaveLength(2000);
    expect(body.truncated).toBe(true);
    expect(body.total).toBe(2001);
    const paths = body.files.map((f: { path: string }) => f.path);
    expect(paths).toEqual([...paths].sort());
    expect(paths[0]).toBe('docs/f0000.md');
    await app.close();
  });

  it('NFR: the file endpoint serves a discoverable doc and refuses .env, traversal, symlinks, excluded dirs and big files', async () => {
    // Catches: the endpoint becoming an arbitrary clone-file reader (the security boundary).
    const { app } = await makeApp();
    const repo = await newRepo(clone);
    const get = (p: string) =>
      app.inject({ method: 'GET', url: `/repos/${repo.id}/context/file`, query: { path: p } });

    const ok = await get('specs/a.md');
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ path: 'specs/a.md', content: '# A\nalpha rule' });

    expect((await get('.env')).statusCode).toBe(400);
    expect((await get('docs/../.env')).statusCode).toBe(400);
    expect((await get('../outside/secret.md')).statusCode).toBe(400);
    expect((await get('INSIGHTS.md')).statusCode).toBe(404); // valid but not discoverable
    expect((await get('node_modules/x/docs/d.md')).statusCode).toBe(404);
    // Symlinks that escape the clone: refused. The service maps the adapter's
    // `invalid_path` to 400 (spec allows both 400 "invalid path" and 404 "not discoverable").
    for (const p of ['docs/evil.md', 'docs/linked/secret.md']) {
      const res = await get(p);
      expect([400, 404], p).toContain(res.statusCode);
      expect(res.body).not.toContain('TOP SECRET');
    }
    expect((await get('docs/gone.md')).statusCode).toBe(404);
    expect((await get('docs/bad.md')).statusCode).toBe(404); // non-UTF-8
    expect((await get('docs/huge.md')).statusCode).toBe(413);
    await app.close();
  });

  // ------------------------------------------------------------------ attachments
  it('AC-23/30: PUT context leaves agent/skill versions untouched; invalid/duplicate paths -> 400, wrong shape -> 422, foreign or unknown id -> 404; order is persisted', async () => {
    // Catches: attachments bumping versions/history, traversal paths persisted, wrong status codes.
    const { app } = await makeApp();
    const agent = await newAgent(app, 'Versioned');
    const skill = await newSkill(app, 'Versioned skill');
    const repo = await newRepo(clone);

    const ok = await putCtx(app, 'agents', agent.id, repo.id, ['specs/b.md', 'specs/a.md']);
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ paths: ['specs/b.md', 'specs/a.md'] });
    expect((await getCtx(app, 'agents', agent.id, repo.id)).json()).toEqual({
      paths: ['specs/b.md', 'specs/a.md'],
    });
    expect((await putCtx(app, 'skills', skill.id, repo.id, ['docs/z.md'])).statusCode).toBe(200);

    const after = (await app.inject({ method: 'GET', url: `/agents/${agent.id}` })).json();
    expect(after.version).toBe(agent.version);
    const agentVersions = await pg.handle.db
      .select()
      .from(t.agentVersions)
      .where(eq(t.agentVersions.agentId, agent.id));
    expect(agentVersions).toHaveLength(1);
    const skillAfter = (await app.inject({ method: 'GET', url: `/skills/${skill.id}` })).json();
    expect(skillAfter.version).toBe(skill.version);
    const skillVersions = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` })).json();
    expect(skillVersions).toHaveLength(1);

    for (const kind of ['agents', 'skills'] as const) {
      const id = kind === 'agents' ? agent.id : skill.id;
      expect((await putCtx(app, kind, id, repo.id, ['../../etc/passwd.md'])).statusCode).toBe(400);
      expect((await putCtx(app, kind, id, repo.id, ['specs/a.md', 'specs/a.md'])).statusCode).toBe(400);
      expect((await putCtx(app, kind, id, repo.id, ['/abs.md'])).statusCode).toBe(400);
      expect((await putCtx(app, kind, GHOST, repo.id, [])).statusCode).toBe(404);
      expect((await getCtx(app, kind, GHOST, repo.id)).statusCode).toBe(404);
      const badShape = await app.inject({
        method: 'PUT',
        url: `/${kind}/${id}/context?repo_id=${repo.id}`,
        payload: { paths: 'x' },
      });
      expect(badShape.statusCode).toBe(422);
    }
    // the rejected writes did not touch the stored list
    expect((await getCtx(app, 'agents', agent.id, repo.id)).json().paths).toEqual(['specs/b.md', 'specs/a.md']);
    expect(await storedPaths('skills', skill.id, repo.id)).toEqual([['docs/z.md']]);

    // an agent/skill of ANOTHER workspace is a 404 for this caller
    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: 'other-ctx' }).returning();
    const [fa] = await pg.handle.db
      .insert(t.agents)
      .values({ workspaceId: other!.id, name: 'Foreign', provider: 'openai', model: 'm', systemPrompt: 's' })
      .returning();
    const [fs] = await pg.handle.db
      .insert(t.skills)
      .values({ workspaceId: other!.id, name: 'F', description: 'd', type: 'rubric', source: 'manual', body: 'b' })
      .returning();
    expect((await putCtx(app, 'agents', fa!.id, repo.id, ['specs/a.md'])).statusCode).toBe(404);
    expect((await putCtx(app, 'skills', fs!.id, repo.id, ['specs/a.md'])).statusCode).toBe(404);
    expect((await getCtx(app, 'agents', fa!.id, repo.id)).statusCode).toBe(404);
    expect(await storedPaths('agents', fa!.id, repo.id)).toEqual([]);
    await app.close();
  });

  it('AC-30: repo_id is required and must be a uuid (422); unknown or foreign repo is 404 and writes nothing', async () => {
    // Catches: a missing repo_id silently falling back to a global list; a foreign repo accepting writes.
    const { app } = await makeApp();
    const agent = await newAgent(app, 'NeedsRepo');
    const skill = await newSkill(app, 'NeedsRepoSkill');
    const repo = await newRepo(clone);
    await putCtx(app, 'agents', agent.id, repo.id, ['specs/a.md']);
    await putCtx(app, 'skills', skill.id, repo.id, ['specs/a.md']);

    for (const kind of ['agents', 'skills'] as const) {
      const id = kind === 'agents' ? agent.id : skill.id;
      for (const qs of ['', '?repo_id=abc', '?repo_id=']) {
        const g = await app.inject({ method: 'GET', url: `/${kind}/${id}/context${qs}` });
        expect(g.statusCode, `GET ${kind}${qs}`).toBe(422);
        const p = await app.inject({
          method: 'PUT',
          url: `/${kind}/${id}/context${qs}`,
          payload: { paths: ['docs/x.md'] },
        });
        expect(p.statusCode, `PUT ${kind}${qs}`).toBe(422);
      }
      // unknown repo
      expect((await getCtx(app, kind, id, GHOST)).statusCode).toBe(404);
      expect((await putCtx(app, kind, id, GHOST, ['docs/x.md'])).statusCode).toBe(404);
      // another workspace's repo
      const [other] = await pg.handle.db.insert(t.workspaces).values({ name: `other-${kind}` }).returning();
      const foreign = await newRepo(clone, other!.id);
      expect((await getCtx(app, kind, id, foreign.id)).statusCode).toBe(404);
      expect((await putCtx(app, kind, id, foreign.id, ['docs/x.md'])).statusCode).toBe(404);
      expect(await storedPaths(kind, id, foreign.id)).toEqual([]);
      expect(await storedPaths(kind, id, GHOST)).toEqual([]);
      // the original list survived every rejected call
      expect(await storedPaths(kind, id, repo.id)).toEqual([['specs/a.md']]);
    }
    await app.close();
  });

  it('AC-38/23: one agent and one skill keep independent lists per repo; unset repo reads []; no version bump', async () => {
    // Catches: per-repo lists overwriting each other, or an attachment write bumping the version.
    const { app } = await makeApp();
    const repoA = await newRepo(clone);
    const repoB = await newRepo(clone);
    const repoC = await newRepo(clone);
    const agent = await newAgent(app, 'MultiRepo');
    const skill = await newSkill(app, 'MultiRepoSkill');
    for (const kind of ['agents', 'skills'] as const) {
      const id = kind === 'agents' ? agent.id : skill.id;
      expect((await putCtx(app, kind, id, repoA.id, ['specs/a.md'])).statusCode).toBe(200);
      expect((await putCtx(app, kind, id, repoB.id, ['docs/b.md'])).statusCode).toBe(200);
      expect((await getCtx(app, kind, id, repoA.id)).json()).toEqual({ paths: ['specs/a.md'] });
      expect((await getCtx(app, kind, id, repoB.id)).json()).toEqual({ paths: ['docs/b.md'] });
      expect((await getCtx(app, kind, id, repoC.id)).json()).toEqual({ paths: [] });
    }
    expect((await app.inject({ method: 'GET', url: `/agents/${agent.id}` })).json().version).toBe(agent.version);
    expect((await app.inject({ method: 'GET', url: `/skills/${skill.id}` })).json().version).toBe(skill.version);
    expect(
      await pg.handle.db.select().from(t.agentVersions).where(eq(t.agentVersions.agentId, agent.id)),
    ).toHaveLength(1);
    await app.close();
  });

  it('AC-39: deleting a repo, agent or skill removes its rows and keeps the others', async () => {
    // Catches: orphaned list rows after a delete (missing/changed ON DELETE CASCADE).
    const { app } = await makeApp();
    const repoA = await newRepo(clone);
    const repoB = await newRepo(clone);
    const agent = await newAgent(app, 'Cascade');
    const skill = await newSkill(app, 'CascadeSkill');
    const keeper = await newAgent(app, 'Keeper');
    for (const repo of [repoA, repoB]) {
      await putCtx(app, 'agents', agent.id, repo.id, ['specs/a.md']);
      await putCtx(app, 'skills', skill.id, repo.id, ['specs/a.md']);
    }
    await putCtx(app, 'agents', keeper.id, repoA.id, ['specs/a.md']);

    expect((await app.inject({ method: 'DELETE', url: `/repos/${repoA.id}` })).statusCode).toBe(200);
    expect(await storedPaths('agents', agent.id, repoA.id)).toEqual([]);
    expect(await storedPaths('skills', skill.id, repoA.id)).toEqual([]);
    expect(await storedPaths('agents', keeper.id, repoA.id)).toEqual([]);
    expect(await storedPaths('agents', agent.id, repoB.id)).toEqual([['specs/a.md']]);
    expect(await storedPaths('skills', skill.id, repoB.id)).toEqual([['specs/a.md']]);

    expect((await app.inject({ method: 'DELETE', url: `/agents/${agent.id}` })).statusCode).toBe(200);
    expect(await storedPaths('agents', agent.id, repoB.id)).toEqual([]);
    expect(await storedPaths('skills', skill.id, repoB.id)).toEqual([['specs/a.md']]);
    expect((await app.inject({ method: 'DELETE', url: `/skills/${skill.id}` })).statusCode).toBe(200);
    expect(await storedPaths('skills', skill.id, repoB.id)).toEqual([]);
    await app.close();
  });

  it('storage: the old agents.context_paths / skills.context_paths columns are gone', async () => {
    // Catches: the migration leaving the legacy global list columns next to the per-repo tables.
    const res = await pg.handle.db.execute(
      sql`select table_name, column_name from information_schema.columns
          where column_name = 'context_paths' and table_name in ('agents', 'skills')`,
    );
    const rows = (Array.isArray(res) ? res : (res as { rows: unknown[] }).rows) as unknown[];
    expect(rows).toEqual([]);
  });

  // ------------------------------------------------------------------ run path
  it('AC-24/25/26/31: agent [a,b] + skill [b,c] is assembled a,b,c in one block, a disabled skill is absent, no extra LLM call, trace records origins and tokens', async () => {
    // Catches: wrong merge order, disabled-skill docs injected, an extra LLM call, trace not filled.
    const llmWith = new MockLLMProvider('openai', { structured: REVIEW });
    const withDocs = await makeApp({ openai: llmWith });
    const repo = await newRepo(clone);
    const pr = await newPr(repo.id);
    const agent = await newAgent(withDocs.app, 'WithDocs');
    const live = await newSkill(withDocs.app, 'Live skill');
    const dead = await newSkill(withDocs.app, 'Dead skill');
    await putCtx(withDocs.app, 'agents', agent.id, repo.id, ['specs/a.md', 'server/docs/b.md']);
    await putCtx(withDocs.app, 'skills', live.id, repo.id, ['server/docs/b.md', '.devdigest/specs/c.md']);
    await putCtx(withDocs.app, 'skills', dead.id, repo.id, ['adr/0001.md']);
    // AC-24: lists stored for ANOTHER repo (agent [x], skill [y]) must not reach this PR's run
    const otherRepo = await newRepo(clone);
    await putCtx(withDocs.app, 'agents', agent.id, otherRepo.id, ['docs/blank.md', 'adr/0001.md']);
    await putCtx(withDocs.app, 'skills', live.id, otherRepo.id, ['INSIGHTS.md']);
    await withDocs.app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { links: [{ skill_id: live.id }, { skill_id: dead.id, enabled: false }] },
    });

    const trace = await runReview(withDocs.app, pr.id, agent.id);
    const prompts = reviewPrompts(llmWith);
    expect(prompts).toHaveLength(1);
    const user = prompts[0]!;
    const ia = user.indexOf('### specs/a.md');
    const ib = user.indexOf('### server/docs/b.md');
    const ic = user.indexOf('### .devdigest/specs/c.md');
    expect(ia).toBeGreaterThan(user.indexOf('## Project context'));
    expect(ia).toBeLessThan(ib);
    expect(ib).toBeLessThan(ic);
    expect(user.match(/### server\/docs\/b\.md/g)).toHaveLength(1);
    expect(user).not.toContain('adr one');
    expect(user).not.toContain('docs/blank.md');
    expect(user).not.toContain('INSIGHTS.md');
    expect(JSON.stringify(trace.project_context_docs)).not.toContain('adr/0001.md');
    expect(trace.specs_read).not.toContain('INSIGHTS.md');
    expect(user).toContain('<untrusted source="specs/a.md">\n# A\nalpha rule\n</untrusted>');
    expect(user).toContain('cite its path in the rationale');

    expect(trace.specs_read).toEqual(['specs/a.md', 'server/docs/b.md', '.devdigest/specs/c.md']);
    expect(trace.project_context_docs).toEqual([
      { path: 'specs/a.md', origin: 'agent', status: 'included', tokens: Math.ceil('# A\nalpha rule'.length / 4) },
      { path: 'server/docs/b.md', origin: 'agent', status: 'included', tokens: Math.ceil('bravo rule'.length / 4) },
      {
        path: '.devdigest/specs/c.md',
        origin: 'skill',
        skill: 'Live skill',
        status: 'included',
        tokens: Math.ceil('charlie rule'.length / 4),
      },
    ]);
    expect(trace.prompt_assembly.specs).toMatch(/^## Project context\n\n<!-- Untrusted\./);
    expect(user).toContain(trace.prompt_assembly.specs);
    expect(trace.log.some((l: { msg: string }) => l.msg === 'project context: 3 included, 0 skipped')).toBe(true);

    // Same number of LLM calls for an agent WITHOUT docs on an equal PR (AC-25).
    const llmWithout = new MockLLMProvider('openai', { structured: REVIEW });
    const without = await makeApp({ openai: llmWithout });
    const pr2 = await newPr((await newRepo(clone)).id);
    const plain = await newAgent(without.app, 'Plain');
    await runReview(without.app, pr2.id, plain.id);
    expect(llmWithout.calls.length).toBe(llmWith.calls.length);
    await withDocs.app.close();
    await without.app.close();
  });

  it('AC-28/29/31: five skip reasons in one successful run; every doc skipped -> no section, specs null', async () => {
    // Catches: one bad attachment failing the run, a misclassified reason, an empty heading being sent.
    const llm = new MockLLMProvider('openai', { structured: REVIEW });
    const { app } = await makeApp({ openai: llm });
    const repo = await newRepo(clone);
    const pr = await newPr(repo.id);
    const agent = await newAgent(app, 'Skippy');
    // invalid_path cannot come through the API (400), so it is stored directly, as a legacy/hand-edited row.
    await pg.handle.db.insert(t.agentRepoContext).values({
      agentId: agent.id,
      repoId: repo.id,
      paths: [
        'docs/gone.md', // missing
        'docs/huge.md', // too_large
        '../outside/secret.md', // invalid_path
        'docs/bad.md', // unreadable (not UTF-8)
        'docs/blank.md', // empty
        'docs/evil.md', // symlink out of the clone: never read
      ],
    });

    const trace = await runReview(app, pr.id, agent.id);
    expect(trace.project_context_docs.map((e: { path: string; status: string; reason: string }) => [e.path, e.status, e.reason])).toEqual([
      ['docs/gone.md', 'skipped', 'missing'],
      ['docs/huge.md', 'skipped', 'too_large'],
      ['../outside/secret.md', 'skipped', 'invalid_path'],
      ['docs/bad.md', 'skipped', 'unreadable'],
      ['docs/blank.md', 'skipped', 'empty'],
      ['docs/evil.md', 'skipped', 'invalid_path'],
    ]);
    expect(trace.specs_read).toEqual([]);
    expect(trace.prompt_assembly.specs).toBeNull();
    expect(reviewPrompts(llm)[0]).not.toContain('## Project context');
    const msgs = trace.log.map((l: { msg: string }) => l.msg);
    expect(msgs).toContain('project context: 0 included, 6 skipped');
    expect(msgs).toContain('project context: skipped docs/huge.md (too_large)');
    expect(JSON.stringify(trace)).not.toContain('TOP SECRET');

    // no attachments at all: section omitted, field omitted, specs_read []
    const pr2 = await newPr((await newRepo(clone)).id);
    const bare = await newAgent(app, 'Bare');
    const bareTrace = await runReview(app, pr2.id, bare.id);
    expect(bareTrace.project_context_docs).toBeUndefined();
    expect(bareTrace.specs_read).toEqual([]);
    expect(bareTrace.prompt_assembly.specs).toBeNull();
    expect(reviewPrompts(llm)[1]).not.toContain('## Project context');

    // a repo with no clone: every path is skipped as missing, run still succeeds
    // AC-24: an agent whose only list is for repo B gets no section on a repo A PR
    const repoB = await newRepo(clone);
    const onlyB = await newAgent(app, 'OnlyB');
    await putCtx(app, 'agents', onlyB.id, repoB.id, ['specs/a.md']);
    const prA = await newPr((await newRepo(clone)).id);
    const onlyBTrace = await runReview(app, prA.id, onlyB.id);
    expect(onlyBTrace.project_context_docs).toBeUndefined();
    expect(onlyBTrace.specs_read).toEqual([]);
    expect(onlyBTrace.prompt_assembly.specs).toBeNull();
    expect(reviewPrompts(llm)[2]).not.toContain('## Project context');

    const noCloneRepo = await newRepo(null);
    const pr3 = await newPr(noCloneRepo.id);
    const noClone = await newAgent(app, 'NoClone');
    await putCtx(app, 'agents', noClone.id, noCloneRepo.id, ['specs/a.md']);
    const t3 = await runReview(app, pr3.id, noClone.id);
    expect(t3.project_context_docs).toEqual([
      { path: 'specs/a.md', origin: 'agent', status: 'skipped', reason: 'missing' },
    ]);
    await app.close();
  });

  it('AC-32: a provider failure after assembly keeps specs_read, project_context_docs and the block text in the trace', async () => {
    // Catches: failed/cancelled runs losing the audit trail of what was injected.
    const llm = new ThrowingLLM('openai', { structured: REVIEW });
    const { app } = await makeApp({ openai: llm });
    const repo = await newRepo(clone);
    const pr = await newPr(repo.id);
    const agent = await newAgent(app, 'Doomed');
    await putCtx(app, 'agents', agent.id, repo.id, ['specs/a.md', 'docs/gone.md']);

    const trace = await runReview(app, pr.id, agent.id, 'failed');
    expect(trace.specs_read).toEqual(['specs/a.md']);
    expect(trace.project_context_docs).toEqual([
      { path: 'specs/a.md', origin: 'agent', status: 'included', tokens: Math.ceil('# A\nalpha rule'.length / 4) },
      { path: 'docs/gone.md', origin: 'agent', status: 'skipped', reason: 'missing' },
    ]);
    expect(trace.prompt_assembly.specs).toContain('## Project context');
    expect(trace.prompt_assembly.specs).toContain('<untrusted source="specs/a.md">');
    await app.close();
  });
});
