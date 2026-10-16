/* EvalMetricTiles — RECALL / PRECISION / CITATION ACCURACY of the latest finished run in range,
   with a decimal delta vs the previous one (screenshot 4: "82% ↑ 0.04"). The vendored MetricCard has
   no null semantics, so null renders a "—" string with an aria-label and no delta / sparkline. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { MetricCard } from "@devdigest/ui";
import type { AgentEvalDashboardResponse, EvalMetric } from "@/lib/hooks/eval";
import { METRIC_COLORS } from "../../../../_lib/constants";
import { NO_DATA } from "../../../../_lib/format";
import { sparkValues } from "./helpers";
import { s } from "./styles";

const METRICS: { key: EvalMetric; label: "recall" | "precision" | "citationAccuracy" }[] = [
  { key: "recall", label: "recall" },
  { key: "precision", label: "precision" },
  { key: "citation_accuracy", label: "citationAccuracy" },
];

export function EvalMetricTiles({ data }: { data: AgentEvalDashboardResponse }) {
  const t = useTranslations("eval.dashboard");
  const tAgent = useTranslations("eval.agentDashboard");
  const { current, delta, trend } = data;

  return (
    <div style={s.row}>
      {METRICS.map(({ key, label }) => {
        const value = current?.[key] ?? null;
        const d = value == null ? null : (delta?.[key] ?? null);
        return (
          <MetricCard
            key={key}
            label={t(`metrics.${label}`)}
            color={METRIC_COLORS[key]}
            trend={value == null ? undefined : sparkValues(trend, key)}
            delta={d ?? undefined}
            suffix={value == null ? undefined : "%"}
            value={
              value == null ? (
                <span aria-label={t("noData")}>{NO_DATA}</span>
              ) : (
                <>
                  {Math.round(value * 100)}
                  {d != null && d !== 0 && (
                    <span style={s.srOnly}>
                      {tAgent("delta", { direction: d > 0 ? t("up") : t("down"), amount: Math.abs(d).toFixed(2) })}
                    </span>
                  )}
                </>
              )
            }
          />
        );
      })}
    </div>
  );
}
