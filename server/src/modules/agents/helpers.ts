import type { Agent, AgentUsageStats, AgentVersion, CiFailOn, Provider, ReviewStrategy } from '@devdigest/shared';
import { AgentVersionConfig } from '@devdigest/shared';
import {
  DAY_MS,
  MEMORY_USAGE_LIMIT,
  RECENT_RUNS_LIMIT,
  SEVERITY_WEEKS,
  STATS_WINDOW_DAYS,
} from './constants.js';
import type {
  AgentFindingStatRow,
  AgentRecentRunRow,
  AgentRow,
  AgentRunStatRow,
  AgentVersionRow,
  LinkedSkillRow,
} from './repository.js';

/**
 * Pure helpers for the agents module — DB row ⇄ DTO mapping and the
 * config-version-bump rule. No I/O; behaviour-identical to the previous inline
 * implementations.
 */

/** Map a persisted agent row to the public `Agent` DTO. */
export function toAgentDto(row: AgentRow): Agent {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    provider: row.provider as Provider,
    model: row.model,
    system_prompt: row.systemPrompt,
    output_schema: row.outputSchema ?? null,
    enabled: row.enabled,
    version: row.version,
    strategy: row.strategy as ReviewStrategy,
    ci_fail_on: row.ciFailOn as CiFailOn,
    repo_intel: row.repoIntel,
  };
}

/**
 * Map a persisted `agent_versions` row to the public `AgentVersion` DTO. The
 * stored `config_json` is untyped jsonb (a snapshot from an older config shape
 * could drift), so it is parsed through `AgentVersionConfig` — a malformed
 * snapshot throws here rather than leaking an unvalidated blob to the client.
 */
export function toAgentVersionDto(row: AgentVersionRow): AgentVersion {
  return {
    agent_id: row.agentId,
    version: row.version,
    config: AgentVersionConfig.parse(row.configJson),
    created_at: row.createdAt.toISOString(),
  };
}

/** Fields whose change bumps the agent's config version (anything but `enabled`). */
export interface ConfigChangePatch {
  name?: string;
  description?: string;
  provider?: Provider;
  model?: string;
  systemPrompt?: string;
  outputSchema?: unknown;
  strategy?: ReviewStrategy;
  ciFailOn?: CiFailOn;
  repoIntel?: boolean;
}

/**
 * True when a patch changes config (vs. just toggling `enabled`) relative to the
 * existing row — a config change bumps the version and snapshots agent_versions.
 */
export function isConfigChange(
  existing: Pick<
    AgentRow,
    | 'name'
    | 'description'
    | 'provider'
    | 'model'
    | 'systemPrompt'
    | 'strategy'
    | 'ciFailOn'
    | 'repoIntel'
  >,
  patch: ConfigChangePatch,
): boolean {
  return (
    (patch.name !== undefined && patch.name !== existing.name) ||
    (patch.description !== undefined && patch.description !== existing.description) ||
    (patch.provider !== undefined && patch.provider !== existing.provider) ||
    (patch.model !== undefined && patch.model !== existing.model) ||
    (patch.systemPrompt !== undefined && patch.systemPrompt !== existing.systemPrompt) ||
    (patch.strategy !== undefined && patch.strategy !== existing.strategy) ||
    (patch.ciFailOn !== undefined && patch.ciFailOn !== existing.ciFailOn) ||
    (patch.repoIntel !== undefined && patch.repoIntel !== existing.repoIntel) ||
    patch.outputSchema !== undefined
  );
}

/** Percentage rounded to one decimal, or null when the denominator is 0. */
export function pct(part: number, total: number): number | null {
  if (total === 0) return null;
  return Math.round((part / total) * 1000) / 10;
}

const WEEK_MS = 7 * DAY_MS;

/** Mean of the non-null values, or null when there are none. */
function meanOfNonNull(values: (number | null)[]): number | null {
  const xs = values.filter((v): v is number => v !== null);
  if (xs.length === 0) return null;
  return xs.reduce((sum, v) => sum + v, 0) / xs.length;
}

/** Mean of the non-null costs, or null when no run has a recorded cost. */
export function avgCost(runs: Pick<AgentRunStatRow, 'costUsd'>[]): number | null {
  return meanOfNonNull(runs.map((r) => r.costUsd));
}

/** Mean of the non-null durations, or null when no run has one. */
export function avgDuration(runs: Pick<AgentRunStatRow, 'durationMs'>[]): number | null {
  return meanOfNonNull(runs.map((r) => r.durationMs));
}

/** Current avg cost minus previous avg cost; null if either window has no cost data. */
export function costDelta(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  return current - previous;
}

/**
 * Runs per day for the last `days` days, oldest → newest, zeros included. Days
 * are consecutive 24h buckets ending at `now`, so the sum equals the number of
 * runs inside the window.
 */
export function dailyTrend(
  runs: Pick<AgentRunStatRow, 'ranAt'>[],
  now: Date,
  days: number = STATS_WINDOW_DAYS,
): number[] {
  const trend = new Array<number>(days).fill(0);
  for (const r of runs) {
    const age = Math.floor((now.getTime() - r.ranAt.getTime()) / DAY_MS);
    if (age >= days) continue;
    trend[days - 1 - Math.max(age, 0)]! += 1;
  }
  return trend;
}

/**
 * Findings per severity for the last `weeks` 7-day buckets (w1 oldest … wN =
 * the 7 days ending `now`), bucketed by the owning run's `ranAt`. Zeros included.
 */
export function weeklySeverity(
  findings: Pick<AgentFindingStatRow, 'runId' | 'severity'>[],
  runAt: Map<string, Date>,
  now: Date,
  weeks: number = SEVERITY_WEEKS,
): AgentUsageStats['severity_weekly'] {
  const out = Array.from({ length: weeks }, (_, i) => ({
    week: `w${i + 1}`,
    CRITICAL: 0,
    WARNING: 0,
    SUGGESTION: 0,
  }));
  for (const f of findings) {
    const at = runAt.get(f.runId);
    if (!at) continue;
    const age = Math.floor((now.getTime() - at.getTime()) / WEEK_MS);
    if (age >= weeks) continue;
    const bucket = out[weeks - 1 - Math.max(age, 0)]!;
    if (f.severity === 'CRITICAL' || f.severity === 'WARNING' || f.severity === 'SUGGESTION') {
      bucket[f.severity] += 1;
    }
  }
  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** True when the assembled skills text has a whole-line `### <name>` header. */
export function includesSkillBlock(skillsText: string | null | undefined, name: string): boolean {
  if (!skillsText) return false;
  return new RegExp(`(^|\\n)### ${escapeRegExp(name)}[ \\t]*(\\r?\\n|$)`).test(skillsText);
}

/** Per linked skill: % of runs that included it. Sorted by pct desc, then name. */
export function skillUsage(
  runs: Pick<AgentRunStatRow, 'skillsText'>[],
  links: LinkedSkillRow[],
): AgentUsageStats['skill_usage'] {
  return links
    .map((l) => ({
      id: l.skill.id,
      name: l.skill.name,
      enabled: l.skill.enabled && l.enabled,
      pct:
        pct(runs.filter((r) => includesSkillBlock(r.skillsText, l.skill.name)).length, runs.length) ??
        0,
    }))
    .sort((a, b) => b.pct - a.pct || a.name.localeCompare(b.name));
}

/** Top memory items by the share of runs that pulled them (label = the item text). */
export function memoryUsage(
  runs: Pick<AgentRunStatRow, 'memoryPulled'>[],
  limit: number = MEMORY_USAGE_LIMIT,
): AgentUsageStats['memory_usage'] {
  const runsPulling = new Map<string, number>();
  for (const r of runs) {
    if (!Array.isArray(r.memoryPulled)) continue;
    const texts = new Set<string>();
    for (const m of r.memoryPulled) {
      const text = (m as { text?: unknown } | null)?.text;
      if (typeof text === 'string' && text !== '') texts.add(text);
    }
    for (const text of texts) runsPulling.set(text, (runsPulling.get(text) ?? 0) + 1);
  }
  return [...runsPulling.entries()]
    .map(([label, n]) => ({ label, pct: pct(n, runs.length) ?? 0 }))
    .sort((a, b) => b.pct - a.pct || a.label.localeCompare(b.label))
    .slice(0, limit);
}

/** Category counts sorted by count desc (ties by category asc, for stable output). */
export function countByCategory(
  findings: Pick<AgentFindingStatRow, 'category'>[],
): AgentUsageStats['by_category'] {
  const counts = new Map<string, number>();
  for (const f of findings) counts.set(f.category, (counts.get(f.category) ?? 0) + 1);
  return [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
}

/** Map latest-run rows to the public recent-runs DTO (newest first, capped). */
export function toRecentRuns(
  latest: AgentRecentRunRow[],
  findingCounts: Map<string, number>,
): AgentUsageStats['recent_runs'] {
  return latest.slice(0, RECENT_RUNS_LIMIT).map((r) => ({
    run_id: r.runId,
    ran_at: r.ranAt.toISOString(),
    pr_number: r.prNumber,
    repo_id: r.repoId,
    tokens:
      r.tokensIn === null && r.tokensOut === null ? null : (r.tokensIn ?? 0) + (r.tokensOut ?? 0),
    cost_usd: r.costUsd,
    findings: findingCounts.get(r.runId) ?? 0,
    source: r.source,
  }));
}

export interface AgentStatsInput {
  now: Date;
  /** Done runs from (at least) the last max(30d, severity weeks) days. */
  runs: AgentRunStatRow[];
  /** Findings of those runs. */
  findings: AgentFindingStatRow[];
  links: LinkedSkillRow[];
  /** Avg cost of the previous 30-day window (null = no cost data). */
  prevAvgCost: number | null;
  latest: AgentRecentRunRow[];
  findingCounts: Map<string, number>;
}

/** Assemble the Stats-tab DTO from already-loaded rows. Pure. */
export function buildAgentStats(input: AgentStatsInput): AgentUsageStats {
  const { now, links } = input;
  const windowMs = STATS_WINDOW_DAYS * DAY_MS;
  const runs = input.runs.filter((r) => now.getTime() - r.ranAt.getTime() < windowMs);
  const windowIds = new Set(runs.map((r) => r.runId));
  const findings = input.findings.filter((f) => windowIds.has(f.runId));
  const avg = avgCost(runs);
  return {
    runs_30d: runs.length,
    runs_trend: dailyTrend(runs, now),
    accept_pct: pct(findings.filter((f) => f.accepted).length, findings.length),
    avg_cost_usd: avg,
    cost_delta_usd: costDelta(avg, input.prevAvgCost),
    avg_duration_ms: avgDuration(runs),
    findings_30d: findings.length,
    skill_usage: skillUsage(runs, links),
    memory_usage: memoryUsage(runs),
    severity_weekly: weeklySeverity(
      input.findings,
      new Map(input.runs.map((r) => [r.runId, r.ranAt])),
      now,
    ),
    by_category: countByCategory(findings),
    recent_runs: toRecentRuns(input.latest, input.findingCounts),
  };
}
