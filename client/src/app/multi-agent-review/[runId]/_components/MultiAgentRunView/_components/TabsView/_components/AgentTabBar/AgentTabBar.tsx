/* AgentTabBar — the Tabs-view agent tab strip. A local component instead of
   the vendored `Tabs`: the design colors each tab's score by severity
   threshold (TabDef.count is fixed muted-gray there), and horizontally
   scrolls its own row instead of letting many agents clip past the page
   edge (vendored `Tabs` has neither). */
"use client";

import React from "react";
import { Icon } from "@devdigest/ui";
import { agentLook } from "@/lib/agent-look";
import type { AgentColumnView } from "@/lib/types";
import { scoreColor } from "./helpers";
import { s } from "./styles";

export function AgentTabBar({
  columns,
  active,
  onChange,
}: {
  columns: AgentColumnView[];
  active: string;
  onChange: (runId: string) => void;
}) {
  return (
    <div style={s.row}>
      {columns.map((c) => {
        const look = agentLook({ name: c.agent_name });
        const Icn = Icon[look.icon];
        const on = c.run_id === active;
        const showScore = c.status === "done" && c.score != null;
        return (
          <button key={c.run_id} type="button" style={s.tab(on)} onClick={() => onChange(c.run_id)}>
            <Icn size={14} style={{ color: on ? look.color : "var(--text-muted)" }} />
            <span>{c.agent_name}</span>
            {showScore && (
              <span className="tnum" style={s.score(scoreColor(c.score!))}>
                {" "}
                {c.score}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
