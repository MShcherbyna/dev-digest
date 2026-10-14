/* AgentEvalCard — one agent on the all-agents dashboard; the whole card links to its dashboard. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { AgentEvalCard as AgentEvalCardData } from "@/lib/hooks/eval";
import { fmtDateTime, NO_DATA, pct } from "../../../../_lib/format";
import { SafeSparkline } from "../../../SafeSparkline";
import { METRIC_COLORS } from "../../../../_lib/constants";
import { s } from "./styles";

export function AgentEvalCard({ agent }: { agent: AgentEvalCardData }) {
  const t = useTranslations("eval.allAgents");
  const last = agent.last_run;
  const metrics = [
    { key: "recall", label: t("recall"), value: agent.latest.recall, color: METRIC_COLORS.recall },
    { key: "precision", label: t("precision"), value: agent.latest.precision, color: METRIC_COLORS.precision },
    { key: "citation_accuracy", label: t("citation"), value: agent.latest.citation_accuracy, color: METRIC_COLORS.citation_accuracy },
  ] as const;

  return (
    <Link href={`/eval/${agent.id}`} style={s.card} aria-label={t("openAgent", { name: agent.name })}>
      <div style={s.icon} aria-hidden>
        <Icon.Cpu size={20} />
      </div>
      <div style={s.text}>
        <div style={s.nameRow}>
          <span style={s.name} title={agent.name}>
            {agent.name}
          </span>
          <span className="mono" style={s.model}>
            {agent.model}
          </span>
        </div>
        <div style={s.last}>
          {last
            ? t("lastRun", {
                version: last.agent_version,
                date: fmtDateTime(last.started_at),
                passed: last.cases_passed,
                total: last.cases_executed,
              })
            : t("neverRun")}
        </div>
      </div>
      <SafeSparkline data={agent.recall_trend} color="var(--accent-text)" />
      <div style={s.metrics}>
        {metrics.map((m) => (
          <div key={m.key} style={s.metric}>
            <span style={s.metricLabel}>{m.label}</span>
            <span style={s.metricValue(m.value == null ? "var(--text-muted)" : m.color)}>
              {m.value == null ? NO_DATA : pct(m.value)}
            </span>
          </div>
        ))}
      </div>
      <Icon.ChevronRight size={16} style={s.chevron} aria-hidden />
    </Link>
  );
}
