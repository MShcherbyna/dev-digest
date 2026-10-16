/* DashboardHeader — back link, agent name + model chip, subtitle, switcher, range filter, Run eval. */
"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, Icon } from "@devdigest/ui";
import { ApiError } from "@/lib/api";
import { notify } from "@/lib/toast";
import { useEvalDashboard, useStartEvalRun, type AgentEvalDashboardResponse, type EvalRange } from "@/lib/hooks/eval";
import { RangeFilter } from "../RangeFilter";
import { s } from "./styles";

export function DashboardHeader({
  data,
  range,
  onRangeChange,
}: {
  data: AgentEvalDashboardResponse;
  range: EvalRange;
  onRangeChange: (r: EvalRange) => void;
}) {
  const t = useTranslations("eval.agentDashboard");
  const tTab = useTranslations("eval.evalsTab");
  const router = useRouter();
  const { agent } = data;
  const agents = useEvalDashboard().data?.agents ?? [];
  const start = useStartEvalRun(agent.id);
  const running = data.runs.some((r) => r.status === "running");

  const onRun = () =>
    start.mutate(undefined, {
      onError: (e) => {
        const code = e instanceof ApiError ? e.code : undefined;
        notify.error(code && tTab.has(`errors.${code}`) ? tTab(`errors.${code}`) : tTab("errors.generic"));
      },
    });

  return (
    <div>
      <Link href="/eval" style={s.back}>
        <Icon.ChevronLeft size={15} aria-hidden />
        {t("back")}
      </Link>
      <div style={s.row}>
        <div style={s.text}>
          <div style={s.nameRow}>
            <h1 style={s.name} title={agent.name}>
              {agent.name}
            </h1>
            <span className="mono" style={s.model}>
              {agent.model}
            </span>
          </div>
          <p style={s.subtitle}>{t("subtitle", { runs: data.runs_in_range, cases: data.cases_total })}</p>
        </div>
        <div style={s.controls}>
          <Dropdown
            width={240}
            align="right"
            trigger={
              <Button icon="Cpu" iconRight="ChevronDown" aria-label={t("switchAgent")}>
                {agent.name}
              </Button>
            }
            items={agents.map((a) => ({
              label: a.name,
              icon: "Cpu" as const,
              hint: a.id === agent.id ? "✓" : undefined,
              onClick: () => router.push(`/eval/${a.id}`),
            }))}
          />
          <RangeFilter range={range} onChange={onRangeChange} />
          <Button kind="primary" icon="Play" onClick={onRun} disabled={running} loading={start.isPending}>
            {running ? t("runningEval") : t("runEval")}
          </Button>
        </div>
      </div>
    </div>
  );
}
