/* AgentEvalDashboardView — /eval/:agentId: header, regression banner, metric tiles, trend chart,
   runs table with Compare (screenshot 4). The date range lives in `?range=`. */
"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { ApiError } from "@/lib/api";
import { notify } from "@/lib/toast";
import { useAgentEvalDashboard, useEvalCompare, type EvalRange } from "@/lib/hooks/eval";
import { EvalLoadError } from "../EvalLoadError";
import { AgentRunsTable } from "./_components/AgentRunsTable";
import { CompareModal } from "./_components/CompareModal";
import { DashboardHeader } from "./_components/DashboardHeader";
import { EvalMetricTiles } from "./_components/EvalMetricTiles";
import { MetricTrendChart } from "./_components/MetricTrendChart";
import { RegressionBanner } from "./_components/RegressionBanner";
import { DEFAULT_RANGE } from "./constants";
import { isSelectable, parseRange } from "./helpers";
import { s } from "./styles";

export function AgentEvalDashboardView({ agentId }: { agentId: string }) {
  const t = useTranslations("eval");
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const range = parseRange(search.get("range"));

  const { data, isLoading, isError, error, refetch } = useAgentEvalDashboard(agentId, range);
  const [selectedRaw, setSelected] = React.useState<string[]>([]);
  const [pair, setPair] = React.useState<[string, string] | null>(null);
  // The modal mounts after an async fetch, when the Compare button is busy; remember it for focus return.
  const compareTrigger = React.useRef<HTMLElement | null>(null);
  const compare = useEvalCompare(pair?.[0], pair?.[1]);

  // Derive: only ids of selectable runs still in the list count (a range change drops the rest).
  const selectable = new Set((data?.runs ?? []).filter(isSelectable).map((r) => r.id));
  const selected = selectedRaw.filter((id) => selectable.has(id));

  // A failed compare (422 cross-agent / not finished, 404) toasts and never opens the modal.
  React.useEffect(() => {
    if (compare.isError) {
      notify.error(t("agentDashboard.runs.compareFailed"));
      setPair(null);
    }
  }, [compare.isError, t]);

  const onRangeChange = (next: EvalRange) => {
    const params = new URLSearchParams(search.toString());
    if (next === DEFAULT_RANGE) params.delete("range");
    else params.set("range", next);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };

  const notFound = isError && error instanceof ApiError && error.status === 404;
  const crumb = [
    { label: t("page.crumbSkillsLab") },
    { label: t("page.crumbEvalDashboard"), href: "/eval" },
    ...(data ? [{ label: data.agent.name }] : []),
  ];

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        {isLoading ? (
          <>
            <Skeleton height={80} />
            <Skeleton height={120} />
            <Skeleton height={260} />
          </>
        ) : notFound ? (
          <EmptyState
            icon="Cpu"
            title={t("agentDashboard.notFoundTitle")}
            body={
              <>
                {t("agentDashboard.notFoundBody")}{" "}
                <Link href="/eval">{t("agentDashboard.notFoundCta")}</Link>
              </>
            }
          />
        ) : isError || !data ? (
          <EvalLoadError message={t("agentDashboard.loadError")} onRetry={() => void refetch()} />
        ) : (
          <>
            <DashboardHeader data={data} range={range} onRangeChange={onRangeChange} />
            {data.runs_in_range === 0 ? (
              <EmptyState
                icon="History"
                title={t("agentDashboard.emptyRangeTitle")}
                body={t("agentDashboard.emptyRangeBody")}
              />
            ) : (
              <>
                {data.alert && <RegressionBanner alert={data.alert} />}
                <EvalMetricTiles data={data} />
                <div style={s.card}>
                  <MetricTrendChart trend={data.trend} />
                </div>
                <AgentRunsTable
                  runs={data.runs}
                  selected={selected}
                  onSelectedChange={setSelected}
                  onCompare={() => {
                    if (selected.length !== 2) return;
                    compareTrigger.current =
                      document.activeElement instanceof HTMLElement ? document.activeElement : null;
                    setPair([selected[0]!, selected[1]!]);
                  }}
                  comparing={compare.isFetching}
                />
              </>
            )}
          </>
        )}
      </div>
      {pair && compare.data && (
        <CompareModal
          agentId={agentId}
          compare={compare.data}
          onClose={() => setPair(null)}
          returnFocusTo={compareTrigger}
        />
      )}
    </AppShell>
  );
}
