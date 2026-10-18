import type { Agent } from "@devdigest/shared";
import type { AgentUsageStats } from "@devdigest/shared";
import { agentEstimate, combineEstimates, type Estimate } from "@/lib/multi-agent-estimate";

/** Per-agent estimate map keyed by agent id, built from the stats-query results. */
export function estimatesFor(
  agentIds: string[],
  statsById: Record<string, AgentUsageStats | null>,
): Record<string, Estimate | null> {
  const out: Record<string, Estimate | null> = {};
  for (const id of agentIds) out[id] = agentEstimate(statsById[id]);
  return out;
}

export function combinedFor(selected: string[], estimates: Record<string, Estimate | null>) {
  return combineEstimates(selected.map((id) => estimates[id] ?? null));
}

/** Only enabled agents are ever offered in the picker (AC-7). */
export function enabledAgents(agents: Agent[] | undefined): Agent[] {
  return (agents ?? []).filter((a) => a.enabled);
}
