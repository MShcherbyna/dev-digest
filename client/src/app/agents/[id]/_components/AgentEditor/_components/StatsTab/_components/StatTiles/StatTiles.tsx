/* StatTiles — the four headline tiles: total runs (+ sparkline), avg cost per
   run (+ delta chip), avg duration, accept rate (+ ring). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { LineChart, Line } from "recharts";
import { CircularScore } from "@devdigest/ui";
import type { AgentUsageStats } from "@devdigest/shared";
import { formatPct } from "@/lib/skill-format";
import { formatCost, formatCostDelta, formatDuration } from "../../helpers";
import { RING_SIZE, SPARKLINE_HEIGHT, SPARKLINE_WIDTH } from "./constants";
import { s } from "./styles";

export type StatTilesProps = Pick<
  AgentUsageStats,
  "runs_30d" | "runs_trend" | "avg_cost_usd" | "cost_delta_usd" | "avg_duration_ms" | "accept_pct"
>;

function Tile({ label, aside, children }: { label: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={s.tile}>
      <div style={s.tileHead}>
        <div style={s.tileLabel}>{label}</div>
        {aside}
      </div>
      <div style={s.tileValueRow}>{children}</div>
    </div>
  );
}

export function StatTiles({
  runs_30d,
  runs_trend,
  avg_cost_usd,
  cost_delta_usd,
  avg_duration_ms,
  accept_pct,
}: StatTilesProps) {
  const t = useTranslations("agents");
  const delta = formatCostDelta(cost_delta_usd);
  const trend = runs_trend.map((runs, i) => ({ i, runs }));

  return (
    <div style={s.tiles}>
      <Tile label={t("stats.runs")}>
        <span className="tnum" style={s.tileValue}>
          {runs_30d}
        </span>
        {trend.length > 1 && (
          <LineChart width={SPARKLINE_WIDTH} height={SPARKLINE_HEIGHT} data={trend} aria-hidden>
            <Line
              type="monotone"
              dataKey="runs"
              stroke="var(--accent)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        )}
      </Tile>

      <Tile label={t("stats.avgCost")}>
        <span className="tnum" style={s.tileValue}>
          {formatCost(avg_cost_usd)}
        </span>
        {delta && cost_delta_usd != null && (
          <span
            className="mono tnum"
            style={s.delta(cost_delta_usd > 0)}
            title={t(cost_delta_usd > 0 ? "stats.costUp" : "stats.costDown", {
              amount: formatCost(cost_delta_usd),
            })}
          >
            {delta}
          </span>
        )}
      </Tile>

      <Tile label={t("stats.avgDuration")}>
        <span className="tnum" style={s.tileValue}>
          {formatDuration(avg_duration_ms)}
        </span>
      </Tile>

      <Tile
        label={t("stats.accept")}
        aside={accept_pct != null && <CircularScore score={accept_pct} size={RING_SIZE} />}
      >
        <span className="tnum" style={s.tileValue}>
          {formatPct(accept_pct)}
        </span>
      </Tile>
    </div>
  );
}
