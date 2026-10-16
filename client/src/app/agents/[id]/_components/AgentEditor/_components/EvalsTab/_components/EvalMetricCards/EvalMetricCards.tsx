/* EvalMetricCards — RECALL / PRECISION / CITATION ACCURACY / TRACES PASSED of the
   latest finished run, with whole-point deltas vs the previous finished run. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { EvalAgentRun } from "@/lib/hooks/eval";
import { METRIC_COLOR, METRIC_KEYS, type MetricKey } from "../../constants";
import { deltaPoints, formatPct, latestTwoFinished } from "../../helpers";
import { s } from "./styles";

const LABEL_KEY: Record<MetricKey, string> = {
  recall: "metricRecall",
  precision: "metricPrecision",
  citation_accuracy: "metricCitation",
};

export function EvalMetricCards({ runs }: { runs: EvalAgentRun[] | undefined }) {
  const t = useTranslations("eval.evalsTab");
  const [latest, previous] = latestTwoFinished(runs);

  return (
    <div>
      <div style={s.grid}>
        {METRIC_KEYS.map((k) => {
          const value = latest?.[k] ?? null;
          const delta = deltaPoints(value, previous?.[k]);
          return (
            <div key={k} style={s.card}>
              <div style={s.label}>{t(LABEL_KEY[k])}</div>
              <div style={s.valueRow}>
                {value == null ? (
                  <span style={s.value("var(--text-muted)")} aria-label={t("noData")}>
                    —
                  </span>
                ) : (
                  <span style={s.value(METRIC_COLOR[k])}>{formatPct(value)}</span>
                )}
                {delta != null && delta !== 0 && (
                  <span style={s.delta(delta > 0)}>
                    <span aria-hidden>{delta > 0 ? "▲" : "▼"}</span>
                    <span style={s.srOnly}>{delta > 0 ? t("up") : t("down")}</span> {Math.abs(delta)}pt
                  </span>
                )}
              </div>
            </div>
          );
        })}
        <div style={s.card}>
          <div style={s.label}>{t("tracesPassed")}</div>
          <div style={s.valueRow}>
            {latest ? (
              <span style={s.value("var(--text-primary)")}>
                {latest.cases_passed}/{latest.cases_total}
              </span>
            ) : (
              <span style={s.value("var(--text-muted)")} aria-label={t("noData")}>
                —
              </span>
            )}
          </div>
        </div>
      </div>
      {!latest && <div style={s.hint}>{t("metricsEmpty")}</div>}
    </div>
  );
}
