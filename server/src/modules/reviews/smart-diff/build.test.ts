import { describe, expect, it } from 'vitest';
import { buildSmartDiff } from './build.js';

describe('buildSmartDiff', () => {
  it('emits groups in ROLE_ORDER, omitting roles with zero files', () => {
    const result = buildSmartDiff(
      [
        { path: 'docs/README.md', additions: 1, deletions: 0 },
        { path: 'src/service.ts', additions: 2, deletions: 1 },
        { path: 'pnpm-lock.yaml', additions: 3, deletions: 0 },
      ],
      [],
    );
    expect(result.groups.map((g) => g.role)).toEqual(['core', 'docs', 'boilerplate']);
  });

  it('dedupes and sorts finding_lines ascending, ignoring foreign-path anchors', () => {
    const result = buildSmartDiff(
      [{ path: 'src/service.ts', additions: 10, deletions: 0 }],
      [
        { file: 'src/service.ts', startLine: 20 },
        { file: 'src/service.ts', startLine: 5 },
        { file: 'src/service.ts', startLine: 20 },
        { file: 'src/other.ts', startLine: 1 },
      ],
    );
    expect(result.groups).toEqual([
      {
        role: 'core',
        files: [
          {
            path: 'src/service.ts',
            pseudocode_summary: null,
            additions: 10,
            deletions: 0,
            finding_lines: [5, 20],
          },
        ],
      },
    ]);
  });

  it('sums total_lines across all files', () => {
    const result = buildSmartDiff(
      [
        { path: 'a.ts', additions: 3, deletions: 2 },
        { path: 'b.ts', additions: 1, deletions: 0 },
      ],
      [],
    );
    expect(result.split_suggestion.total_lines).toBe(6);
  });

  it('returns empty groups and zero total_lines for empty input', () => {
    expect(buildSmartDiff([], [])).toEqual({
      groups: [],
      split_suggestion: { too_big: false, total_lines: 0, proposed_splits: [] },
    });
  });
});
