/**
 * Project Context index lifecycle with in-memory fake ports (spec 2026-10-13):
 * re-index requests (AC-1/2/3), failure and timeout handling (AC-9), the
 * clone follow-up (AC-10), the listing served from the index (AC-13) and the
 * in-memory build (AC-6/7). No DB, no Docker.
 */
import { describe, it, expect } from 'vitest';
import { ProjectContextService } from '../src/modules/project-context/service.js';
import { buildIndex, CancelledError } from '../src/modules/project-context/indexer.js';
import { resolveGlob } from '../src/modules/project-context/glob.js';
import { sha256Hex } from '../src/modules/project-context/helpers.js';
import { INDEX_JOB_KIND, MAX_DOC_BYTES } from '../src/modules/project-context/constants.js';
import type { ProjectContextStore, RepoLocation } from '../src/modules/project-context/ports.js';
import { MockRepoDocsSource, type MockRepoDocsFiles } from '../src/adapters/mocks.js';
import { AppError } from '../src/platform/errors.js';
import { TimeoutError } from '../src/platform/resilience.js';
import { FakeHead, FakeIndexStore, FakeJobs, spyLog } from './helpers/context-index.js';

const WS = 'ws-1';
const REPO: RepoLocation = { id: 'repo-1', owner: 'acme', name: 'api', clonePath: '/clones/acme/api' };

/** Only `getRepo` and `usedByRows` matter to the index paths. */
function storeFor(repo: RepoLocation | undefined): ProjectContextStore {
  return {
    getRepo: async (ws: string, id: string) => (ws === WS && repo?.id === id ? repo : undefined),
    usedByRows: async () => [],
  } as unknown as ProjectContextStore;
}

/** Counts every clone access and can hold the walk open (a build "in progress"). */
class SpyDocs extends MockRepoDocsSource {
  walkCalls = 0;
  readCalls = 0;
  readRawCalls = 0;
  gate: Promise<void> | undefined;
  override async walk(...args: Parameters<MockRepoDocsSource['walk']>) {
    this.walkCalls++;
    if (this.gate) await this.gate;
    return super.walk(...args);
  }
  override async read(...args: Parameters<MockRepoDocsSource['read']>) {
    this.readCalls++;
    return super.read(...args);
  }
  override async readRaw(...args: Parameters<MockRepoDocsSource['readRaw']>) {
    this.readRawCalls++;
    return super.readRaw(...args);
  }
}

function make(
  files: MockRepoDocsFiles | null = { 'docs/a.md': '# A\nalpha', 'specs/b.md': 'bravo' },
  opts: { repo?: RepoLocation | undefined; glob?: string; docs?: SpyDocs; index?: FakeIndexStore } = {},
) {
  const docs = opts.docs ?? new SpyDocs(files);
  const index = opts.index ?? new FakeIndexStore();
  const head = new FakeHead();
  const jobs = new FakeJobs();
  const { log, warns, infos } = spyLog();
  const svc = new ProjectContextService({
    store: storeFor('repo' in opts ? opts.repo : REPO),
    docs,
    glob: resolveGlob(opts.glob),
    log,
    index,
    head,
    jobs,
  });
  svc.registerIndexJobHandler();
  const handler = () => jobs.handlers.get(INDEX_JOB_KIND)!;
  return { svc, docs, index, head, jobs, warns, infos, handler };
}

async function codeOf(p: Promise<unknown>): Promise<[number, string] | undefined> {
  try {
    await p;
    return undefined;
  } catch (e) {
    return e instanceof AppError ? [e.statusCode, e.code] : [-1, String(e)];
  }
}

describe('requestReindex / discover lifecycle', () => {
  it('AC-1: accepted with a job id; the listing says indexing until the job ends, then ready; one success log line', async () => {
    // Catches: "indexing" missing from the listing while a job is queued (UI never shows progress),
    // or "ready" never reported once the job settles.
    const { svc, jobs, infos } = make();
    expect((await svc.discover(WS, REPO.id)).index.status).toBe('none');

    const accepted = await svc.requestReindex(WS, REPO.id);
    expect(accepted).toEqual({ status: 'accepted', job_id: 'job-1' });
    expect(jobs.enqueued).toEqual([
      { kind: INDEX_JOB_KIND, payload: { workspaceId: WS, repoId: REPO.id } },
    ]);
    expect((await svc.discover(WS, REPO.id)).index.status).toBe('indexing');

    await jobs.runNext();
    const after = await svc.discover(WS, REPO.id);
    expect(after.index).toMatchObject({ status: 'ready', indexed_sha: 'sha-1', files: 2, chunks: 2 });
    expect(after.index.indexed_at).not.toBeNull();
    expect(after.files.map((f) => f.path)).toEqual(['docs/a.md', 'specs/b.md']);
    expect(infos).toHaveLength(1);
    expect(infos[0]!.msg).toMatch(/^project context index: 2 files, 2 chunks, \d+ ms, sha sha-1$/);
  });

  it('AC-3: concurrent requests share one job id and queue exactly one job; the merged request logs nothing', async () => {
    // Catches: a double click or clone+button race queueing two builds that overwrite each other.
    const { svc, jobs, infos, warns } = make();
    const [a, b] = await Promise.all([svc.requestReindex(WS, REPO.id), svc.requestReindex(WS, REPO.id)]);
    const c = await svc.requestReindex(WS, REPO.id);
    expect(a.job_id).toBe(b.job_id);
    expect(c.job_id).toBe(a.job_id);
    expect(jobs.enqueued).toHaveLength(1);
    expect(infos).toHaveLength(0);
    expect(warns).toHaveLength(0);

    // once the job has ended a new request queues a new job
    await jobs.runNext();
    const d = await svc.requestReindex(WS, REPO.id);
    expect(d.job_id).not.toBe(a.job_id);
    expect(jobs.enqueued).toHaveLength(2);
  });

  it('AC-2: foreign repo 404, uncloned 409 not_cloned, queue failure 503; nothing queued or written, and the repo can be retried', async () => {
    // Catches: a rejected request leaving a phantom "indexing" entry or touching the stored index.
    const { svc, jobs, index } = make();
    expect(await codeOf(svc.requestReindex('other-ws', REPO.id))).toEqual([404, 'not_found']);
    expect(await codeOf(svc.requestReindex(WS, 'ghost'))).toEqual([404, 'not_found']);

    const noClone = make({}, { repo: { ...REPO, clonePath: null } });
    expect(await codeOf(noClone.svc.requestReindex(WS, REPO.id))).toEqual([409, 'not_cloned']);
    expect(noClone.jobs.enqueued).toHaveLength(0);

    jobs.enqueueError = new Error('queue down');
    expect(await codeOf(svc.requestReindex(WS, REPO.id))).toEqual([503, 'job_unavailable']);
    expect((await svc.discover(WS, REPO.id)).index.status).toBe('none'); // not stuck on "indexing"
    expect(jobs.enqueued).toHaveLength(0);
    expect(index.replaceCalls).toBe(0);
    expect(index.failureCalls).toEqual([]);
    expect(index.state).toBeUndefined();

    jobs.enqueueError = undefined;
    expect((await svc.requestReindex(WS, REPO.id)).status).toBe('accepted');
  });

  it('AC-10: requestReindexAfterClone never throws (uncloned, queue down) and queues one job when it can', async () => {
    // Catches: an index follow-up failure failing the clone job.
    const noClone = make({}, { repo: { ...REPO, clonePath: null } });
    await expect(noClone.svc.requestReindexAfterClone(WS, REPO.id)).resolves.toBeUndefined();
    const down = make();
    down.jobs.enqueueError = new Error('queue down');
    await expect(down.svc.requestReindexAfterClone(WS, REPO.id)).resolves.toBeUndefined();
    await expect(down.svc.requestReindexAfterClone(WS, 'ghost')).resolves.toBeUndefined();

    const ok = make();
    await ok.svc.requestReindexAfterClone(WS, REPO.id);
    await ok.svc.requestReindexAfterClone(WS, REPO.id); // merged under AC-3
    expect(ok.jobs.enqueued).toHaveLength(1);
  });
});

describe('failures (AC-9)', () => {
  it('AC-9: head unreadable or clone directory gone -> clone_missing; a store error -> internal_error; the job rejects with a non-retryable plain Error', async () => {
    // Catches: a wrong failure_reason, a retryable error (JobRunner would retry a doomed build),
    // or a failed job leaving the repository stuck on "indexing".
    const headDown = make();
    headDown.head.sha = new Error('git gone');
    await headDown.svc.requestReindex(WS, REPO.id);
    await headDown.jobs.runNext();
    expect(headDown.index.failureCalls).toEqual(['clone_missing']);
    expect(headDown.warns[0]).toEqual({
      msg: 'project context index failed: clone_missing',
      data: { repoId: REPO.id },
    });
    expect((await headDown.svc.discover(WS, REPO.id)).index).toMatchObject({
      status: 'failed',
      failure_reason: 'clone_missing',
    });

    const noDir = make(null);
    await noDir.svc.requestReindex(WS, REPO.id);
    await noDir.jobs.runNext();
    expect(noDir.index.failureCalls).toEqual(['clone_missing']);

    const broken = make();
    broken.index.failReplace = new Error('db exploded');
    await broken.svc.requestReindex(WS, REPO.id);
    const payload = broken.jobs.pending[0]!.payload;
    const thrown = (await broken
      .handler()(payload)
      .then(
        () => undefined,
        (e: unknown) => e,
      )) as Error & Record<string, unknown>;
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown.message).toBe('project context index failed: internal_error');
    expect(thrown.status).toBeUndefined();
    expect(thrown.statusCode).toBeUndefined();
    expect(thrown.code).toBeUndefined();
    expect(broken.index.failureCalls).toEqual(['internal_error']);
    expect(broken.infos).toHaveLength(0); // no "success" line for a failed build
  });

  it('AC-9: a failed re-index keeps the previous index and listing, status failed with failed_at and a reason', async () => {
    // Catches: a failed build wiping or half-replacing the last good manifest.
    const { svc, jobs, docs, index } = make();
    await svc.requestReindex(WS, REPO.id);
    await jobs.runNext();
    const good = await svc.discover(WS, REPO.id);

    docs.setFiles({ 'docs/new.md': 'would replace' });
    index.failReplace = new Error('db exploded');
    await svc.requestReindex(WS, REPO.id);
    await jobs.runNext();

    const after = await svc.discover(WS, REPO.id);
    expect(after.files).toEqual(good.files);
    expect(after.index).toMatchObject({
      status: 'failed',
      failure_reason: 'internal_error',
      indexed_at: good.index.indexed_at,
      indexed_sha: good.index.indexed_sha,
      files: good.index.files,
      chunks: good.index.chunks,
    });
    expect(after.index.failed_at).toBeDefined();
  });

  it('AC-9: a job timeout records failure "timeout"; a build still running afterwards never reaches the store', async () => {
    // Catches: the zombie handler (JobRunner timeouts do not stop it) overwriting the index after the
    // user was told the job failed, or the repository staying "indexing" forever.
    const docs = new SpyDocs({ 'docs/a.md': '# A\nalpha' });
    const { svc, jobs, index, warns, handler } = make(undefined, { docs });
    let release!: () => void;
    docs.gate = new Promise<void>((r) => (release = r));

    await svc.requestReindex(WS, REPO.id);
    const running = handler()(jobs.pending[0]!.payload); // the build is held open in walk()
    await jobs.timeoutNext(new TimeoutError(120_000));

    expect(index.failureCalls).toEqual(['timeout']);
    expect(warns[0]).toEqual({ msg: 'project context index failed: timeout', data: { repoId: REPO.id } });
    expect((await svc.discover(WS, REPO.id)).index).toMatchObject({ status: 'failed', failure_reason: 'timeout' });

    release();
    await expect(running).resolves.toBeUndefined(); // cancelled silently, no second failure
    expect(index.replaceCalls).toBe(0);
    expect(index.failureCalls).toEqual(['timeout']);
    expect(index.state?.indexedAt).toBeNull();
  });

  it('AC-9: a timed-out build that gets as far as the swap is rolled back by assertNotCancelled', async () => {
    // Catches: the last in-transaction cancellation check being dropped (a timed-out job committing anyway).
    const docs = new SpyDocs({ 'docs/a.md': 'first' });
    const { svc, jobs, index, handler } = make(undefined, { docs });
    await svc.requestReindex(WS, REPO.id);
    await jobs.runNext();
    const before = structuredClone(index.state);

    docs.setFiles({}); // no per-file cancellation check can fire
    let release!: () => void;
    docs.gate = new Promise<void>((r) => (release = r));
    await svc.requestReindex(WS, REPO.id);
    const running = handler()(jobs.pending[0]!.payload);
    await jobs.timeoutNext(new TimeoutError(1));
    release();
    await running;

    expect(index.replaceCalls).toBe(2); // it did try to swap...
    expect(index.state).toMatchObject({
      indexedAt: before!.indexedAt,
      indexedSha: before!.indexedSha,
      files: before!.files,
      chunks: before!.chunks,
      status: 'failed',
      failureReason: 'timeout',
    }); // ...and was rolled back
    expect(index.state?.files).toBe(1);
    expect(index.files.map((f) => f.path)).toEqual(['docs/a.md']);
  });
});

describe('listing from the index (AC-13)', () => {
  it('AC-13: GET never walks or reads the clone; stale only when HEAD moved, is unreadable, the clone dir is gone or the glob changed', async () => {
    // Catches: the listing silently scanning the clone again (the NFR this feature exists for),
    // or a stale flag that misses one of the four causes.
    const { svc, jobs, docs, head, index } = make();
    await svc.requestReindex(WS, REPO.id);
    await jobs.runNext();
    const [w, r, rr] = [docs.walkCalls, docs.readCalls, docs.readRawCalls];

    const fresh = await svc.discover(WS, REPO.id);
    expect(fresh.stale).toBe(false);
    expect(fresh.files).toHaveLength(2);
    expect([docs.walkCalls, docs.readCalls, docs.readRawCalls]).toEqual([w, r, rr]);

    head.sha = 'sha-2';
    const moved = await svc.discover(WS, REPO.id);
    expect(moved.stale).toBe(true);
    expect(moved.files).toEqual(fresh.files); // the old entries are still served
    expect(moved.index.indexed_sha).toBe('sha-1');

    head.sha = new Error('no git');
    expect((await svc.discover(WS, REPO.id)).stale).toBe(true);

    head.sha = 'sha-1';
    docs.setFiles(null); // clone directory removed, path still recorded
    expect((await svc.discover(WS, REPO.id)).stale).toBe(true);
    docs.setFiles({});
    expect((await svc.discover(WS, REPO.id)).stale).toBe(false);

    // a service configured with a different glob over the same stored index
    const other = make(undefined, { index, glob: '**/adr/**/*.md' });
    expect((await other.svc.discover(WS, REPO.id)).stale).toBe(true);
    expect([docs.walkCalls, docs.readCalls, docs.readRawCalls]).toEqual([w, r, rr]);
  });

  it('AC-13: the served glob is the configured one, and used_by is computed at request time', async () => {
    // Catches: the index freezing used_by (attachments change without a re-index).
    const rows: { agentId: string; paths: string[] }[] = [];
    const store = { ...storeFor(REPO), usedByRows: async () => rows } as unknown as ProjectContextStore;
    const jobs = new FakeJobs();
    const svc = new ProjectContextService({
      store,
      docs: new SpyDocs({ 'docs/a.md': 'x' }),
      glob: resolveGlob(undefined),
      log: spyLog().log,
      index: new FakeIndexStore(),
      head: new FakeHead(),
      jobs,
    });
    svc.registerIndexJobHandler();
    await svc.requestReindex(WS, REPO.id);
    await jobs.runNext();
    expect((await svc.discover(WS, REPO.id)).files[0]!.used_by).toBe(0);
    rows.push({ agentId: 'A1', paths: ['docs/a.md'] }, { agentId: 'A2', paths: ['docs/a.md'] });
    expect((await svc.discover(WS, REPO.id)).files[0]!.used_by).toBe(2);
  });
});

describe('buildIndex (AC-4, AC-6, AC-7)', () => {
  const deps = (docs: MockRepoDocsSource) => ({ docs, glob: resolveGlob(undefined) });
  const input = { clonePath: '/c', indexedSha: 'abc' };
  const encode = (s: string) => new TextEncoder().encode(s);

  it('AC-7: too-large, invalid UTF-8, unreadable and whitespace-only docs keep a manifest entry with a flag and no chunks; AC-6: hashes', async () => {
    // Catches: a bad file aborting the whole index, being dropped from `files`, or producing chunks;
    // chunk hashes not being SHA-256 of the exact text; the file hash not covering the raw bytes.
    const bad = new Uint8Array([0xff, 0xfe, 0x41]);
    const docs = new MockRepoDocsSource({
      'docs/ok.md': '# T\nbody\n\n## U\nmore',
      'docs/huge.md': { size: MAX_DOC_BYTES + 1 },
      'docs/bad.md': bad,
      'docs/io.md': 'unreadable',
      'docs/blank.md': '  \n\t',
    });
    const build = (await buildIndex(deps(docs), input, () => false))!;
    expect(build).toMatchObject({ indexedSha: 'abc', truncated: false, total: 5 });
    const by = Object.fromEntries(build.files.map((f) => [f.path, f]));
    expect(build.files.map((f) => f.path)).toEqual([
      'docs/bad.md',
      'docs/blank.md',
      'docs/huge.md',
      'docs/io.md',
      'docs/ok.md',
    ]);
    expect(by['docs/huge.md']).toMatchObject({ tooLarge: true, contentHash: null, chunks: [] });
    expect(by['docs/io.md']).toMatchObject({ unreadable: true, contentHash: null, chunks: [] });
    expect(by['docs/bad.md']).toMatchObject({ unreadable: true, contentHash: sha256Hex(bad), chunks: [] });
    expect(by['docs/blank.md']).toMatchObject({ empty: true, contentHash: sha256Hex('  \n\t'), chunks: [] });
    expect(by['docs/ok.md']).toMatchObject({
      tooLarge: false,
      unreadable: false,
      empty: false,
      contentHash: sha256Hex('# T\nbody\n\n## U\nmore'),
    });
    const chunks = by['docs/ok.md']!.chunks;
    expect(chunks.map((c) => c.breadcrumb)).toEqual([['T'], ['T', 'U']]);
    for (const c of chunks) expect(c.contentHash).toBe(sha256Hex(c.text));
    expect(chunks.map((c) => c.text).join('')).toBe('# T\nbody\n\n## U\nmore');
  });

  it('AC-6: a leading BOM is stripped like on the run path; chunk hashes cover the BOM-less text, the file hash the raw bytes', async () => {
    // Catches: index text diverging from what a run reads (read() strips the BOM), or hashing the wrong bytes.
    const raw = new Uint8Array([0xef, 0xbb, 0xbf, ...encode('# A\nx')]);
    const build = (await buildIndex(deps(new MockRepoDocsSource({ 'docs/bom.md': raw })), input, () => false))!;
    const f = build.files[0]!;
    expect(f.contentHash).toBe(sha256Hex(raw));
    expect(f.chunks[0]!.text).toBe('# A\nx');
    expect(f.chunks[0]!.contentHash).toBe(sha256Hex('# A\nx'));
  });

  it('AC-4: applies the glob, excluded dirs, path rule and the 2,000 cap; a missing clone is null; a cancelled build throws', async () => {
    // Catches: excluded directories or hostile paths entering the manifest; an unbounded index.
    const files: MockRepoDocsFiles = { 'docs/a.md': 'x', 'node_modules/x/docs/d.md': 'x', 'docs/q"t.md': 'x', 'README.md': 'x' };
    for (let i = 0; i < 2001; i++) files[`specs/f${String(i).padStart(4, '0')}.md`] = 'x';
    const b = (await buildIndex(deps(new MockRepoDocsSource(files)), input, () => false))!;
    expect(b.files).toHaveLength(2000);
    expect(b).toMatchObject({ truncated: true, total: 2002 });
    expect(b.files.some((f) => f.path.includes('node_modules') || f.path === 'README.md')).toBe(false);

    expect(await buildIndex(deps(new MockRepoDocsSource(null)), input, () => false)).toBeNull();
    await expect(buildIndex(deps(new MockRepoDocsSource({ 'docs/a.md': 'x' })), input, () => true)).rejects.toBeInstanceOf(
      CancelledError,
    );
  });

  it('AC-9: a read that throws mid-build rejects the build (no partial index is returned)', async () => {
    // Catches: a swallowed read error producing a silently incomplete manifest.
    const docs = new MockRepoDocsSource({ 'docs/a.md': 'x', 'docs/b.md': 'y' }, { failOn: 'docs/b.md' });
    await expect(buildIndex(deps(docs), input, () => false)).rejects.toThrow('mock readRaw failure');
  });
});
