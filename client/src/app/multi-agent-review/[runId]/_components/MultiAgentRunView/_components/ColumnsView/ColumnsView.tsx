/* ColumnsView — S4: one AgentColumn per selected agent, scrolling horizontally. */
"use client";

import React from "react";
import type { AgentColumnView } from "@/lib/types";
import { AgentColumn } from "../AgentColumn";
import { similarMembers } from "../../helpers";
import { s } from "./styles";

export function ColumnsView({
  columns,
  onOpenTrace,
  onCancel,
  onRetry,
}: {
  columns: AgentColumnView[];
  onOpenTrace: (runId: string, agentName: string) => void;
  onCancel: (runId: string) => void;
  onRetry: (runId: string) => void;
}) {
  return (
    <div style={s.row}>
      {columns.map((col) => (
        <AgentColumn
          key={col.run_id}
          column={col}
          onOpenTrace={() => onOpenTrace(col.run_id, col.agent_name)}
          onCancel={() => onCancel(col.run_id)}
          onRetry={() => onRetry(col.run_id)}
          similarAgentNames={(findingId) => {
            const f = col.findings.find((x) => x.id === findingId);
            if (!f) return [];
            return similarMembers(f, columns).map((m) => m.agentName);
          }}
        />
      ))}
    </div>
  );
}
