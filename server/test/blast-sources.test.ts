import { describe, it, expect, vi, afterEach } from 'vitest';
import { GitHubChangedFiles } from '../src/modules/blast/sources.js';
import { BLAST_GITHUB_DEADLINE_MS } from '../src/modules/blast/constants.js';
import type { BlastPull } from '../src/modules/blast/ports.js';
import type { GitHubClient } from '@devdigest/shared';

const PULL: BlastPull = {
  prId: 'pr1',
  repoId: 'repo1',
  number: 5,
  headSha: 'head',
  repo: { owner: 'acme', name: 'x' },
};

const clientWith = (getPullRequest: unknown) =>
  ({ getPullRequest }) as unknown as GitHubClient;

afterEach(() => vi.useRealTimers());

describe('GitHubChangedFiles', () => {
  it('returns the changed paths on success', async () => {
    const getPullRequest = vi.fn(async () => ({ files: [{ path: 'a.ts' }, { path: 'b.ts' }] }));
    const src = new GitHubChangedFiles({ github: async () => clientWith(getPullRequest) });
    await expect(src.listChangedPaths(PULL)).resolves.toEqual(['a.ts', 'b.ts']);
    expect(getPullRequest).toHaveBeenCalledWith(PULL.repo, 5);
  });

  it('returns [] when there is no client or the call fails', async () => {
    const noToken = new GitHubChangedFiles({
      github: async () => {
        throw new Error('GITHUB_TOKEN is not configured');
      },
    });
    await expect(noToken.listChangedPaths(PULL)).resolves.toEqual([]);

    const failing = new GitHubChangedFiles({
      github: async () =>
        clientWith(async () => {
          throw new Error('boom');
        }),
    });
    await expect(failing.listChangedPaths(PULL)).resolves.toEqual([]);
  });

  it('returns [] when GitHub does not answer within the deadline', async () => {
    vi.useFakeTimers();
    const never = () => new Promise(() => {});
    const src = new GitHubChangedFiles({ github: async () => clientWith(never) });
    const result = src.listChangedPaths(PULL);
    await vi.advanceTimersByTimeAsync(BLAST_GITHUB_DEADLINE_MS + 1);
    await expect(result).resolves.toEqual([]);
    expect(vi.getTimerCount()).toBe(0); // deadline timer cleared
  });
});
