/* multi-agent-estimate.ts — pure estimate math shared by the picker (PR page)
   and the Configure run screen (two consumers → promoted to src/lib/, per
   react-frontend-architecture). No React, no fetch. */

import type { AgentUsageStats } from "@devdigest/shared";

/** The implementation plan's cap on how many agents one multi-run may target. */
export const MAX_AGENTS = 8;

export interface Estimate {
  ms: number;
  usd: number;
}

/** One agent's per-run estimate from its last-30-days stats, or `null` when
 * there isn't enough history to estimate from (AC-11 "no estimate yet"). */
export function agentEstimate(stats: AgentUsageStats | null | undefined): Estimate | null {
  if (!stats) return null;
  if (stats.runs_30d === 0) return null;
  if (stats.avg_duration_ms == null || stats.avg_cost_usd == null) return null;
  return { ms: stats.avg_duration_ms, usd: stats.avg_cost_usd };
}

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatUsd(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

/** `8.2s · $0.06` (AC-11). */
export function formatEstimate(e: Estimate): string {
  return `${formatSeconds(e.ms)} · ${formatUsd(e.usd)}`;
}

export interface CombinedEstimate {
  /** Parallel fan-out: wall clock is bounded by the slowest agent with an estimate. */
  maxMs: number;
  /** Cost is additive across every agent that has an estimate. */
  sumUsd: number;
  /** Count of selected agents with no estimate (excluded from maxMs/sumUsd). */
  missing: number;
}

/** Combine several agents' estimates for the "Run multi-agent review" button's
 * muted summary line (AC-12). */
export function combineEstimates(estimates: (Estimate | null)[]): CombinedEstimate {
  let maxMs = 0;
  let sumUsd = 0;
  let missing = 0;
  for (const e of estimates) {
    if (!e) {
      missing += 1;
      continue;
    }
    maxMs = Math.max(maxMs, e.ms);
    sumUsd += e.usd;
  }
  return { maxMs, sumUsd, missing };
}

/** Render a `CombinedEstimate` as the mono summary line under the run button.
 * Full form (`≈ 8.2s · $0.15`) when every selected agent has history; a
 * partial form (`≥ $0.20 · 1 without history`) when at least one doesn't,
 * since the true wall-clock/cost floor is a lower bound in that case. */
export function formatCombinedEstimate(c: CombinedEstimate): string {
  if (c.missing === 0) return `≈ ${formatSeconds(c.maxMs)} · ${formatUsd(c.sumUsd)}`;
  const withoutHistory = `${c.missing} without history`;
  if (c.maxMs === 0 && c.sumUsd === 0) return withoutHistory;
  return `≥ ${formatUsd(c.sumUsd)} · ${withoutHistory}`;
}

/** Default picker/configure selection (AC-10): every currently-enabled agent
 * id, unless the repo has a prior multi-run selection — then that selection,
 * filtered to ids that are still enabled (the server already filters
 * `last-selection`, but a stale client cache could still include a since-
 * disabled agent). */
export function defaultSelection(enabledIds: string[], last: string[] | null | undefined): string[] {
  if (last && last.length > 0) {
    const enabledSet = new Set(enabledIds);
    const filtered = last.filter((id) => enabledSet.has(id));
    if (filtered.length > 0) return filtered.slice(0, MAX_AGENTS);
  }
  return enabledIds.slice(0, MAX_AGENTS);
}
