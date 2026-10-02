import { describe, it, expect } from 'vitest';
import { noteFromBody, toPriorPrs } from '../src/modules/blast/history.js';
import { HISTORY_NOTE_MAX } from '../src/modules/blast/constants.js';
import type { PriorPrHit } from '../src/modules/blast/ports.js';

const hit = (number: number, mergedAt: string | null, path: string, over: Partial<PriorPrHit> = {}): PriorPrHit => ({
  number, title: `PR ${number}`, mergedAt, author: 'dev', body: '', path, ...over,
});

describe('noteFromBody', () => {
  it('skips headings, comments, quotes, checklists, tables and code fences', () => {
    const body = '## Summary\n<!-- hidden -->\n> quote\n- [ ] todo\n| a | b |\n```\nreal text   here\n';
    expect(noteFromBody(body)).toBe('real text here');
  });
  it('truncates with an ellipsis and strips control characters', () => {
    const long = 'x'.repeat(HISTORY_NOTE_MAX + 20);
    const out = noteFromBody(long);
    expect(out).toHaveLength(HISTORY_NOTE_MAX);
    expect(out.endsWith('…')).toBe(true);
    expect(noteFromBody('a\u0007b')).toBe('a b');
  });
  it('returns an empty string for an empty or template-only body', () => {
    expect(noteFromBody('')).toBe('');
    expect(noteFromBody('## A\n\n- [ ] b')).toBe('');
  });
});

describe('toPriorPrs', () => {
  const opts = { currentNumber: 9, changedPaths: ['a.ts', 'b.ts'], limit: 5 };

  it('drops unmerged and current PRs, merges by number, orders by overlap, date, number', () => {
    const out = toPriorPrs(
      [
        hit(1, '2026-01-01T00:00:00Z', 'a.ts'),
        hit(2, '2026-03-01T00:00:00Z', 'a.ts'),
        hit(3, '2026-02-01T00:00:00Z', 'a.ts'),
        hit(3, '2026-02-01T00:00:00Z', 'b.ts'),
        hit(4, null, 'a.ts'),
        hit(9, '2026-04-01T00:00:00Z', 'a.ts'),
        hit(5, '2026-03-01T00:00:00Z', 'zzz.ts'),
      ],
      opts,
    );
    expect(out.map((p) => p.pr_number)).toEqual([3, 2, 1]);
    expect(out[0]).toMatchObject({ pr_number: 3, files_overlap: ['a.ts', 'b.ts'] });
  });

  it('caps the list and takes the note from the PR body', () => {
    const hits = Array.from({ length: 8 }, (_, i) => hit(i + 1, `2026-01-0${i + 1}T00:00:00Z`, 'a.ts', { body: `note ${i}` }));
    const out = toPriorPrs(hits, opts);
    expect(out).toHaveLength(5);
    expect(out[0]).toMatchObject({ pr_number: 8, notes: 'note 7' });
  });
});
