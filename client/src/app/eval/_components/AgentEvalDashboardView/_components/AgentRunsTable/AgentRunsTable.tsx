/* AgentRunsTable — every run in range, newest first, with selection for Compare (screenshot 4). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Checkbox, SectionLabel } from "@devdigest/ui";
import type { EvalAgentRun } from "@/lib/hooks/eval";
import { METRIC_COLORS } from "../../../../_lib/constants";
import { fmtDateTime, usd } from "../../../../_lib/format";
import { MetricBarCell } from "../../../MetricBarCell";
import { COMPARE_SIZE, RUNS_PAGE_SIZE } from "../../constants";
import { isSelectable, toggleSelection } from "../../helpers";
import { COLUMNS, s } from "./styles";

export function AgentRunsTable({
  runs,
  selected,
  onSelectedChange,
  onCompare,
  comparing,
}: {
  runs: EvalAgentRun[];
  selected: string[];
  onSelectedChange: (ids: string[]) => void;
  onCompare: () => void;
  comparing: boolean;
}) {
  const t = useTranslations("eval");
  const [limit, setLimit] = React.useState(RUNS_PAGE_SIZE);
  const [blocked, setBlocked] = React.useState(false);
  const noData = t("dashboard.noData");

  const onToggle = (id: string) => {
    const next = toggleSelection(selected, id);
    setBlocked(next.blocked);
    if (!next.blocked) onSelectedChange(next.selected);
  };

  return (
    <div>
      <div style={s.head}>
        <SectionLabel icon="History">{t("agentDashboard.runs.heading")}</SectionLabel>
        {selected.length > 0 && (
          <span style={{ ...s.selected, marginBottom: 14 }}>{t("agentDashboard.runs.selected", { count: selected.length })}</span>
        )}
        {blocked && (
          <span role="status" style={{ ...s.hint, marginBottom: 14 }}>
            {t("agentDashboard.runs.compareHint")}
          </span>
        )}
        <div style={{ ...s.compare, marginBottom: 14 }}>
          <Button kind="primary" icon="GitMerge" onClick={onCompare} disabled={selected.length !== COMPARE_SIZE} loading={comparing}>
            {t("agentDashboard.runs.compare")}
          </Button>
        </div>
      </div>

      <div style={s.table} role="table" aria-label={t("agentDashboard.runs.heading")}>
        <div style={{ ...s.header, gridTemplateColumns: COLUMNS }} role="row">
          <span aria-hidden />
          <span role="columnheader">{t("agentDashboard.runs.colRanAt")}</span>
          <span role="columnheader">{t("agentDashboard.runs.colVersion")}</span>
          <span role="columnheader">{t("dashboard.table.recall")}</span>
          <span role="columnheader">{t("dashboard.table.precision")}</span>
          <span role="columnheader">{t("dashboard.table.citation")}</span>
          <span role="columnheader">{t("agentDashboard.runs.colPass")}</span>
          <span role="columnheader">{t("agentDashboard.runs.colCost")}</span>
        </div>
        {runs.slice(0, limit).map((r) => {
          const isSel = selected.includes(r.id);
          const date = fmtDateTime(r.started_at);
          return (
            <div key={r.id} style={s.row(isSel)} role="row">
              <span role="cell">
                {isSelectable(r) && (
                  <Checkbox
                    checked={isSel}
                    onChange={() => onToggle(r.id)}
                    label={<span style={s.srOnly}>{t("agentDashboard.runs.select", { version: r.agent_version, date })}</span>}
                  />
                )}
              </span>
              <span className="mono tnum" style={s.date} role="cell">
                {date}
              </span>
              <span className="mono" style={s.version} role="cell">
                v{r.agent_version}
                {r.status === "partial" && <span style={s.tag}>{t("agentDashboard.runs.partial")}</span>}
              </span>
              {r.status === "running" ? (
                <span style={{ ...s.wide, ...s.running }} role="cell">
                  {t("agentDashboard.runs.runningProgress", { done: r.cases_executed + r.cases_errored, total: r.cases_total })}
                </span>
              ) : r.status === "failed" ? (
                <span
                  style={{ ...s.wide, ...s.failed }}
                  role="cell"
                  title={r.reason && t.has(`agentDashboard.runs.failedReasons.${r.reason}`) ? t(`agentDashboard.runs.failedReasons.${r.reason}`) : (r.reason ?? undefined)}
                >
                  {t("agentDashboard.runs.failed")}
                </span>
              ) : (
                <>
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
                  <span className="mono tnum" style={s.cost} role="cell">
                    {usd(r.cost_usd)}
                  </span>
                </>
              )}
            </div>
          );
        })}
        {runs.length > limit && (
          <div style={s.more}>
            <Button size="sm" onClick={() => setLimit((n) => n + RUNS_PAGE_SIZE)}>
              {t("agentDashboard.runs.showMore")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
