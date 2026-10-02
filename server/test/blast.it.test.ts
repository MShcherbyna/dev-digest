import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockPriorPrSource } from '../src/adapters/mocks.js';
import type { RepoIntel } from '../src/modules/repo-intel/index.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const seen: { files: string[][] } = { files: [] };
const fakeIntel = {
  getBlastRadius: async (_repoId: string, files: string[]) => {
    seen.files.push(files);
    return {
      changedSymbols: [{ file: 'a.ts', name: 'alpha', kind: 'function' }],
      callers: [{ file: 'b.ts', symbol: 'run', viaSymbol: 'alpha', line: 9, rank: 1 }],
      impactedEndpoints: ['GET /x'],
      factsByFile: { 'b.ts': { endpoints: ['GET /x'], crons: ['nightly'] } },
      degraded: false,
    };
  },
  getIndexState: async () => ({ status: 'partial', lastIndexedSha: 'abc123' }),
} as unknown as RepoIntel;

d('GET /pulls/:id/blast (Testcontainers pg)', () => {
  let pg: PgFixture;
  let prId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const db = pg.handle.db;
    const [ws] = await db.select().from(t.workspaces);
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId: ws!.id, owner: 'acme', name: 'bl', fullName: 'acme/bl' })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId: ws!.id, repoId: repo!.id, number: 1, title: 'T', author: 'a', branch: 'b',
        base: 'main', headSha: 'head', additions: 1, deletions: 0, filesCount: 1,
        status: 'needs_review', body: '',
      })
      .returning();
    prId = pr!.id;
    await db.insert(t.prFiles).values({ prId, path: 'a.ts', additions: 1, deletions: 0, patch: null });
  });
  afterAll(async () => {
    await pg?.stop();
  });

  const app = () =>
    buildApp({
      config: config(),
      db: pg.handle.db,
      // Inject the history source so a developer's real GITHUB_TOKEN is never used.
      overrides: { repoIntel: fakeIntel, priorPrs: new MockPriorPrSource() },
    });

  it('returns the grouped shape with degradation info', async () => {
    const res = await (await app()).inject({ method: 'GET', url: `/pulls/${prId}/blast` });
    expect(res.statusCode).toBe(200);
    expect(seen.files.at(-1)).toEqual(['a.ts']);
    expect(res.json()).toEqual({
      changed_symbols: [{ name: 'alpha', file: 'a.ts', kind: 'function' }],
      downstream: [
        {
          symbol: 'alpha',
          callers: [{ name: 'run', file: 'b.ts', line: 9 }],
          endpoints_affected: ['GET /x'],
          crons_affected: ['nightly'],
        },
      ],
      summary: '1 symbol · 1 caller · 1 endpoint · 1 cron (index incomplete: index_partial)',
      degraded: true,
      reason: 'index_partial',
      ref_sha: 'abc123',
    });
  });

  it('404s an unknown PR and 422s a non-uuid id', async () => {
    const a = await app();
    const missing = await a.inject({
      method: 'GET',
      url: '/pulls/00000000-0000-4000-8000-000000000000/blast',
    });
    expect(missing.statusCode).toBe(404);
    const bad = await a.inject({ method: 'GET', url: '/pulls/not-a-uuid/blast' });
    expect(bad.statusCode).toBe(422);
  });

  it('serves prior PRs with filters applied, 404/422 on bad ids, and available:false when the source fails', async () => {
    const a = await app();
    const res = await a.inject({ method: 'GET', url: `/pulls/${prId}/blast/history` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.available).toBe(true);
    // unmerged (#500) and the current PR (#1) are filtered out; newest first.
    expect(body.history.map((h: { pr_number: number }) => h.pr_number)).toEqual([401, 356, 288]);
    expect(body.history[0]).toMatchObject({
      author: 'deepak.r',
      files_overlap: ['a.ts'],
      notes: 'Original split-out of the public router.',
    });

    const missing = await a.inject({ method: 'GET', url: '/pulls/00000000-0000-4000-8000-000000000000/blast/history' });
    expect(missing.statusCode).toBe(404);
    const bad = await a.inject({ method: 'GET', url: '/pulls/not-a-uuid/blast/history' });
    expect(bad.statusCode).toBe(422);

    const failing = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        repoIntel: fakeIntel,
        priorPrs: { listForPaths: async () => { throw new Error('rate limited'); } },
      },
    });
    const down = await failing.inject({ method: 'GET', url: `/pulls/${prId}/blast/history` });
    expect(down.statusCode).toBe(200);
    expect(down.json()).toEqual({ history: [], available: false });
  });
});
