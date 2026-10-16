import type { EvalAgentRun, EvalCaseStatus, EvalCaseSummary, ExpectedItem } from "@/lib/hooks/eval";

/** Runs whose metrics are meaningful (a `failed` run has all metrics null). */
const isFinished = (r: EvalAgentRun) => r.status === "done" || r.status === "partial";

/** The latest and the previous finished run, from a newest-first list. */
export function latestTwoFinished(runs: EvalAgentRun[] | undefined): [EvalAgentRun | null, EvalAgentRun | null] {
  const finished = (runs ?? []).filter(isFinished);
  return [finished[0] ?? null, finished[1] ?? null];
}

/** Whole-point delta between two fractions; null when either side is missing. */
export function deltaPoints(current: number | null | undefined, previous: number | null | undefined): number | null {
  if (current == null || previous == null) return null;
  return Math.round((current - previous) * 100);
}

export function formatPct(v: number | null | undefined): string {
  return v == null ? "—" : `${Math.round(v * 100)}%`;
}

export type RowStatus = "never" | EvalCaseStatus;

/** `activeRunId`: while that agent run is going, a case without a result from it yet is queued, so it spins like a running one. */
export function rowStatus(c: EvalCaseSummary, activeRunId?: string | null): RowStatus {
  if (activeRunId && c.latest_result?.eval_run_id !== activeRunId) return "running";
  return c.latest_result?.status ?? "never";
}

export function passingBadge(cases: EvalCaseSummary[]): { passed: number; total: number } {
  return { passed: cases.filter((c) => rowStatus(c) === "passed").length, total: cases.length };
}

export type RowLabel =
  | { kind: "expectation"; text: string }
  | { kind: "mustNotFlag" }
  | { kind: "empty" }
  | null;

/** The chip shown on a case row: first must_find "SEVERITY · category", else "must not flag" / "empty []". */
export function rowLabel(items: ExpectedItem[]): RowLabel {
  if (items.length === 0) return { kind: "empty" };
  const first = items.find((i) => i.expect === "must_find");
  if (!first) return { kind: "mustNotFlag" };
  const parts = [first.severity, first.category].filter((p): p is string => !!p);
  return parts.length ? { kind: "expectation", text: parts.join(" · ") } : null;
}
