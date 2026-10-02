import { describe, it, expect, vi, afterEach } from 'vitest';
import { OctokitPriorPrSource, buildHistoryQuery, type GraphqlFn } from '../src/adapters/github/pr-history.js';
import { BLAST_HISTORY_DEADLINE_MS } from '../src/modules/blast/constants.js';

afterEach(() => vi.useRealTimers());

const Q = { repo: { owner: 'acme', name: 'x' }, ref: 'main', paths: ['src/a.ts', 'src/b.ts'] };
const pr = (n: number) => ({ number: n, title: `PR ${n}`, mergedAt: '2026-01-01T00:00:00Z', bodyText: 'b', author: { login: 'dev' } });
const history = (...nums: number[]) => ({ nodes: [{ associatedPullRequests: { nodes: nums.map(pr) } }] });

describe('OctokitPriorPrSource', () => {
  it('keeps paths and ref out of the query text and maps aliases back to paths', async () => {
    const gql = vi.fn(async () => ({ repository: { object: { f0: history(1), f1: history(2, 3) } } }));
    const hits = await new OctokitPriorPrSource(gql as GraphqlFn).listForPaths(Q);
    const [query, vars] = gql.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(query).not.toContain('src/a.ts');
    expect(query).not.toContain('main');
    expect(vars).toMatchObject({ owner: 'acme', name: 'x', ref: 'main', p0: 'src/a.ts', p1: 'src/b.ts' });
    expect(hits.map((h) => [h.number, h.path])).toEqual([[1, 'src/a.ts'], [2, 'src/b.ts'], [3, 'src/b.ts']]);
    expect(hits[0]).toMatchObject({ author: 'dev', body: 'b' });
    expect(buildHistoryQuery(2)).toBe(query);
  });

  it('retries once on HEAD when the base branch is gone', async () => {
    const gql = vi
      .fn()
      .mockResolvedValueOnce({ repository: { object: null } })
      .mockResolvedValueOnce({ repository: { object: { f0: history(7), f1: history() } } });
    const hits = await new OctokitPriorPrSource(gql as GraphqlFn).listForPaths(Q);
    expect(gql).toHaveBeenCalledTimes(2);
    expect((gql.mock.calls[1] as unknown[])[1]).toMatchObject({ ref: 'HEAD' });
    expect(hits).toHaveLength(1);
  });

  it('throws on a malformed payload', async () => {
    const gql = vi.fn(async () => ({ repository: { object: { f0: { nodes: 'nope' } } } }));
    await expect(new OctokitPriorPrSource(gql as GraphqlFn).listForPaths(Q)).rejects.toThrow();
    const bad = vi.fn(async () => ({ nonsense: true }));
    await expect(new OctokitPriorPrSource(bad as GraphqlFn).listForPaths(Q)).rejects.toThrow();
  });

  it('rejects when GitHub does not answer within the deadline', async () => {
    vi.useFakeTimers();
    const gql = vi.fn(() => new Promise(() => {}));
    const result = new OctokitPriorPrSource(gql as unknown as GraphqlFn).listForPaths(Q);
    const assertion = expect(result).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(BLAST_HISTORY_DEADLINE_MS + 1);
    await assertion;
  });
});
