import type { Severity } from "@devdigest/ui";
import type { PrFindingsCounts, FindingRecord, ReviewRecord } from "@devdigest/shared";

/** PrFindingsCounts (lowercase, server-shaped) → per-Severity lookup. */
export function toSeverityCounts(counts: PrFindingsCounts): Record<Severity, number> {
  return {
    CRITICAL: counts.critical,
    WARNING: counts.warning,
    SUGGESTION: counts.suggestion,
    INFO: 0,
  };
}

/**
 * Findings from the PR's latest 'review'-kind run — the same run the list's
 * severity counts are computed from server-side. Picks the max by
 * `created_at` explicitly rather than trusting `reviews` array order: the
 * API happens to return them `desc(createdAt)` today, but relying on that
 * implicitly let the popover's findings silently drift out of sync with the
 * trigger's counts if that ordering ever changed. Keeps both pointing at
 * the same run regardless of input order.
 */
export function latestReviewFindings(reviews: ReviewRecord[] | undefined): FindingRecord[] {
  const reviewRuns = reviews?.filter((r) => r.kind === "review") ?? [];
  if (reviewRuns.length === 0) return [];
  const latest = reviewRuns.reduce((a, b) =>
    Date.parse(b.created_at) > Date.parse(a.created_at) ? b : a,
  );
  return latest.findings;
}
