import type { ReviewRecord } from "@devdigest/shared";
import type { useTranslations } from "next-intl";
import type { EvalAwareFinding } from "@/lib/hooks/eval";
import type {
  AgentColumnFindingView,
  AgentColumnView,
  Conflict,
  ConflictTake,
  MultiAgentRunView as MultiAgentRunViewType,
} from "@/lib/types";

/** A conflict = more than one distinct verdict among its takes (AC-25). */
export function isConflict(conflict: Conflict): boolean {
  const verdicts = new Set((conflict.takes as ConflictTake[]).map((t) => t.verdict));
  return verdicts.size > 1;
}

export type CellKind = "flagged" | "did_not_flag" | "failed" | "cancelled" | "queued" | "running";

export interface Cell {
  kind: CellKind;
  verdict?: string;
  note?: string;
}

/** Render one disagreement-card cell for a (column, take) pair (Q-8). A column
 * that never produced a verdict (queued/running/failed/cancelled) renders from
 * its OWN status, not from "did not flag" (AC-24). */
export function cellFor(column: AgentColumnView | undefined, take: ConflictTake | undefined): Cell {
  if (!column) return { kind: "did_not_flag" };
  if (column.status === "queued") return { kind: "queued" };
  if (column.status === "running") return { kind: "running" };
  if (column.status === "failed") return { kind: "failed" };
  if (column.status === "cancelled") return { kind: "cancelled" };
  if (!take || take.verdict === "ignored") return { kind: "did_not_flag" };
  return { kind: "flagged", verdict: take.verdict, note: take.note };
}

/** Header meta line: "{n} agents · parallel fan-out · {duration}s total · {cost}",
 * with a "partial" suffix when any column isn't done or has a null cost (AC-26). */
export function headerMeta(run: MultiAgentRunViewType, t: ReturnType<typeof useTranslations>): string {
  const durationS = (run.total_duration_ms / 1000).toFixed(1);
  const cost = run.total_cost_usd != null ? `$${run.total_cost_usd.toFixed(2)}` : "$0";
  const partial = run.columns.some((c) => c.status !== "done" || c.cost_usd == null);
  const key = partial ? "page.metaPartial" : "page.meta";
  return t(key, { count: run.agent_count, duration: durationS, cost });
}

/** Every OTHER column's finding in the same group (AC-22 "also flagged by"). */
export function similarMembers(
  finding: AgentColumnFindingView,
  columns: AgentColumnView[],
): { agentName: string; finding: AgentColumnFindingView }[] {
  if (!finding.group_id) return [];
  const out: { agentName: string; finding: AgentColumnFindingView }[] = [];
  for (const col of columns) {
    for (const f of col.findings) {
      if (f.id === finding.id) continue;
      if (f.group_id === finding.group_id) out.push({ agentName: col.agent_name, finding: f });
    }
  }
  return out;
}

/** Full persisted finding records (with accept/dismiss state + eval_case_id)
 * keyed by id, flattened from every review on this PR (R5: join the
 * multi-run's thin columns with the PR's full `usePrReviews` records). */
export function buildFindingMap(
  reviews: (ReviewRecord & { findings: EvalAwareFinding[] })[] | undefined,
): Map<string, EvalAwareFinding> {
  const map = new Map<string, EvalAwareFinding>();
  for (const r of reviews ?? []) {
    for (const f of r.findings) map.set(f.id, f);
  }
  return map;
}

/** Fallback when a column finding has no matching persisted record yet (e.g.
 * findings_count already returned but `usePrReviews` hasn't refetched). */
export function toEvalAwareFinding(f: AgentColumnFindingView): EvalAwareFinding {
  return {
    id: f.id,
    severity: f.severity,
    // `AgentColumnFinding.category`/`.kind` are untyped strings on the wire
    // (see the vendored observability.ts comment: "subset of FindingRecord");
    // the full record (when it exists) carries the real union types.
    category: f.category as EvalAwareFinding["category"],
    title: f.title,
    file: f.file,
    start_line: f.start_line,
    end_line: f.end_line,
    rationale: f.rationale,
    suggestion: f.suggested_fix,
    confidence: f.confidence,
    kind: (f.kind ?? "finding") as EvalAwareFinding["kind"],
    trifecta_components: null,
    evidence: null,
    review_id: "",
    accepted_at: null,
    dismissed_at: null,
    eval_case_id: null,
  };
}
