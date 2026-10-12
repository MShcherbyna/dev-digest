/** Pure helpers for the PR Brief block (no React). */
import type { ReviewRecord, Verdict } from "@devdigest/shared";
import { formatCost } from "@/lib/format";
import type { BriefState, StoredBrief } from "@/lib/hooks/brief";
import { DEFAULT_KIND_LOOK, KIND_LOOK } from "./constants";

export type BriefViewState =
  | "loading"
  | "loadError"
  | "empty"
  | "firstGeneration"
  | "brief"
  | "regenerating";

/**
 * Which view the block shows. Derived during render from the query + mutation
 * flags, never stored. "Generating" is the server flag (survives reload, other
 * tabs) OR this tab's pending mutation.
 */
export function briefView(args: {
  query: { isLoading: boolean; isError: boolean; data: BriefState | undefined };
  mutation: { isPending: boolean };
}): BriefViewState {
  const { query, mutation } = args;
  if (query.isLoading) return "loading";
  if (!query.data) return query.isError ? "loadError" : "loading";
  const generating = query.data.generating || mutation.isPending;
  if (query.data.brief) return generating ? "regenerating" : "brief";
  return generating ? "firstGeneration" : "empty";
}

export interface ReviewBanner {
  verdict: Verdict;
  findingsCount: number;
  blockers: number;
  score: number | null;
  summary: string | null;
  agentName: string | null;
  createdAt: string;
}

/**
 * The latest `kind:"review"` review as banner data (`reviews` is newest-first,
 * same rule as the Files-changed tab). Blockers = CRITICAL and not dismissed,
 * as in ReviewRunAccordion. No review (or one without a verdict) → null.
 */
export function latestReviewBanner(reviews: ReviewRecord[] | undefined): ReviewBanner | null {
  const review = reviews?.find((r) => r.kind === "review");
  if (!review || !review.verdict) return null;
  return {
    verdict: review.verdict,
    findingsCount: review.findings.length,
    blockers: review.findings.filter((f) => f.severity === "CRITICAL" && !f.dismissed_at).length,
    score: review.score,
    summary: review.summary,
    agentName: review.agent_name ?? null,
    createdAt: review.created_at,
  };
}

/** 8200 → "8.2K", 1300 → "1.3K", 850 → "850", 12000 → "12K". */
export function formatTokensK(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
}

/** "$0.014 8.2K→1.3K"; null when the cost is unknown (the line is then hidden). */
export function costText(
  brief: Pick<StoredBrief, "cost_usd" | "tokens_in" | "tokens_out">,
): string | null {
  if (brief.cost_usd == null) return null;
  const cost = formatCost(brief.cost_usd);
  if (brief.tokens_in == null || brief.tokens_out == null) return cost;
  return `${cost} ${formatTokensK(brief.tokens_in)}→${formatTokensK(brief.tokens_out)}`;
}

/** `path`, `path:N` or `path:N-M` → the path and the FIRST line (null for a bare path). */
export function refTarget(ref: string): { path: string; line: number | null } {
  const m = /^(.+?):(\d+)(?:-\d+)?$/.exec(ref);
  if (!m) return { path: ref, line: null };
  const line = Number(m[2]);
  return { path: m[1]!, line: Number.isSafeInteger(line) && line >= 1 ? line : null };
}

export function isInDiff(path: string, diffPaths: readonly string[]): boolean {
  return diffPaths.includes(path);
}

export function kindLook(kind: string) {
  return KIND_LOOK[kind] ?? DEFAULT_KIND_LOOK;
}

/** The focus row's text, also its accessible name: "src/a.ts:12 — reason". */
export function focusLabel(item: { file: string; line: number; reason: string }): string {
  return `${item.file}:${item.line} — ${item.reason}`;
}
