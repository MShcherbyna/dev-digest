/* RunResultPanel — outcome of the case's latest run (plain text only). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { EvalCaseResult } from "@/lib/hooks/eval";
import { formatCost, formatDuration } from "../../helpers";
import { s } from "../../styles";

export function RunResultPanel({ result, provider }: { result: EvalCaseResult | null; provider: string }) {
  const t = useTranslations("eval.caseEditor");
  if (!result) return null;

  if (result.status === "running")
    return (
      <div style={s.result("pending")} role="status">
        <Icon.RefreshCw size={16} style={{ animation: "ddspin 1s linear infinite" }} />
        {t("resultRunning")}
      </div>
    );

  if (result.status === "error") {
    const reason = result.error_reason === "missing_api_key" ? t("noApiKey", { provider }) : (result.error_reason ?? "—");
    return (
      <div style={s.result("bad")} role="status">
        <Icon.AlertTriangle size={18} style={{ color: "var(--crit)" }} />
        <span>
          <span style={s.resultStrong}>{t("resultError")}</span> · {t("resultErrorReason", { reason })}
        </span>
      </div>
    );
  }

  const passed = result.status === "passed";
  return (
    <div style={s.result(passed ? "ok" : "bad")} role="status">
      {passed ? <Icon.CheckCircle size={18} style={{ color: "var(--ok)" }} /> : <Icon.XCircle size={18} style={{ color: "var(--crit)" }} />}
      <span>
        <span style={s.resultStrong}>{passed ? t("resultPassed") : t("resultFailed")}</span>
        {" · "}
        {t("resultDetail", {
          expected: result.expected_count ?? 0,
          got: result.got_count ?? 0,
          duration: formatDuration(result.duration_ms),
          cost: formatCost(result.cost_usd),
        })}
      </span>
    </div>
  );
}
