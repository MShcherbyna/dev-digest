/* RunAllEvalsButton — starts an agent-level eval run; shows "Running… k/N" while one is active. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { ApiError } from "@/lib/api";
import { notify } from "@/lib/toast";
import { useCancelEvalRun, useEvalRun, useStartEvalRun, type EvalAgentRun } from "@/lib/hooks/eval";

export function RunAllEvalsButton({
  agentId,
  provider,
  runs,
  disabled,
}: {
  agentId: string;
  provider: string;
  runs: EvalAgentRun[] | undefined;
  disabled?: boolean;
}) {
  const t = useTranslations("eval.evalsTab");
  const start = useStartEvalRun(agentId);
  const cancel = useCancelEvalRun(agentId);
  const active = runs?.find((r) => r.status === "running");
  const progress = useEvalRun(active?.id, agentId).data?.progress;

  const onClick = () =>
    start.mutate(undefined, {
      onError: (e) => {
        const code = e instanceof ApiError ? e.code : undefined;
        notify.error(code && t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.generic"));
      },
    });

  const label = active
    ? t("runningProgress", { done: progress?.done ?? active.cases_executed + active.cases_errored, total: progress?.total ?? active.cases_total })
    : t("runAll");
  // The newest run failing for a missing key is the one actionable reason worth surfacing.
  const keyMissing = !active && runs?.[0]?.status === "failed" && runs[0].reason === "missing_api_key";

  return (
    <>
      {keyMissing && <span style={{ fontSize: 12.5, color: "var(--crit)" }}>{t("noApiKey", { provider })}</span>}
      <Button icon="Play" onClick={onClick} disabled={!!active || disabled} loading={start.isPending}>
        {label}
      </Button>
      {active && (
        <Button kind="secondary" icon="X" onClick={() => cancel.mutate(active.id)} loading={cancel.isPending}>
          {t("stopRun")}
        </Button>
      )}
    </>
  );
}
