import type { Agent, AgentUsageStats, AgentVersion, CiFailOn, Provider, ReviewStrategy } from '@devdigest/shared';
import { AgentVersionConfig } from '@devdigest/shared';
import type {
  AgentFindingStatRow,
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

/** Mean of the non-null costs, or null when no run has a recorded cost. */
export function avgCost(runs: Pick<AgentRunStatRow, 'costUsd'>[]): number | null {
  const costs = runs.map((r) => r.costUsd).filter((c): c is number => c !== null);
  if (costs.length === 0) return null;
  return costs.reduce((sum, c) => sum + c, 0) / costs.length;
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

/** Assemble the Stats-tab DTO from already-loaded runs, findings and skill links. */
export function buildAgentStats(
  runs: AgentRunStatRow[],
  findings: AgentFindingStatRow[],
  links: LinkedSkillRow[],
): AgentUsageStats {
  return {
    runs_30d: runs.length,
    accept_pct: pct(findings.filter((f) => f.accepted).length, findings.length),
    avg_cost_usd: avgCost(runs),
    findings_30d: findings.length,
    skills: links.map((l) => ({
      id: l.skill.id,
      name: l.skill.name,
      enabled: l.skill.enabled && l.enabled,
    })),
    by_category: countByCategory(findings),
  };
}
