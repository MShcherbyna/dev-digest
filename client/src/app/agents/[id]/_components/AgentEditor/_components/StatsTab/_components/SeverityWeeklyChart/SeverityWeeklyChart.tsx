/* SeverityWeeklyChart — stacked weekly bars (Critical / Warning / Suggestion)
   with a legend underneath. No y-axis clutter. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { BarChart, Bar, XAxis, ResponsiveContainer } from "recharts";
import type { AgentUsageStats } from "@devdigest/shared";
import { CHART_HEIGHT, SEVERITY_SERIES, TICK_STYLE } from "./constants";
import { s } from "./styles";

export interface SeverityWeeklyChartProps {
  weeks: AgentUsageStats["severity_weekly"];
}

export function SeverityWeeklyChart({ weeks }: SeverityWeeklyChartProps) {
  const t = useTranslations("agents");
  return (
    <div>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <BarChart data={weeks as AgentUsageStats["severity_weekly"][number][]} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <XAxis dataKey="week" axisLine={false} tickLine={false} tick={TICK_STYLE} />
          {SEVERITY_SERIES.map(({ key, color }) => (
            <Bar key={key} dataKey={key} stackId="sev" fill={color} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <ul style={s.legend}>
        {SEVERITY_SERIES.map(({ key, color }) => (
          <li key={key} style={s.legendItem}>
            <span style={s.swatch(color)} />
            {t(`stats.severity.${key}`)}
          </li>
        ))}
      </ul>
    </div>
  );
}
