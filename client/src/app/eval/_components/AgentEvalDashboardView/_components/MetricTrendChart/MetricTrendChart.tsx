/* MetricTrendChart — recall / precision / citation over the finished runs in range.
   Own recharts chart: the vendored LineChart maps null to 0, which would draw a false drop. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { SectionLabel } from "@devdigest/ui";
import type { TrendPoint } from "@/lib/hooks/eval";
import { METRIC_COLORS } from "../../../../_lib/constants";
import { pct } from "../../../../_lib/format";
import { buildSeries, yDomain, yTicks } from "./helpers";
import { s } from "./styles";

const SERIES = [
  { key: "recall", legend: "recall" },
  { key: "precision", legend: "precision" },
  { key: "citation_accuracy", legend: "citation" },
] as const;

export function MetricTrendChart({ trend }: { trend: TrendPoint[] }) {
  const t = useTranslations("eval");
  const series = buildSeries(trend);
  const domain = yDomain(series);
  const latest = series[series.length - 1];

  return (
    <div>
      <div style={s.head}>
        <SectionLabel icon="TrendingUp">{t("dashboard.metricTrend")}</SectionLabel>
        <div style={s.legend}>
          {SERIES.map((x) => (
            <span key={x.key} style={s.legendItem}>
              <span style={s.swatch(METRIC_COLORS[x.key])} aria-hidden />
              {t(`dashboard.legend.${x.legend}`)}
            </span>
          ))}
        </div>
      </div>
      {series.length === 0 ? (
        <div style={s.empty}>{t("agentDashboard.metricTrendEmpty")}</div>
      ) : (
        <>
          <div style={s.plot} aria-hidden>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="run_id" hide />
                <YAxis
                  domain={domain}
                  ticks={yTicks(domain)}
                  tickFormatter={(v: number) => v.toFixed(1)}
                  stroke="var(--text-muted)"
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  width={36}
                />
                {SERIES.map((x) => (
                  <Line
                    key={x.key}
                    type="monotone"
                    dataKey={x.key}
                    stroke={METRIC_COLORS[x.key]}
                    strokeWidth={2}
                    dot={series.length === 1}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p style={s.srOnly}>
            {t("agentDashboard.trendSummary", {
              recall: pct(latest?.recall),
              precision: pct(latest?.precision),
              citation: pct(latest?.citation_accuracy),
            })}
          </p>
        </>
      )}
    </div>
  );
}
