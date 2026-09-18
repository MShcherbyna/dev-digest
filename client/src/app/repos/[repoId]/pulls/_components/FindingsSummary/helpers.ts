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
 * severity counts are computed from (server: reviews ordered desc(createdAt),
 * first 'review'-kind row = latest). Keeps the popover's findings and the
 * row's counts pointing at the same run.
 */
export function latestReviewFindings(reviews: ReviewRecord[] | undefined): FindingRecord[] {
  return reviews?.find((r) => r.kind === "review")?.findings ?? [];
}
