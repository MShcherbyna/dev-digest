/**
 * `ProjectContextService.resolveForBrief` (AC-7): which spec documents the PR
 * Brief may send and how they are fitted into the budget the brief service
 * hands over. Real service, in-memory clone (`MockRepoDocsSource`), fake rows.
 */
import { describe, it, expect } from 'vitest';
import { estimateTokens } from '@devdigest/reviewer-core';
import { makeDocsService } from './helpers/brief.js';

const OVERHEAD = 30;
const MIN = 200;
const input = (budgetTokens: number, over: Partial<{ repoId: string; clonePath: string | null }> = {}) => ({
  workspaceId: 'ws-1',
  repoId: 'repo-A',
  clonePath: '/clones/a' as string | null,
  budgetTokens,
  perDocOverheadTokens: OVERHEAD,
  minDocTokens: MIN,
  ...over,
});
/** A document of exactly `tokens` estimated tokens. */
const docOf = (tokens: number, ch = 'x') => ch.repeat(tokens * 4);
const cost = (docs: { content: string }[]) => docs.reduce((n, d) => n + estimateTokens(d.content) + OVERHEAD, 0);

describe('resolveForBrief (AC-7)', () => {
  it('sends a document attached to two agents once, sorted by path, and never one of another repository', async () => {
    // Catches: a duplicated doc (double token cost), unstable order, or repo-B context leaking into repo-A's brief.
    const { service, calls } = makeDocsService(
      { 'docs/b.md': '# B', 'docs/a.md': '# A', 'docs/other-repo.md': '# other' },
      {
        'repo-A': [
          { agentId: 'agent-1', paths: ['docs/b.md', 'docs/a.md'] },
          { agentId: 'agent-2', paths: ['docs/a.md'] }, // same doc, second agent (or a skill of it)
        ],
        'repo-B': [{ agentId: 'agent-1', paths: ['docs/other-repo.md'] }],
      },
    );
    const res = await service.resolveForBrief(input(8_000));
    expect(res.paths).toEqual(['docs/a.md', 'docs/b.md']);
    expect(res.docs.map((d) => d.path)).toEqual(res.paths);
    expect(calls).toEqual(['repo-A']);
  });

  it('keeps the documents within the given budget, counting the per-document overhead', async () => {
    // Catches: AC-7 - the documents part exceeding the budget (and with it the 8,000 / 12,000 NFR).
    const { service } = makeDocsService(
      { 'docs/a.md': docOf(2_000, 'a'), 'docs/b.md': docOf(2_000, 'b'), 'docs/c.md': docOf(2_000, 'c'), 'docs/d.md': docOf(2_000, 'd') },
      { 'repo-A': [{ agentId: 'a1', paths: ['docs/a.md', 'docs/b.md', 'docs/c.md', 'docs/d.md'] }] },
    );
    const res = await service.resolveForBrief(input(5_000));
    // a, b fit whole (2 x 2,030 = 4,060); c is cut into the 910 tokens that are left (>= MIN); d is never reached.
    expect(res.paths).toEqual(['docs/a.md', 'docs/b.md', 'docs/c.md']);
    expect(cost(res.docs)).toBeLessThanOrEqual(5_000);
    expect(estimateTokens(res.docs[2]!.content)).toBe(5_000 - 4_060 - OVERHEAD);
    expect(res.docs[2]!.content).toBe(docOf(2_000, 'c').slice(0, (5_000 - 4_060 - OVERHEAD) * 4));
  });

  it('skips the next document instead of sending a stub when the remainder is below the minimum, and stops', async () => {
    // Catches: a 50-token stub of a document being sent, or a later small doc jumping the queue and breaking order.
    const { service } = makeDocsService(
      { 'docs/a.md': docOf(1_000), 'docs/b.md': docOf(1_000), 'docs/c.md': docOf(10) },
      { 'repo-A': [{ agentId: 'a1', paths: ['docs/a.md', 'docs/b.md', 'docs/c.md'] }] },
    );
    // a costs 1,030; 1,100 - 1,030 = 70 left, minus overhead = 40 < 200 -> b is skipped, c (small) is not tried.
    const res = await service.resolveForBrief(input(1_100));
    expect(res.paths).toEqual(['docs/a.md']);
  });

  it('includes a document that fits exactly', async () => {
    // Catches: an off-by-one at the boundary (cost == available) wrongly cutting or dropping the document.
    const { service } = makeDocsService(
      { 'docs/a.md': docOf(970) },
      { 'repo-A': [{ agentId: 'a1', paths: ['docs/a.md'] }] },
    );
    const res = await service.resolveForBrief(input(970 + OVERHEAD));
    expect(res.docs[0]!.content).toBe(docOf(970));
  });

  it('skips invalid, missing, unreadable and empty documents without failing and still sends the valid ones', async () => {
    // Catches: one bad attachment (traversal, deleted file, empty file) aborting or poisoning the whole brief.
    const { service } = makeDocsService(
      { 'docs/ok.md': '# fine', 'docs/blank.md': '  \n ', 'docs/locked.md': 'unreadable' },
      {
        'repo-A': [
          {
            agentId: 'a1',
            paths: ['../secret.md', '/etc/passwd.md', 'docs/missing.md', 'docs/blank.md', 'docs/locked.md', 'notes.txt', 'docs/ok.md'],
          },
        ],
      },
    );
    const res = await service.resolveForBrief(input(8_000));
    expect(res.paths).toEqual(['docs/ok.md']);
  });

  it('returns nothing, without reading rows, when the repository has no clone', async () => {
    // Catches: a crash / read of an undefined clone path for an un-cloned repository.
    const { service, calls } = makeDocsService({ 'docs/a.md': '# A' }, { 'repo-A': [{ agentId: 'a1', paths: ['docs/a.md'] }] });
    expect(await service.resolveForBrief(input(8_000, { clonePath: null }))).toEqual({ docs: [], paths: [] });
    expect(calls).toEqual([]);
  });

  it('sends nothing for a zero budget and nothing when no document is attached', async () => {
    // Catches: negative-budget arithmetic sending a document when the rest of the prompt already fills the target.
    const { service } = makeDocsService({ 'docs/a.md': '# A' }, { 'repo-A': [{ agentId: 'a1', paths: ['docs/a.md'] }] });
    expect((await service.resolveForBrief(input(0))).paths).toEqual([]);
    expect((await service.resolveForBrief(input(8_000, { repoId: 'repo-none' }))).paths).toEqual([]);
  });
});
