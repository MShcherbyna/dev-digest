/* agent-look.ts — keyword → icon/color lookup for an agent's visual identity
   on the Configure run cards and the Multi-Agent Review results columns/tabs
   (the `Agent` contract itself has no icon/color field). Mirrors the
   `RISK_KINDS` precedent in
   `app/repos/[repoId]/pulls/[number]/_components/IntentCard/constants.ts`.
   Two consumers (ConfigureRunView, MultiAgentRunView) → promoted to
   src/lib/, per react-frontend-architecture. */

import type { IconName } from "@devdigest/ui";

export interface AgentLook {
  icon: IconName;
  color: string;
}

const AGENT_LOOK_KINDS: { test: RegExp; icon: IconName; color: string }[] = [
  { test: /security/i, icon: "Shield", color: "var(--crit)" },
  { test: /performance/i, icon: "Zap", color: "var(--warn)" },
  { test: /mentor/i, icon: "Lightbulb", color: "var(--accent)" },
  { test: /customer/i, icon: "Users", color: "#a78bfa" },
  { test: /architect/i, icon: "Boxes", color: "var(--ok)" },
];

const AGENT_LOOK_FALLBACK: AgentLook = { icon: "Cpu", color: "var(--text-muted)" };

/** Pick an icon + tint from the agent's name, matching S3-S5. Falls back to a
 * neutral Cpu icon for any agent name that doesn't match a known keyword. */
export function agentLook(agent: { name: string } | null | undefined): AgentLook {
  if (!agent?.name) return AGENT_LOOK_FALLBACK;
  const hit = AGENT_LOOK_KINDS.find((k) => k.test.test(agent.name));
  return hit ? { icon: hit.icon, color: hit.color } : AGENT_LOOK_FALLBACK;
}
