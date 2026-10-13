/**
 * Project Context index against a real Postgres (Testcontainers) and a tmp-dir
 * clone: spec 2026-10-13 AC-1..AC-11 and AC-13. (AC-12, the run path, lives in
 * project-context.it.test.ts next to the run helpers it reuses; the job-timeout
 * half of AC-9 is a unit test because JobRunner's 120 s timeout is not injectable.)
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { ControlDocs, HeadGit } from './helpers/context-index.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockEmbedder, MockGitHubClient } from '../src/adapters/mocks.js';
import { MAX_DOC_BYTES } from '../src/modules/project-context/constants.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[project-context-index] Docker not available - skipping integration tests.');
}

const GHOST = '00000000-0000-0000-0000-000000000000';
const DOC_GLOB = '**/{specs,docs,insights}/**/*.md';

d('project context index (Testcontainers pg, tmp-dir clone)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let base: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    base = await mkdtemp(join(tmpdir(), 'pc-idx-'));
  });
  afterAll(async () => {
    await pg?.stop();
    if (base) await rm(base, { recursive: true, force: true });
  });

  // ------------------------------------------------------------------ helpers
  async function put(root: string, rel: string, content: string | Buffer) {
    const full = join(root, rel);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, content);
  }

  let cloneSeq = 0;
  async function makeClone(files: Record<string, string | Buffer>): Promise<string> {
    const root = join(base, `clone-${cloneSeq++}`);
    await mkdir(root, { recursive: true });
    for (const [rel, content] of Object.entries(files)) await put(root, rel, content);
    return root;
  }

  async function makeApp(opts: { git?: HeadGit; docs?: ControlDocs; env?: Record<string, string> } = {}) {
    const git = opts.git ?? new HeadGit();
    const docs = opts.docs ?? new ControlDocs();
    const app = await buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test', ...opts.env } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git,
        github: new MockGitHubClient(),
        repoDocs: docs,
      },
    });
    return { app, git, docs };
  }
  type App = Awaited<ReturnType<typeof makeApp>>['app'];

  let seq = 0;
  async function newRepo(clonePath: string | null, wsId = workspaceId) {
    const name = `idx-${seq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: wsId, owner: 'acme', name, fullName: `acme/${name}`, clonePath })
      .returning();
    return repo!;
  }

  const post = (app: App, repoId: string) =>
    app.inject({ method: 'POST', url: `/repos/${repoId}/context/reindex` });
  const get = async (app: App, repoId: string) => {
    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/context` });
    expect(res.statusCode).toBe(200);
    return res.json();
  };
  /** POST a re-index and wait until the job queue is empty. */
  async function reindexNow(app: App, repoId: string) {
    const res = await post(app, repoId);
    expect(res.statusCode).toBe(202);
    await app.container.jobs.onIdle();
    return res.json() as { status: string; job_id: string };
  }

  const db = () => pg.handle.db;
  const stateRow = async (repoId: string) =>
    (await db().select().from(t.contextIndexState).where(eq(t.contextIndexState.repoId, repoId)))[0];
  const fileRows = (repoId: string) =>
    db().select().from(t.contextFiles).where(eq(t.contextFiles.repoId, repoId)).orderBy(t.contextFiles.path);
  const chunkRows = (repoId: string) =>
    db()
      .select({
        path: t.contextFiles.path,
        ordinal: t.contextChunks.ordinal,
        hash: t.contextChunks.contentHash,
        text: t.contextChunks.text,
        breadcrumb: t.contextChunks.breadcrumb,
      })
      .from(t.contextChunks)
      .innerJoin(t.contextFiles, eq(t.contextChunks.fileId, t.contextFiles.id))
      .where(eq(t.contextChunks.repoId, repoId))
      .orderBy(t.contextFiles.path, t.contextChunks.ordinal);
  const indexJobs = (repoId: string) =>
    db()
      .select()
      .from(t.jobs)
      .where(and(eq(t.jobs.kind, 'project_context_index'), sql`${t.jobs.payload}->>'repoId' = ${repoId}`));
  const counts = async (repoId: string) => ({
    state: (await db().select().from(t.contextIndexState).where(eq(t.contextIndexState.repoId, repoId))).length,
    files: (await fileRows(repoId)).length,
    chunks: (await chunkRows(repoId)).length,
  });

  const BASE_FILES = {
    'specs/a.md': '# A\nalpha rule',
    'server/docs/b.md': 'bravo rule',
    '.devdigest/specs/c.md': 'charlie rule',
    'node_modules/x/docs/d.md': 'excluded',
    'INSIGHTS.md': 'package root insights',
    '.env': 'SECRET=1',
  };

  // ------------------------------------------------------------------ AC-1
  it('AC-1: POST answers 202 with a job id; an immediate GET says indexing (with the previous counts); after the job it is ready with a later indexed_at', async () => {
    // Catches: "indexing" never reported while a job runs, a missing job row, or `indexed_at` not advancing.
    const clone = await makeClone(BASE_FILES);
    const { app, docs } = await makeApp();
    const repo = await newRepo(clone);

    expect((await get(app, repo.id)).index).toMatchObject({ status: 'none', indexed_at: null, files: 0, chunks: 0 });
    await reindexNow(app, repo.id);
    const first = await get(app, repo.id);
    expect(first.index.status).toBe('ready');

    const release = docs.holdWalks();
    const res = await post(app, repo.id);
    expect(res.statusCode).toBe(202);
    const accepted = res.json();
    expect(accepted).toMatchObject({ status: 'accepted' });
    expect(accepted.job_id).toMatch(/^[0-9a-f-]{36}$/);

    const mid = await get(app, repo.id);
    expect(mid.index.status).toBe('indexing');
    expect(mid.index.indexed_at).toBe(first.index.indexed_at); // last complete index carried
    expect(mid.files).toEqual(first.files);

    release();
    await app.container.jobs.onIdle();
    const after = await get(app, repo.id);
    expect(after.index.status).toBe('ready');
    expect(new Date(after.index.indexed_at).getTime()).toBeGreaterThan(new Date(first.index.indexed_at).getTime());
    const job = (await db().select().from(t.jobs).where(eq(t.jobs.id, accepted.job_id)))[0]!;
    expect(job).toMatchObject({ kind: 'project_context_index', status: 'done' });
    await app.close();
  });

  // ------------------------------------------------------------------ AC-2
  it('AC-2: foreign repo 404, uncloned 409 not_cloned, bad id 422, a queue that rejects 503; no job queued and the stored state is unchanged', async () => {
    // Catches: a rejected request leaving a phantom job or touching the stored index; wrong status codes.
    const clone = await makeClone(BASE_FILES);
    const { app } = await makeApp();
    const repo = await newRepo(clone);
    await reindexNow(app, repo.id);
    const [stateBefore, filesBefore, chunksBefore, jobsBefore] = [
      await stateRow(repo.id),
      await fileRows(repo.id),
      await chunkRows(repo.id),
      (await indexJobs(repo.id)).length,
    ];

    const [other] = await db().insert(t.workspaces).values({ name: 'other-idx' }).returning();
    const foreign = await newRepo(clone, other!.id);
    expect((await post(app, foreign.id)).statusCode).toBe(404);
    expect((await post(app, GHOST)).statusCode).toBe(404);
    expect((await post(app, 'not-a-uuid')).statusCode).toBe(422);

    const bare = await newRepo(null);
    const conflict = await post(app, bare.id);
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().error.code).toBe('not_cloned');
    expect(await indexJobs(bare.id)).toHaveLength(0);

    const spy = vi.spyOn(app.container.jobs, 'enqueue').mockRejectedValueOnce(new Error('queue down'));
    const unavailable = await post(app, repo.id);
    expect(unavailable.statusCode).toBe(503);
    expect(unavailable.json().error.code).toBe('job_unavailable');
    spy.mockRestore();

    expect(await stateRow(repo.id)).toEqual(stateBefore);
    expect(await fileRows(repo.id)).toEqual(filesBefore);
    expect(await chunkRows(repo.id)).toEqual(chunksBefore);
    expect((await indexJobs(repo.id)).length).toBe(jobsBefore);
    expect((await get(app, repo.id)).index.status).toBe('ready'); // not stuck on "indexing"
    expect((await post(app, repo.id)).statusCode).toBe(202); // and the repo can be retried
    await app.container.jobs.onIdle();
    await app.close();
  });

  // ------------------------------------------------------------------ AC-3
  it('AC-3: two POSTs while a job runs return the same job id and exactly one job row exists', async () => {
    // Catches: a double click / clone+button race queueing two builds.
    const clone = await makeClone(BASE_FILES);
    const { app, docs } = await makeApp();
    const repo = await newRepo(clone);
    const release = docs.holdWalks();

    const [a, b] = await Promise.all([post(app, repo.id), post(app, repo.id)]);
    const c = await post(app, repo.id);
    expect([a.statusCode, b.statusCode, c.statusCode]).toEqual([202, 202, 202]);
    expect(b.json().job_id).toBe(a.json().job_id);
    expect(c.json().job_id).toBe(a.json().job_id);

    release();
    await app.container.jobs.onIdle();
    expect(await indexJobs(repo.id)).toHaveLength(1);
    expect(docs.walks).toBe(1);
    await app.close();
  });

  // ------------------------------------------------------------------ AC-4
  it('AC-4: the manifest is exactly a, b, c (excluded dirs, INSIGHTS.md and .env out); state records sha, glob, counts, truncated, total', async () => {
    // Catches: excluded dirs or non-doc files in the manifest; indexed_sha/glob not recorded.
    const clone = await makeClone(BASE_FILES);
    const git = new HeadGit();
    git.head = 'cafe1234';
    const { app } = await makeApp({ git });
    const repo = await newRepo(clone);
    await reindexNow(app, repo.id);

    const body = await get(app, repo.id);
    expect(body.files.map((f: { path: string }) => f.path)).toEqual([
      '.devdigest/specs/c.md',
      'server/docs/b.md',
      'specs/a.md',
    ]);
    expect(body.files.find((f: { path: string }) => f.path === 'specs/a.md')).toMatchObject({
      type: 'specs',
      size: BASE_FILES['specs/a.md'].length,
      tokens: Math.ceil(BASE_FILES['specs/a.md'].length / 4),
      too_large: false,
      used_by: 0,
    });
    expect(body).toMatchObject({ glob: DOC_GLOB, cloned: true, truncated: false, total: 3, stale: false });
    expect(body.index).toMatchObject({ status: 'ready', indexed_sha: 'cafe1234', files: 3, chunks: 3 });

    const row = (await stateRow(repo.id))!;
    expect(row).toMatchObject({
      status: 'ready',
      indexedSha: 'cafe1234',
      glob: DOC_GLOB,
      files: 3,
      chunks: 3,
      truncated: false,
      total: 3,
      failedAt: null,
      failureReason: null,
    });
    await app.close();
  });

  // ------------------------------------------------------------------ AC-6
  it('AC-6: re-indexing an unchanged clone gives identical (path, ordinal, hash); editing one section changes only that chunk', async () => {
    // Catches: nondeterministic chunking/hashing, or an edit rewriting every chunk hash of the file.
    const guide = (beta: string) =>
      `Intro\n\n# One\nfirst section\n\n## Two\n${beta}\n\n## Three\nthird section\n`;
    const clone = await makeClone({ 'docs/guide.md': guide('second section'), 'docs/other.md': '# O\nother' });
    const { app } = await makeApp();
    const repo = await newRepo(clone);

    await reindexNow(app, repo.id);
    const key = (rows: { path: string; ordinal: number; hash: string }[]) =>
      rows.map((r) => `${r.path}#${r.ordinal}=${r.hash}`);
    const run1 = await chunkRows(repo.id);
    const fileHash1 = Object.fromEntries((await fileRows(repo.id)).map((f) => [f.path, f.contentHash]));
    await reindexNow(app, repo.id);
    const run2 = await chunkRows(repo.id);
    expect(key(run2)).toEqual(key(run1));
    expect(run1.filter((r) => r.path === 'docs/guide.md').map((r) => r.breadcrumb)).toEqual([
      [],
      ['One'],
      ['One', 'Two'],
      ['One', 'Three'],
    ]);

    await put(clone, 'docs/guide.md', guide('SECOND section edited'));
    await reindexNow(app, repo.id);
    const run3 = await chunkRows(repo.id);
    const changed = run3.filter((r, i) => r.hash !== run2[i]!.hash);
    expect(run3).toHaveLength(run2.length);
    expect(changed.map((r) => `${r.path}#${r.ordinal}`)).toEqual(['docs/guide.md#2']);
    const fileHash3 = Object.fromEntries((await fileRows(repo.id)).map((f) => [f.path, f.contentHash]));
    expect(fileHash3['docs/guide.md']).not.toBe(fileHash1['docs/guide.md']);
    expect(fileHash3['docs/other.md']).toBe(fileHash1['docs/other.md']);
    for (const r of run3) expect(r.hash).toMatch(/^[0-9a-f]{64}$/);
    await app.close();
  });

  // ------------------------------------------------------------------ AC-7
  it('AC-7: over-3-MB, non-UTF-8, whitespace-only and normal docs -> files 4, chunks only for the normal one, three flags set', async () => {
    // Catches: one unindexable file aborting the build or being dropped; flags/hash rules of the manifest.
    const clone = await makeClone({
      'docs/ok.md': '# Ok\nbody',
      'docs/huge.md': Buffer.alloc(MAX_DOC_BYTES + 1, 'x'),
      'docs/bad.md': Buffer.from([0xff, 0xfe, 0x41]),
      'docs/blank.md': '  \n \t\n',
    });
    const { app } = await makeApp();
    const repo = await newRepo(clone);
    await reindexNow(app, repo.id);

    const rows = Object.fromEntries((await fileRows(repo.id)).map((f) => [f.path, f]));
    expect(Object.keys(rows).sort()).toEqual(['docs/bad.md', 'docs/blank.md', 'docs/huge.md', 'docs/ok.md']);
    expect(rows['docs/huge.md']).toMatchObject({ tooLarge: true, unreadable: false, empty: false, contentHash: null });
    expect(rows['docs/bad.md']).toMatchObject({ tooLarge: false, unreadable: true, empty: false });
    expect(rows['docs/blank.md']).toMatchObject({ tooLarge: false, unreadable: false, empty: true });
    expect(rows['docs/ok.md']).toMatchObject({ tooLarge: false, unreadable: false, empty: false });
    expect(rows['docs/ok.md']!.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect((await chunkRows(repo.id)).map((c) => c.path)).toEqual(['docs/ok.md']);

    const body = await get(app, repo.id);
    expect(body.index).toMatchObject({ status: 'ready', files: 4, chunks: 1 });
    expect(body.files.find((f: { path: string }) => f.path === 'docs/huge.md').too_large).toBe(true);
    await app.close();
  });

  // ------------------------------------------------------------------ AC-8
  it('AC-8: listings requested during a rebuild never mix two builds (files, counts and paths all from A or all from B)', async () => {
    // Catches: a non-atomic swap or a two-statement read that sees A's state with B's manifest.
    const section = (n: number) => `# S${n}\ntext ${n}\n\n## Sub${n}\nmore ${n}\n`;
    const a: Record<string, string> = {};
    for (let i = 0; i < 3; i++) a[`docs/a${i}.md`] = section(i);
    const b: Record<string, string> = {};
    for (let i = 0; i < 300; i++) b[`docs/b${String(i).padStart(3, '0')}.md`] = section(i);
    const clone = await makeClone(a);
    const { app } = await makeApp();
    const repo = await newRepo(clone);

    await reindexNow(app, repo.id);
    const buildA = await get(app, repo.id);
    const pathsA = buildA.files.map((f: { path: string }) => f.path).join('|');
    expect(buildA.index.files).toBe(3);

    await rm(join(clone, 'docs'), { recursive: true, force: true });
    for (const [rel, text] of Object.entries(b)) await put(clone, rel, text);

    let finished = false;
    const job = post(app, repo.id).then(async () => {
      await app.container.jobs.onIdle();
      finished = true;
    });
    const seen: { files: number; chunks: number }[] = [];
    let pathsB: string | undefined;
    while (!finished) {
      const res = await Promise.all(Array.from({ length: 4 }, () => get(app, repo.id)));
      for (const body of res) {
        const paths = body.files.map((f: { path: string }) => f.path).join('|');
        expect(body.files.length).toBe(body.index.files);
        if (body.index.files === 3) {
          expect(paths).toBe(pathsA);
          expect(body.index.chunks).toBe(buildA.index.chunks);
        } else {
          expect(body.index.files).toBe(300);
          pathsB ??= paths;
          expect(paths).toBe(pathsB);
        }
        seen.push({ files: body.index.files, chunks: body.index.chunks });
      }
    }
    await job;
    expect(seen.length).toBeGreaterThanOrEqual(4);
    const finalBody = await get(app, repo.id);
    expect(finalBody.index).toMatchObject({ status: 'ready', files: 300 });
    expect(finalBody.index.chunks).toBe((await chunkRows(repo.id)).length);
    await app.close();
  });

  // ------------------------------------------------------------------ AC-9
  it('AC-9: a build that fails mid-way keeps the previous files, chunks, indexed_at and sha; status failed + internal_error; the next success clears it', async () => {
    // Catches: a failed rebuild wiping/half-replacing the last good index, a missing reason, or a failure that sticks.
    const clone = await makeClone({ 'docs/a.md': '# A\nalpha', 'docs/b.md': '# B\nbravo' });
    const { app, docs } = await makeApp();
    const repo = await newRepo(clone);
    await reindexNow(app, repo.id);
    const good = await get(app, repo.id);
    const goodChunks = await chunkRows(repo.id);
    const goodState = (await stateRow(repo.id))!;

    await put(clone, 'docs/c.md', '# C\ncharlie'); // the failed build would have added it
    docs.failOn = 'docs/b.md';
    const res = await post(app, repo.id);
    expect(res.statusCode).toBe(202);
    await app.container.jobs.onIdle();

    const failed = await get(app, repo.id);
    expect(failed.index).toMatchObject({
      status: 'failed',
      failure_reason: 'internal_error',
      indexed_at: good.index.indexed_at,
      indexed_sha: good.index.indexed_sha,
      files: good.index.files,
      chunks: good.index.chunks,
    });
    expect(failed.index.failed_at).toEqual(expect.any(String));
    expect(failed.files).toEqual(good.files);
    expect(await chunkRows(repo.id)).toEqual(goodChunks);
    const failedState = (await stateRow(repo.id))!;
    expect(failedState.indexedAt).toEqual(goodState.indexedAt);
    expect(failedState.glob).toBe(goodState.glob);
    const job = (await db().select().from(t.jobs).where(eq(t.jobs.id, res.json().job_id)))[0]!;
    expect(job.status).toBe('failed');
    expect(job.error).toBe('project context index failed: internal_error');

    docs.failOn = undefined;
    await reindexNow(app, repo.id);
    const healed = await get(app, repo.id);
    expect(healed.index).toMatchObject({ status: 'ready', files: 3 });
    expect(healed.index.failed_at).toBeUndefined();
    expect(healed.index.failure_reason).toBeUndefined();
    await app.close();
  });

  it('AC-9: a clone that disappeared fails with clone_missing and keeps the previous index; a first-ever failure leaves an empty failed state', async () => {
    // Catches: clone_missing mapped to another reason, the previous index dropped, or recordFailure
    // failing on a repository that has no state row yet.
    const clone = await makeClone({ 'docs/a.md': '# A\nalpha' });
    const { app } = await makeApp();
    const repo = await newRepo(clone);
    await reindexNow(app, repo.id);
    const good = await get(app, repo.id);

    await rm(clone, { recursive: true, force: true });
    await reindexNow(app, repo.id);
    const failed = await get(app, repo.id);
    expect(failed.index).toMatchObject({
      status: 'failed',
      failure_reason: 'clone_missing',
      files: 1,
      chunks: 1,
      indexed_at: good.index.indexed_at,
    });
    expect(failed.files).toEqual(good.files);

    const never = await newRepo(join(base, 'does-not-exist'));
    await reindexNow(app, never.id);
    const first = await get(app, never.id);
    expect(first.files).toEqual([]);
    expect(first.index).toMatchObject({
      status: 'failed',
      failure_reason: 'clone_missing',
      indexed_at: null,
      indexed_sha: null,
      files: 0,
      chunks: 0,
    });
    expect(first.stale).toBe(false); // no complete index, so nothing can be out of date
    await app.close();
  });

  // ------------------------------------------------------------------ AC-10
  it('AC-10: adding a repository (clone job) ends with a ready index and no POST; so does the refresh fetch', async () => {
    // Catches: the clone follow-up not wired (index stays "none" until a manual click), or only wired for one of the two clone paths.
    const clone = await makeClone(BASE_FILES);
    const git = new HeadGit();
    git.cloneDir = clone;
    git.head = 'head-clone';
    const { app } = await makeApp({ git });

    const add = await app.inject({ method: 'POST', url: '/repos', payload: { url: 'https://github.com/acme/idx-clone' } });
    expect(add.statusCode).toBe(201);
    const repoId = add.json().id as string;
    await app.container.jobs.onIdle();

    const ready = await get(app, repoId);
    expect(ready.cloned).toBe(true);
    expect(ready.index).toMatchObject({ status: 'ready', indexed_sha: 'head-clone', files: 3 });
    expect(await indexJobs(repoId)).toHaveLength(1);

    // refresh: a new commit is fetched, the clone job runs again and re-indexes
    git.head = 'head-fetched';
    const refresh = await app.inject({ method: 'POST', url: `/repos/${repoId}/refresh` });
    expect(refresh.statusCode).toBe(200);
    expect(refresh.json()).toEqual({ status: 'refreshing' });
    await app.container.jobs.onIdle();
    const refreshed = await get(app, repoId);
    expect(refreshed.index).toMatchObject({ status: 'ready', indexed_sha: 'head-fetched' });
    expect(refreshed.stale).toBe(false);
    expect(await indexJobs(repoId)).toHaveLength(2);
    await app.close();
  });

  it('AC-10: a failing index job does not change the clone outcome or the refresh answer', async () => {
    // Catches: an index failure failing the clone job (clone path unrecorded) or the refresh request.
    const clone = await makeClone(BASE_FILES);
    const git = new HeadGit();
    git.cloneDir = clone;
    const docs = new ControlDocs();
    docs.failOn = '*';
    const { app } = await makeApp({ git, docs });

    const add = await app.inject({ method: 'POST', url: '/repos', payload: { url: 'https://github.com/acme/idx-failing' } });
    expect(add.statusCode).toBe(201);
    const repoId = add.json().id as string;
    await app.container.jobs.onIdle();

    const [row] = await db().select().from(t.repos).where(eq(t.repos.id, repoId));
    expect(row!.clonePath).toBe(clone);
    const cloneJobs = () =>
      db()
        .select()
        .from(t.jobs)
        .where(and(eq(t.jobs.kind, 'clone'), sql`${t.jobs.payload}->>'repoId' = ${repoId}`));
    expect((await cloneJobs()).map((j) => j.status)).toEqual(['done']);
    expect((await indexJobs(repoId)).map((j) => j.status)).toEqual(['failed']);
    expect((await get(app, repoId)).index).toMatchObject({ status: 'failed', failure_reason: 'internal_error' });

    const refresh = await app.inject({ method: 'POST', url: `/repos/${repoId}/refresh` });
    expect(refresh.statusCode).toBe(200);
    expect(refresh.json()).toEqual({ status: 'refreshing' });
    await app.container.jobs.onIdle();
    expect((await cloneJobs()).map((j) => j.status)).toEqual(['done', 'done']);
    await app.close();
  });

  // ------------------------------------------------------------------ AC-11
  it('AC-11: deleting repo A removes its state, manifest and chunks; repo B is intact', async () => {
    // Catches: orphaned index rows after a repository delete (a missing or changed ON DELETE CASCADE).
    const clone = await makeClone(BASE_FILES);
    const { app } = await makeApp();
    const repoA = await newRepo(clone);
    const repoB = await newRepo(clone);
    await reindexNow(app, repoA.id);
    await reindexNow(app, repoB.id);
    const bBefore = await counts(repoB.id);
    expect(await counts(repoA.id)).toEqual({ state: 1, files: 3, chunks: 3 });

    expect((await app.inject({ method: 'DELETE', url: `/repos/${repoA.id}` })).statusCode).toBe(200);
    expect(await counts(repoA.id)).toEqual({ state: 0, files: 0, chunks: 0 });
    expect(await counts(repoB.id)).toEqual(bBefore);
    await app.close();
  });

  it('AC-11: a repository deleted while its build runs gets no index rows back and the job just ends failed', async () => {
    // Catches: the zombie build (or its failure record) re-creating rows for a deleted repository.
    const clone = await makeClone(BASE_FILES);
    const { app, docs } = await makeApp();
    const repo = await newRepo(clone);
    const release = docs.holdWalks();
    const res = await post(app, repo.id);
    expect(res.statusCode).toBe(202);
    // wait until the build is really in progress (past getRepo), so the swap hits the FK
    for (let i = 0; docs.walks < 1; i++) {
      if (i > 400) throw new Error('the build never started');
      await new Promise((r) => setTimeout(r, 5));
    }

    expect((await app.inject({ method: 'DELETE', url: `/repos/${repo.id}` })).statusCode).toBe(200);
    release();
    await app.container.jobs.onIdle();

    expect(await counts(repo.id)).toEqual({ state: 0, files: 0, chunks: 0 });
    const job = (await db().select().from(t.jobs).where(eq(t.jobs.id, res.json().job_id)))[0]!;
    expect(job.status).toBe('failed');
    await app.close();
  });

  // ------------------------------------------------------------------ AC-13
  it('AC-13: GET serves the manifest; stale on a new HEAD (old entries kept) and when the clone dir is removed; never indexed -> [] and none', async () => {
    // Catches: stale not firing for a moved HEAD or a vanished clone, entries disappearing when stale,
    // or an unindexed repo falling back to a live scan.
    const clone = await makeClone(BASE_FILES);
    const { app, git } = await makeApp();
    const repo = await newRepo(clone);

    const never = await get(app, repo.id);
    expect(never).toMatchObject({ cloned: true, files: [], stale: false, total: 0, truncated: false });
    expect(never.index).toMatchObject({ status: 'none', indexed_at: null, indexed_sha: null, files: 0, chunks: 0 });

    await reindexNow(app, repo.id);
    const fresh = await get(app, repo.id);
    expect(fresh.files).toHaveLength(3);
    expect(fresh.stale).toBe(false);

    await put(clone, 'specs/new.md', 'added after the index was built'); // not in the manifest yet
    git.head = 'head-2';
    const moved = await get(app, repo.id);
    expect(moved.stale).toBe(true);
    expect(moved.files).toEqual(fresh.files);
    expect(moved.index.indexed_sha).toBe('head-1');

    git.head = 'head-1';
    expect((await get(app, repo.id)).stale).toBe(false);

    // the same index under a different configured glob is out of date
    const adr = await makeApp({ env: { PROJECT_CONTEXT_GLOB: '**/adr/**/*.md' } });
    expect((await get(adr.app, repo.id)).stale).toBe(true);
    await adr.app.close();

    await rm(clone, { recursive: true, force: true });
    const gone = await get(app, repo.id);
    expect(gone.stale).toBe(true);
    expect(gone.cloned).toBe(true);
    expect(gone.files).toEqual(fresh.files);
    await app.close();
  });
});
