/* CompareTiles — RECALL / PRECISION / CITATION / COST as "A → B" with a delta (screenshot 5).
   null on either side shows "—" and no delta. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { CompareResponse } from "@/lib/hooks/eval";
import { METRIC_COLORS } from "../../../../../../_lib/constants";
import { NO_DATA, pct, points } from "../../../../../../_lib/format";
import { s } from "./styles";

interface Tile {
  key: string;
  label: string;
  color: string;
  before: string;
  after: string;
  /** Signed numeric delta, or null when either side has no data. */
  delta: number | null;
  /** Delta as shown: "4pt" for metrics, "0.02" for cost. */
  shown: string;
}

function buildTiles(c: CompareResponse, t: (k: string, v?: Record<string, string | number>) => string): Tile[] {
  const metric = (key: "recall" | "precision" | "citation_accuracy", label: string): Tile => {
    const p = c.deltas[key] == null ? null : points(c.deltas[key]);
    return {
      key,
      label,
      color: METRIC_COLORS[key],
      before: pct(c.a[key]),
      after: pct(c.b[key]),
      delta: p,
      shown: p == null ? "" : t("pt", { points: Math.abs(p) }),
    };
  };
  const cost = c.deltas.cost_usd;
  return [
    metric("recall", t("recall")),
    metric("precision", t("precision")),
    metric("citation_accuracy", t("citation")),
    {
      key: "cost",
      label: t("cost"),
      color: "var(--text-primary)",
      before: c.a.cost_usd == null ? NO_DATA : c.a.cost_usd.toFixed(2),
      after: c.b.cost_usd == null ? NO_DATA : c.b.cost_usd.toFixed(2),
      delta: cost,
      shown: cost == null ? "" : Math.abs(cost).toFixed(2),
    },
  ];
}

export function CompareTiles({ compare }: { compare: CompareResponse }) {
  const t = useTranslations("eval.compare");
  const tDash = useTranslations("eval.dashboard");
  const tiles = buildTiles(compare, (k, v) => t(k, v));

  return (
    <div style={s.grid}>
      {tiles.map((tile) => {
        const tone = tile.delta == null || tile.delta === 0 ? "flat" : tile.delta > 0 ? "up" : "down";
        return (
          <div key={tile.key} style={s.tile}>
            <div style={s.label}>{tile.label}</div>
            <div style={s.row}>
              <span className="tnum" style={s.before}>
                {tile.before}
              </span>
              <Icon.ArrowRight size={13} style={{ color: "var(--text-muted)" }} aria-hidden />
              <span className="tnum" style={s.after(tile.after === NO_DATA ? "var(--text-muted)" : tile.color)}>
                {tile.after}
              </span>
              {tile.delta != null && tone !== "flat" && (
                <span style={s.delta(tone)}>
                  <span aria-hidden>{tone === "up" ? "▲" : "▼"}</span>
                  <span style={s.srOnly}>{tone === "up" ? tDash("up") : tDash("down")}</span> {tile.shown}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
