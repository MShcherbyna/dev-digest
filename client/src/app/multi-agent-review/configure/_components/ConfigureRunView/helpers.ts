import type { ReviewRecord } from "@devdigest/shared";
import type { Agent } from "@devdigest/shared";

/** This agent's latest review summary on the PR, falling back to the agent's
 * description when it hasn't reviewed this PR yet. */
export function agentCardSummary(agent: Agent, reviews: ReviewRecord[] | undefined): string {
  const latest = (reviews ?? [])
    .filter((r) => r.agent_id === agent.id)
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))[0];
  return latest?.summary || agent.description || "";
}
