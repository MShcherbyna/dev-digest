import type { MultiRunStatus } from '../schemas.js';

/** Minimal shape `run-status.ts` needs from a child row — kept local so this
 * stays a pure `domain/` file with no infrastructure import. */
export interface RunStatusChild {
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
  ranAt: Date | null;
  durationMs: number | null;
  costUsd: number | null;
  agentId: string | null;
  createdOrder: number;
}

/**
 * AC-2/AC-17/AC-19 — the parent's aggregate status, computed from its
 * children (Q-2). No stored `queued` parent status: all-queued maps to
 * `running`. Evaluated in order; the first matching branch wins.
 */
export function aggregateStatus(children: RunStatusChild[], cancelledAt: Date | null): MultiRunStatus {
  if (children.some((c) => c.status === 'queued' || c.status === 'running')) return 'running';
  if (children.length > 0 && children.every((c) => c.status === 'done')) return 'done';
  const hasDone = children.some((c) => c.status === 'done');
  const hasFailedOrCancelled = children.some((c) => c.status === 'failed' || c.status === 'cancelled');
  if (hasDone && hasFailedOrCancelled) return 'partial';
  const allCancelled = children.length > 0 && children.every((c) => c.status === 'cancelled');
  if (!hasDone && (cancelledAt !== null || allCancelled)) return 'cancelled';
  return 'failed';
}

/**
 * One child per `agent_id`, the newest by creation order (R4) — a retry's new
 * attempt supersedes the prior one for display purposes without a stored
 * "superseded" flag. Generic over any shape that satisfies `RunStatusChild`
 * so callers can pass their own richer row type and get it back unchanged
 * (e.g. the service passing `MultiRunChildRow[]` straight through, with no
 * lossy round-trip through the narrower shape).
 */
export function latestAttempts<T extends RunStatusChild>(children: T[]): T[] {
  const byAgent = new Map<string, T>();
  for (const child of children) {
    if (!child.agentId) continue;
    const current = byAgent.get(child.agentId);
    if (!current || child.createdOrder > current.createdOrder) byAgent.set(child.agentId, child);
  }
  return [...byAgent.values()];
}

/**
 * AC-16 — wall-clock total over the LATEST attempts: while running, now minus
 * the parent's `ran_at`; once every latest attempt has a `ran_at`, the max of
 * (child `ran_at` + `duration_ms`) minus the parent's `ran_at` — never the sum
 * of per-agent durations.
 */
export function wallClockMs<T extends RunStatusChild>(parentRanAt: Date, children: T[]): number {
  const latest = latestAttempts(children);
  const stillRunning = latest.some((c) => c.status === 'queued' || c.status === 'running');
  if (stillRunning) return Date.now() - parentRanAt.getTime();
  let maxEnd = parentRanAt.getTime();
  for (const c of latest) {
    if (!c.ranAt) continue;
    const end = c.ranAt.getTime() + (c.durationMs ?? 0);
    if (end > maxEnd) maxEnd = end;
  }
  return maxEnd - parentRanAt.getTime();
}

/** Sum of non-null `cost_usd` over the latest attempts. */
export function totalCost<T extends RunStatusChild>(children: T[]): number {
  return latestAttempts(children).reduce((sum, c) => sum + (c.costUsd ?? 0), 0);
}
