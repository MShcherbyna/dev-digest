/* AgentCard — one selectable agent in step 2 of Configure run (S3). */
"use client";

import React from "react";
import { Checkbox, Icon } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { agentLook } from "@/lib/agent-look";
import { formatEstimate, type Estimate } from "@/lib/multi-agent-estimate";
import { s } from "./styles";

export function AgentCard({
  agent,
  checked,
  disabled,
  estimate,
  noEstimateLabel,
  summary,
  onToggle,
}: {
  agent: Agent;
  checked: boolean;
  /** At the 8-agent cap and not yet checked. */
  disabled?: boolean;
  estimate: Estimate | null;
  noEstimateLabel: string;
  summary: string;
  onToggle: () => void;
}) {
  const look = agentLook(agent);
  const Icn = Icon[look.icon];
  return (
    <div
      role="button"
      tabIndex={0}
      aria-disabled={disabled}
      onClick={() => !disabled && onToggle()}
      onKeyDown={(e) => {
        if (!disabled && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onToggle();
        }
      }}
      style={{ ...s.card(checked, look.color), opacity: disabled ? 0.5 : 1 }}
    >
      {/* Stop the click from also bubbling to the card's own onClick above —
          the Checkbox's internal button already fires onChange for it, so
          without this a click directly on the checkbox toggles twice (net
          no-op). */}
      <span onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={checked}
          onChange={() => !disabled && onToggle()}
          label={
            <span style={s.srOnly}>
              {agent.name} {estimate ? formatEstimate(estimate) : noEstimateLabel}
            </span>
          }
        />
      </span>
      <div style={s.iconTile(look.color)}>
        <Icn size={16} />
      </div>
      <div style={s.body}>
        <div style={s.headRow}>
          <span style={s.name}>{agent.name}</span>
          <span className="mono" style={s.estimate}>{estimate ? formatEstimate(estimate) : noEstimateLabel}</span>
        </div>
        <div style={s.summary}>{summary}</div>
      </div>
    </div>
  );
}
