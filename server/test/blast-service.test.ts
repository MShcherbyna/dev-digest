import { describe, it, expect, vi } from 'vitest';
import type { PriorPrHit, PriorPrSource } from '../src/modules/blast/ports.js';
import { BlastService } from '../src/modules/blast/service.js';
import type { BlastPull } from '../src/modules/blast/ports.js';
import { HISTORY_CACHE_TTL_MS, HISTORY_MAX_FILES } from '../src/modules/blast/constants.js';
import { NotFoundError } from '../src/platform/errors.js';
import type { BlastResult, IndexState } from '../src/modules/repo-intel/index.js';

const PULL: BlastPull = {
  prId: 'pr1',
  repoId: 'repo1',
  number: 5,
  headSha: 'head',
  base: 'main',
  repo: { owner: 'acme', name: 'x' },
};

const RESULT: BlastResult = {
  changedSymbols: [{ file: 'a.ts', name: 'alpha', kind: 'function' }],
  callers: [{ file: 'b.ts', symbol: 'run', viaSymbol: 'alpha', line: 4, rank: 1 }],
  impactedEndpoints: ['GET /x'],
  factsByFile: { 'b.ts': { endpoints: ['GET /x'], crons: [] } },
  degraded: false,
};

const HITS: PriorPrHit[] = [
  { number: 3, title: 'Old', mergedAt: '2026-01-01T00:00:00Z', author: 'a', body: 'x', path: 'a.ts' },
];

function setup(over: {
  pull?: BlastPull | undefined;
  stored?: string[];
  remote?: string[];
  status?: IndexState['status'];
  enabled?: boolean;
  source?: () => Promise<PriorPrSource>;
  now?: () => number;
} = {}) {
  const getBlastRadius = vi.fn(async () => RESULT);
  const getIndexState = vi.fn(
    async () => ({ status: over.status ?? 'full', lastIndexedSha: 'sha1' }) as IndexState,
  );
  const remote = vi.fn(async () => over.remote ?? []);
  const listForPaths = vi.fn(async (): Promise<PriorPrHit[]> => HITS);
  const history = vi.fn(over.source ?? (async () => ({ listForPaths }) as PriorPrSource));
  const svc = new BlastService({
    pulls: {
      getPull: async () => ('pull' in over ? over.pull : PULL),
      listChangedPaths: async () => over.stored ?? ['a.ts'],
    },
    remoteFiles: { listChangedPaths: remote },
    intel: { getBlastRadius, getIndexState },
    history,
    ...(over.now ? { now: over.now } : {}),
    intelEnabled: () => over.enabled ?? true,
  });
  return { svc, getBlastRadius, getIndexState, remote, history, listForPaths };
}

describe('BlastService', () => {
  it('throws NotFoundError for an unknown PR', async () => {
    await expect(setup({ pull: undefined }).svc.get('ws', 'pr1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('returns no_changed_files without calling the facade when nothing is stored or fetched', async () => {
    const { svc, getBlastRadius, remote } = setup({ stored: [], remote: [] });
    const v = await svc.get('ws', 'pr1');
    expect(v).toMatchObject({ degraded: true, reason: 'no_changed_files', ref_sha: null });
    expect(remote).toHaveBeenCalledWith(PULL);
    expect(getBlastRadius).not.toHaveBeenCalled();
  });

  it('falls back to GitHub files when none are persisted', async () => {
    const { svc, getBlastRadius } = setup({ stored: [], remote: ['z.ts'] });
    await svc.get('ws', 'pr1');
    expect(getBlastRadius).toHaveBeenCalledTimes(1);
    expect(getBlastRadius).toHaveBeenCalledWith('repo1', ['z.ts']);
  });

  it('reads persisted files once and never touches GitHub', async () => {
    const { svc, getBlastRadius, remote } = setup({ stored: ['a.ts', 'c.ts'] });
    const v = await svc.get('ws', 'pr1');
    expect(getBlastRadius).toHaveBeenCalledTimes(1);
    expect(getBlastRadius).toHaveBeenCalledWith('repo1', ['a.ts', 'c.ts']);
    expect(remote).not.toHaveBeenCalled();
    expect(v).toMatchObject({ degraded: false, reason: null, ref_sha: 'sha1' });
    expect(v.downstream[0]).toMatchObject({ symbol: 'alpha', endpoints_affected: ['GET /x'] });
  });

  it('reports index_partial but keeps the data', async () => {
    const v = await setup({ status: 'partial' }).svc.get('ws', 'pr1');
    expect(v).toMatchObject({ degraded: true, reason: 'index_partial' });
    expect(v.downstream).toHaveLength(1);
  });

  it('reports flag_off when repo intelligence is disabled', async () => {
    const v = await setup({ enabled: false }).svc.get('ws', 'pr1');
    expect(v).toMatchObject({ degraded: true, reason: 'flag_off' });
  });

  it('get() never touches the history source', async () => {
    const { svc, history } = setup();
    await svc.get('ws', 'pr1');
    expect(history).not.toHaveBeenCalled();
  });
});

describe('BlastService.history', () => {
  it('throws NotFoundError for an unknown PR', async () => {
    await expect(setup({ pull: undefined }).svc.history('ws', 'pr1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('is unavailable without changed files and never resolves the source', async () => {
    const { svc, history } = setup({ stored: [], remote: [] });
    expect(await svc.history('ws', 'pr1')).toEqual({ history: [], available: false });
    expect(history).not.toHaveBeenCalled();
  });

  it('is unavailable when the source cannot be built or the call fails, and is not cached', async () => {
    const noToken = setup({ source: async () => { throw new Error('GITHUB_TOKEN is not configured'); } });
    expect(await noToken.svc.history('ws', 'pr1')).toEqual({ history: [], available: false });

    const failing = setup();
    failing.listForPaths.mockRejectedValueOnce(new Error('boom'));
    expect((await failing.svc.history('ws', 'pr1')).available).toBe(false);
    expect((await failing.svc.history('ws', 'pr1')).available).toBe(true); // retried, not cached
    expect(failing.listForPaths).toHaveBeenCalledTimes(2);
  });

  it('maps hits, queries the base branch, and caches success until the TTL passes', async () => {
    let t = 1_000;
    const { svc, listForPaths } = setup({ now: () => t });
    const first = await svc.history('ws', 'pr1');
    expect(first.available).toBe(true);
    expect(first.history[0]).toMatchObject({ pr_number: 3, files_overlap: ['a.ts'], notes: 'x' });
    expect(listForPaths).toHaveBeenCalledWith({ repo: PULL.repo, ref: 'main', paths: ['a.ts'] });

    await svc.history('ws', 'pr1');
    expect(listForPaths).toHaveBeenCalledTimes(1);
    t += HISTORY_CACHE_TTL_MS + 1;
    await svc.history('ws', 'pr1');
    expect(listForPaths).toHaveBeenCalledTimes(2);
  });

  it('queries at most HISTORY_MAX_FILES paths', async () => {
    const stored = Array.from({ length: HISTORY_MAX_FILES + 5 }, (_, i) => `f${i}.ts`);
    const { svc, listForPaths } = setup({ stored });
    await svc.history('ws', 'pr1');
    const call = listForPaths.mock.calls[0] as unknown as [{ paths: string[] }];
    expect(call[0].paths).toHaveLength(HISTORY_MAX_FILES);
  });
});
