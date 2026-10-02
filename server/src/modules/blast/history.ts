import type { PrHistoryItem } from '@devdigest/shared';
import { HISTORY_NOTE_MAX } from './constants.js';
import type { PriorPrHit } from './ports.js';

/** Lines that are template scaffolding rather than a description. */
const SKIP_LINE = /^(#|<!--|>|- \[|\||```)/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

/**
 * One-line plain-text note from a PR body (no model): the first meaningful line,
 * whitespace-collapsed, control characters stripped, truncated with an ellipsis.
 * `bodyText` from GitHub is already markdown-stripped. `''` when nothing qualifies.
 */
export function noteFromBody(body: string): string {
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || SKIP_LINE.test(line)) continue;
    const text = line.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    return text.length <= HISTORY_NOTE_MAX ? text : `${text.slice(0, HISTORY_NOTE_MAX - 1)}…`;
  }
  return '';
}

/**
 * Hits -> prior PRs: unmerged hits, the current PR and hits on non-changed paths dropped, merged by number
 * (`files_overlap` = touched changed paths), ordered by overlap, then recency, then number.
 */
export function toPriorPrs(
  hits: PriorPrHit[],
  opts: { currentNumber: number; changedPaths: string[]; limit: number },
): PrHistoryItem[] {
  const changed = new Set(opts.changedPaths);
  const byNumber = new Map<number, { hit: PriorPrHit; mergedAt: string; paths: Set<string> }>();
  for (const h of hits) {
    if (h.mergedAt == null || h.number === opts.currentNumber || !changed.has(h.path)) continue;
    const entry = byNumber.get(h.number) ?? { hit: h, mergedAt: h.mergedAt, paths: new Set<string>() };
    entry.paths.add(h.path);
    byNumber.set(h.number, entry);
  }
  return [...byNumber.values()]
    .map(({ hit, mergedAt, paths }) => ({
      pr_number: hit.number,
      title: hit.title,
      merged_at: mergedAt,
      author: hit.author,
      files_overlap: [...paths].sort(),
      notes: noteFromBody(hit.body),
    }))
    .sort(
      (a, b) =>
        b.files_overlap.length - a.files_overlap.length ||
        (a.merged_at < b.merged_at ? 1 : a.merged_at > b.merged_at ? -1 : 0) ||
        b.pr_number - a.pr_number,
    )
    .slice(0, opts.limit);
}
