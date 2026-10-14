import { describe, it, expect } from 'vitest';
import {
  buildFileDiff,
  firstExpectationOutsideDiff,
  rangeTouchesNewLines,
  type LineIndex,
  type RangeItem,
} from '../src/modules/eval/domain/case-diff.js';
import { parseUnifiedDiff } from '../src/adapters/git/diff-parser.js';
import { buildLineIndex } from '@devdigest/reviewer-core';

const PATCH = '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk",\n   redisUrl: x,';

describe('eval case-diff', () => {
  it('buildFileDiff wraps a bare patch into a diff the parser accepts, under the new path', () => {
    // Regression: pr_files.patch has no file header; without it the parser finds no file.
    const raw = buildFileDiff('src/config.ts', PATCH);
    expect(raw.split('\n').slice(0, 3)).toEqual([
      'diff --git a/src/config.ts b/src/config.ts',
      '--- a/src/config.ts',
      '+++ b/src/config.ts',
    ]);
    const parsed = parseUnifiedDiff(raw);
    expect(parsed.files.map((f) => f.path)).toEqual(['src/config.ts']);
    const idx = buildLineIndex(parsed);
    expect(idx.get('src/config.ts')?.has(11)).toBe(true);
  });

  const idx: LineIndex = new Map([['a.ts', new Set([10, 11, 12])]]);

  it('rangeTouchesNewLines: any overlap with a covered line, edges inclusive, unknown file false', () => {
    // Regression: off-by-one at hunk edges would reject valid findings or accept outside ones.
    expect(rangeTouchesNewLines(idx, 'a.ts', 12, 20)).toBe(true); // touches last line
    expect(rangeTouchesNewLines(idx, 'a.ts', 1, 10)).toBe(true); // touches first line
    expect(rangeTouchesNewLines(idx, 'a.ts', 13, 20)).toBe(false);
    expect(rangeTouchesNewLines(idx, 'a.ts', 1, 9)).toBe(false);
    expect(rangeTouchesNewLines(idx, 'a.ts', 20, 11)).toBe(true); // reversed range tolerated
    expect(rangeTouchesNewLines(idx, 'b.ts', 10, 12)).toBe(false);
  });

  it('firstExpectationOutsideDiff returns the index of the first must_find outside, ignoring must_not_flag', () => {
    // Regression: AC-11 needs the exact item index (client shows it next to the field).
    const items: RangeItem[] = [
      { expect: 'must_find', file: 'a.ts', start_line: 11 },
      { expect: 'must_not_flag', file: 'zzz.ts', start_line: 999 }, // outside, but not checked
      { expect: 'must_find', file: 'a.ts', start_line: 50, end_line: 60 }, // first offender: index 2
      { expect: 'must_find', file: 'q.ts', start_line: 1 },
    ];
    expect(firstExpectationOutsideDiff(items, idx)).toBe(2);
    expect(firstExpectationOutsideDiff(items.slice(0, 2), idx)).toBeNull();
    expect(firstExpectationOutsideDiff([], idx)).toBeNull();
  });
});
