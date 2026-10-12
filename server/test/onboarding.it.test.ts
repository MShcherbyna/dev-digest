import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import {
  MockEmbedder,
  MockGitClient,
  MockGitHubClient,
  MockLLMProvider,
  MockSecretsProvider,
} from '../src/adapters/mocks.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';
import type { TourModelOutput } from '../src/modules/onboarding/schemas.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[onboarding] Docker not available — skipping integration tests.');
}

const OUTPUT: TourModelOutput = {
  architecture: {
    summary: 'The API in `src/real.ts` talks to Postgres.',
    nodes: [
      { id: 'api', label: 'API', kind: 'service' },
      { id: 'db', label: 'Postgres', kind: 'storage' },
    ],
    edges: [{ from: 'api', to: 'db' }],
  },
  critical_paths: [
    { path: 'src/real.ts', description: 'core' },
    { path: 'src/ghost.ts', description: 'hallucinated' },
  ],
  run_locally: [{ command: 'pnpm dev' }],
  reading_path: [{ path: 'README.md', reason: 'start here' }],
  first_tasks: [{ title: 'Tweak', path: 'src/real.ts', complexity: 'low' }],
};

const INTENT_FIXTURE = {
  intent: 'x',
  in_scope: [],
  out_of_scope: [],
  risk_areas: [],
  model_confidence: 'medium',
};

/** Structured-output LLM that can be held, failed or made to hang per test. */
class ControlledLLM extends MockLLMProvider {
  private waiters: (() => void)[] = [];
  public hold = false;
  public never = false;
  public failWith: Error | null = null;
  public data: unknown = OUTPUT;
  override async completeStructured<T>(req: Parameters<MockLLMProvider['completeStructured']>[0]) {
    this.calls.push({ method: 'completeStructured', req });
    if (this.never) await new Promise(() => undefined);
    if (this.hold) await new Promise<void>((r) => this.waiters.push(r));
    if (this.failWith) throw this.failWith;
    return { data: this.data as T, model: req.model, tokensIn: 10, tokensOut: 5, costUsd: 0, raw: '', attempts: 1 };
  }
  release() {
    this.hold = false;
    this.waiters.splice(0).forEach((r) => r());
  }
  reset() {
    this.hold = false;
    this.never = false;
    this.failWith = null;
    this.data = OUTPUT;
    this.calls = [];
  }
  get structuredCalls() {
    return this.calls.filter((c) => c.method === 'completeStructured').length;
  }
}

/** Only the three methods the onboarding module calls; the rest of the facade is unused here. */
function fakeRepoIntel(state: { status: 'full' | 'partial'; sha: string }): RepoIntel {
  return {
    getIndexState: async () => ({
      status: state.status,
      filesIndexed: 11,
      lastIndexedSha: state.sha,
      updatedAt: new Date('2026-01-01'),
    }),
    getTopFilesByRank: async () => ['src/real.ts'],
    getCriticalPaths: async () => [],
  } as unknown as RepoIntel;
}

async function put(root: string, rel: string, content: string) {
  const full = join(root, rel);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, content);
}

d('onboarding tour (Testcontainers pg, tmp-dir clone)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let base: string;
  let clone: string;
  const llm = new ControlledLLM('openai');
  const intel = { status: 'full' as 'full' | 'partial', sha: 'sha-1' };

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    base = await mkdtemp(join(tmpdir(), 'ob-it-'));
    clone = join(base, 'clone');
    await put(clone, 'package.json', JSON.stringify({ scripts: { dev: 'x' } }));
    await put(clone, 'README.md', '# Demo');
    await put(clone, 'src/real.ts', 'export {}');
    await put(clone, '.env', 'SECRET=1');
  });
  afterAll(async () => {
    await pg?.stop();
    if (base) await rm(base, { recursive: true, force: true });
  });

  /** Every LLM provider, the secrets store, GitHub and git are overridden (server INSIGHTS 2026-09-24). */
  async function makeApp(opts: { noKey?: boolean } = {}) {
    return buildApp({
      config: { ...loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv), onboardingTimeoutMs: 300 },
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ head: 'sha-head' }),
        github: new MockGitHubClient(),
        repoIntel: fakeRepoIntel(intel),
        secrets: new MockSecretsProvider({}),
        llm: opts.noKey
          ? {}
          : {
              openai: new MockLLMProvider('openai', { structured: INTENT_FIXTURE }),
              anthropic: new MockLLMProvider('anthropic', { structured: INTENT_FIXTURE }),
              openrouter: llm,
            },
      },
    });
  }
  type App = Awaited<ReturnType<typeof makeApp>>;

  let seq = 0;
  async function newRepo(clonePath: string | null, wsId = workspaceId) {
    const name = `ob-${seq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: wsId, owner: 'acme', name, fullName: `acme/${name}`, clonePath })
      .returning();
    return repo!;
  }
  const post = (app: App, id: string) => app.inject({ method: 'POST', url: `/repos/${id}/onboarding` });
  const get = (app: App, id: string) => app.inject({ method: 'GET', url: `/repos/${id}/onboarding` });
  const rowText = async (repoId: string) => {
    const r = await pg.handle.db.execute(
      sql`select json::text as j from onboarding where repo_id = ${repoId}`,
    );
    return (r as unknown as { j: string }[])[0]?.j ?? null;
  };
  const rowCount = async (repoId: string) => {
    const rows = await pg.handle.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, repoId));
    return rows.length;
  };

  it('AC-1/2/6: POST then GET return the same grounded tour; regenerating replaces the single row; delete cascades', async () => {
    // Catches: a tour that is not persisted/readable, duplicate rows per repo, grounding skipped, no cascade.
    llm.reset();
    intel.status = 'full';
    const app = await makeApp();
    try {
      const repo = await newRepo(clone);
      const empty = await get(app, repo.id);
      expect(empty.statusCode).toBe(200);
      expect(empty.json()).toMatchObject({ cloned: true, generating: false, tour: null, stale: false });

      const res = await post(app, repo.id);
      expect(res.statusCode).toBe(200);
      const tour = res.json().tour;
      expect(tour.commit_sha).toBe('sha-1');
      expect(tour.files_indexed).toBe(11);
      expect(tour.partial_index).toBe(false); // AC-6 full
      expect(tour.critical_paths.map((p: { path: string }) => p.path)).toEqual(['src/real.ts']);
      expect(Object.keys(tour).filter((k) => ['architecture', 'critical_paths', 'run_locally', 'reading_path', 'first_tasks'].includes(k))).toEqual([
        'architecture',
        'critical_paths',
        'run_locally',
        'reading_path',
        'first_tasks',
      ]);

      const got = (await get(app, repo.id)).json();
      expect(got.tour).toEqual(tour);
      expect(got.stale).toBe(false);

      // second generation (partial index, new commit) replaces the row
      intel.status = 'partial';
      intel.sha = 'sha-2';
      const second = (await post(app, repo.id)).json().tour;
      expect(second.partial_index).toBe(true); // AC-6 partial
      expect(second.commit_sha).toBe('sha-2');
      expect(await rowCount(repo.id)).toBe(1);
      expect(JSON.parse((await rowText(repo.id))!)).toEqual(second);

      await pg.handle.db.delete(t.repos).where(eq(t.repos.id, repo.id));
      expect(await rowCount(repo.id)).toBe(0);
    } finally {
      intel.status = 'full';
      intel.sha = 'sha-1';
      await app.close();
    }
  });

  it('AC-3: two concurrent POSTs give one 200 and one 409', async () => {
    // Catches: the in-flight guard living per request instead of per container (double paid generation).
    llm.reset();
    llm.hold = true;
    const app = await makeApp();
    try {
      const repo = await newRepo(clone);
      const a = post(app, repo.id);
      await expect.poll(() => llm.structuredCalls).toBe(1);
      const b = await post(app, repo.id);
      expect(b.statusCode).toBe(409);
      expect(b.json().error.code).toBe('generation_in_progress');
      expect((await get(app, repo.id)).json().generating).toBe(true);
      llm.release();
      expect((await a).statusCode).toBe(200);
      expect(llm.structuredCalls).toBe(1);
      expect((await get(app, repo.id)).json().generating).toBe(false);
    } finally {
      llm.release();
      await app.close();
    }
  });

  it('AC-4: a repository without a clone gives 409 and zero LLM calls', async () => {
    // Catches: calling the model (and paying) when there is no clone to ground against.
    llm.reset();
    const app = await makeApp();
    try {
      for (const clonePath of [null, join(base, 'does-not-exist')]) {
        const repo = await newRepo(clonePath);
        const res = await post(app, repo.id);
        expect(res.statusCode).toBe(409);
        expect(res.json().error.code).toBe('not_cloned');
        expect((await get(app, repo.id)).json().cloned).toBe(false);
      }
      expect(llm.calls).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  it('AC-5: each failure cause leaves the previous row byte-identical', async () => {
    // Catches: a failed regeneration deleting or partially overwriting the last good tour.
    llm.reset();
    const app = await makeApp();
    const noKeyApp = await makeApp({ noKey: true });
    try {
      const repo = await newRepo(clone);
      expect((await post(app, repo.id)).statusCode).toBe(200);
      const before = await rowText(repo.id);
      expect(before).not.toBeNull();

      llm.failWith = new Error('upstream exploded');
      const provider = await post(app, repo.id);
      expect([provider.statusCode, provider.json().error.code]).toEqual([502, 'provider_error']);
      expect(await rowText(repo.id)).toBe(before);

      llm.failWith = null;
      llm.data = { ...OUTPUT, architecture: { ...OUTPUT.architecture, summary: '' } };
      const invalid = await post(app, repo.id);
      expect([invalid.statusCode, invalid.json().error.code]).toEqual([502, 'invalid_output']);
      expect(await rowText(repo.id)).toBe(before);

      const missing = await post(noKeyApp, repo.id);
      expect([missing.statusCode, missing.json().error.code]).toEqual([500, 'missing_api_key']);
      expect(await rowText(repo.id)).toBe(before);

      // the timeout (300ms) is a provider_error too, and frees the slot
      llm.data = OUTPUT;
      llm.never = true;
      const timedOut = await post(app, repo.id);
      expect([timedOut.statusCode, timedOut.json().error.code]).toEqual([502, 'provider_error']);
      expect(await rowText(repo.id)).toBe(before);
      expect((await get(app, repo.id)).json().generating).toBe(false);
    } finally {
      await app.close();
      await noKeyApp.close();
    }
  });

  it('AC-34: a request that is dropped by its caller still stores the tour', async () => {
    // Catches: the service tying generation to the request lifecycle, so a closed tab loses the result.
    // NOTE: inject() cannot abort a socket; the response is simply never awaited.
    llm.reset();
    llm.hold = true;
    const app = await makeApp();
    try {
      const repo = await newRepo(clone);
      void post(app, repo.id).catch(() => undefined);
      await expect.poll(() => llm.structuredCalls).toBe(1);
      llm.release();
      await expect
        .poll(async () => (await get(app, repo.id)).json().tour?.commit_sha, { timeout: 5000 })
        .toBe('sha-1');
    } finally {
      llm.release();
      await app.close();
    }
  });

  it('security: a repository of another workspace is 404 on GET and POST and never calls the LLM', async () => {
    // Catches: cross-tenant read or generation by guessing a repository id.
    llm.reset();
    const app = await makeApp();
    try {
      const [foreignWs] = await pg.handle.db.insert(t.workspaces).values({ name: 'foreign' }).returning();
      const foreign = await newRepo(clone, foreignWs!.id);
      expect((await get(app, foreign.id)).statusCode).toBe(404);
      expect((await post(app, foreign.id)).statusCode).toBe(404);
      expect(llm.calls).toHaveLength(0);
      expect(await rowCount(foreign.id)).toBe(0);
    } finally {
      await app.close();
    }
  });
});
