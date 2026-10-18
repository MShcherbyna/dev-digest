/* AgentColumn — one agent's column in the Columns view (S4). Shows a compact
   live log while `running` (AC-28), a Cancel/Retry footer action depending on
   status (AC-19), and opens the shared RunTraceDrawer for its own run (AC-28a). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, CircularScore, Icon, LiveLogStream } from "@devdigest/ui";
import { agentLook } from "@/lib/agent-look";
import { formatCost } from "@/lib/format";
import { useRunEvents } from "@/lib/hooks/reviews";
import type { AgentColumnView } from "@/lib/types";
import { lineLabel, severityColor, statusColor } from "./helpers";
import { s } from "./styles";

export function AgentColumn({
  column,
  onOpenTrace,
  onCancel,
  onRetry,
  similarAgentNames,
}: {
  column: AgentColumnView;
  onOpenTrace: () => void;
  onCancel: () => void;
  onRetry: () => void;
  /** finding id -> other agents' names that flagged the same group (AC-22). */
  similarAgentNames: (findingId: string) => string[];
}) {
  const t = useTranslations("runs");
  const look = agentLook({ name: column.agent_name });
  const Icn = Icon[look.icon];
  const live = useRunEvents(column.status === "running" ? [column.run_id] : []);
  const log = live.events.map((e) => ({ t: e.t, k: e.kind, m: e.msg }));

  const durationS = column.duration_ms != null ? (column.duration_ms / 1000).toFixed(1) + "s" : "—";

  return (
    <div style={s.col(look.color)}>
      <div style={s.head}>
        <div style={s.iconTile(look.color)}>
          <Icn size={15} />
        </div>
        <div style={s.headText}>
          <div style={s.name}>{column.agent_name}</div>
          <div className="mono" style={s.sub}>
            {durationS} · {formatCost(column.cost_usd)}
          </div>
        </div>
        {column.status === "done" && column.score != null ? (
          <CircularScore score={column.score} size={30} stroke={3} />
        ) : (
          <Badge color={statusColor(column.status)} bg="var(--bg-hover)">
            {t(`column.statusChip.${column.status as "queued" | "running" | "failed" | "cancelled"}`)}
          </Badge>
        )}
      </div>

      {column.status === "running" ? (
        <LiveLogStream log={log} running height={120} />
      ) : column.findings.length === 0 ? (
        <div style={s.empty}>{t("column.noFindings")}</div>
      ) : (
        <div style={s.findingsList}>
          {column.findings.map((f) => {
            const others = similarAgentNames(f.id);
            return (
              <div key={f.id} style={s.findingCard(severityColor(f.severity))}>
                <div style={s.findingTitle} title={f.title}>
                  {f.title}
                </div>
                <div className="mono" style={s.findingMeta}>
                  {lineLabel(f)}
                </div>
                {others.length > 0 && (
                  <div style={s.alsoFlagged}>{t("column.alsoFlaggedBy", { agents: others.join(", ") })}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={s.footer}>
        <button type="button" style={s.footerLink} onClick={onOpenTrace}>
          {t("viewTrace")}
        </button>
        {column.status === "failed" ? (
          <button type="button" style={s.footerLink} onClick={onRetry}>
            {t("column.retry")}
          </button>
        ) : column.status === "queued" || column.status === "running" ? (
          <button type="button" style={s.footerLink} onClick={onCancel}>
            {t("column.cancel")}
          </button>
        ) : (
          <span style={s.footerCount}>{t("column.findingsCount", { count: column.findings.length })}</span>
        )}
      </div>
    </div>
  );
}
