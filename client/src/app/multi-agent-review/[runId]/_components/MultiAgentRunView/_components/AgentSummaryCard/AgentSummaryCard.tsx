/* AgentSummaryCard — the active agent's summary header in the Tabs view (S5). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { CircularScore } from "@devdigest/ui";
import { agentLook } from "@/lib/agent-look";
import { formatCost } from "@/lib/format";
import type { AgentColumnView } from "@/lib/types";

export function AgentSummaryCard({ column, onOpenTrace }: { column: AgentColumnView; onOpenTrace: () => void }) {
  const t = useTranslations("runs");
  const look = agentLook({ name: column.agent_name });
  const durationS = column.duration_ms != null ? (column.duration_ms / 1000).toFixed(1) + "s" : "—";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: 14,
        borderRadius: 10,
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
      }}
    >
      {column.status === "done" && column.score != null && <CircularScore score={column.score} size={44} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: look.color }}>{column.agent_name}</div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>
          {column.summary || t("tabs.noSummary")}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
        <button
          type="button"
          onClick={onOpenTrace}
          style={{ background: "none", border: "none", padding: 0, fontSize: 12.5, color: "var(--text-muted)", cursor: "pointer" }}
        >
          {t("viewTrace")}
        </button>
        <span className="mono" style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {durationS} · {formatCost(column.cost_usd)}
        </span>
      </div>
    </div>
  );
}
