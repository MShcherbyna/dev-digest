/**
 * Pure helpers over case diffs and expectation ranges. No I/O.
 */

/** file -> set of new-side line numbers covered by hunks (same shape as reviewer-core's index). */
export type LineIndex = Map<string, Set<number>>;

export interface RangeItem {
  expect: 'must_find' | 'must_not_flag';
  file: string;
  start_line: number;
  end_line?: number | undefined;
}

/** Wrap one file's patch into a parseable unified diff (same header shape as `diffFromPrFiles`). */
export function buildFileDiff(path: string, patch: string): string {
  return [`diff --git a/${path} b/${path}`, `--- a/${path}`, `+++ b/${path}`, patch].join('\n');
}

/** True when any line of [start, end] is a new-side line covered by a hunk of `file`. */
export function rangeTouchesNewLines(
  lineIndex: LineIndex,
  file: string,
  start: number,
  end: number,
): boolean {
  const lines = lineIndex.get(file);
  if (!lines) return false;
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  for (let n = lo; n <= hi; n++) if (lines.has(n)) return true;
  return false;
}

/** Index of the first `must_find` item whose range misses the diff, or `null` (P1-AC-11). */
export function firstExpectationOutsideDiff(
  items: readonly RangeItem[],
  lineIndex: LineIndex,
): number | null {
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    if (item.expect !== 'must_find') continue;
    if (!rangeTouchesNewLines(lineIndex, item.file, item.start_line, item.end_line ?? item.start_line)) {
      return i;
    }
  }
  return null;
}
