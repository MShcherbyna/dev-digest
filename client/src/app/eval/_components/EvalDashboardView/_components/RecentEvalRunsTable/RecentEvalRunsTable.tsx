/* RecentEvalRunsTable — the latest finished runs across all agents (screenshot 3). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { RecentEvalRun } from "@/lib/hooks/eval";
import { METRIC_COLORS } from "../../../../_lib/constants";
import { fmtDateTime } from "../../../../_lib/format";
import { MetricBarCell } from "../../../MetricBarCell";
import { s } from "./styles";

export function RecentEvalRunsTable({ runs }: { runs: RecentEvalRun[] }) {
  const t = useTranslations("eval");
  if (runs.length === 0) return <div style={s.empty}>{t("allAgents.recentEmpty")}</div>;
  const noData = t("dashboard.noData");

  return (
    <div style={s.table} role="table" aria-label={t("allAgents.recentHeading")}>
      <div style={s.head} role="row">
        <span role="columnheader">{t("allAgents.tableAgent")}</span>
        <span role="columnheader">{t("allAgents.tableRanAt")}</span>
        <span role="columnheader">{t("allAgents.tableVersion")}</span>
        <span role="columnheader">{t("dashboard.table.recall")}</span>
        <span role="columnheader">{t("dashboard.table.precision")}</span>
        <span role="columnheader">{t("dashboard.table.citation")}</span>
        <span role="columnheader">{t("allAgents.tablePass")}</span>
      </div>
      {runs.map((r) => (
        <div key={r.id} style={s.row} role="row">
          <span style={s.agent} title={r.agent_name} role="cell">
            {r.agent_name}
          </span>
          <span className="mono tnum" style={s.date} role="cell">
            {fmtDateTime(r.started_at)}
          </span>
          <span className="mono" style={s.version} role="cell">
            v{r.agent_version}
          </span>
          <span role="cell">
            <MetricBarCell value={r.recall} color={METRIC_COLORS.recall} noDataLabel={noData} />
          </span>
          <span role="cell">
            <MetricBarCell value={r.precision} color={METRIC_COLORS.precision} noDataLabel={noData} />
          </span>
          <span role="cell">
            <MetricBarCell value={r.citation_accuracy} color={METRIC_COLORS.citation_accuracy} noDataLabel={noData} />
          </span>
          <span className="tnum" style={s.pass} role="cell">
            {r.cases_passed}/{r.cases_executed}
          </span>
        </div>
      ))}
    </div>
  );
}
