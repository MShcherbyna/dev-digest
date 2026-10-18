/* CiRunsView — /ci-runs: CI runs across repos (AC-30). The agent filter lives in `?agent=`
   (the CI tab's "View all" link sets it); the other filters are local. The page pulls fresh
   results on open and every 60 s while visible (AC-21). */
"use client";

import React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState } from "@devdigest/ui";
import type { CiRunStatus } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { CiRefreshBanner } from "@/components/ci-refresh-banner";
import { CiRunsTable } from "@/components/ci-runs-table";
import { useAgents, useRepos } from "@/lib/hooks";
import { useCiAutoRefresh, useCiRuns } from "@/lib/hooks/ci";
import { FilterSelect } from "./_components/FilterSelect";
import { DEFAULT_RANGE, FILTER_ICONS, SOURCE_OPTIONS, STATUS_OPTIONS, TIME_RANGES, type TimeRangeKey } from "./constants";
import { sinceIso } from "./helpers";
import { s } from "./styles";

export function CiRunsView() {
  const t = useTranslations("ci.runs");
  const tp = useTranslations("ci.page");
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const agentId = search.get("agent") ?? "";
  const [range, setRange] = React.useState<TimeRangeKey>(DEFAULT_RANGE);
  const [repo, setRepo] = React.useState("");
  const [status, setStatus] = React.useState<CiRunStatus | "">("");
  const [source, setSource] = React.useState("");
  // Fixed per range so the query key stays stable between renders.
  const since = React.useMemo(() => sinceIso(range), [range]);

  const agents = useAgents();
  const repos = useRepos();
  const refresh = useCiAutoRefresh();
  const runs = useCiRuns({
    agent: agentId || undefined,
    repo: repo || undefined,
    status: status || undefined,
    source: source === "ci" ? "ci" : undefined,
    since,
  });

  const onAgent = (id: string) => {
    const params = new URLSearchParams(search.toString());
    if (id) params.set("agent", id);
    else params.delete("agent");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <AppShell crumb={[{ label: tp("crumb") }]}>
      <div style={s.page}>
        <div style={s.header}>
          <div>
            <h1 style={s.h1}>{t("title")}</h1>
            <p style={s.subtitle}>{t("subtitle")}</p>
          </div>
          <div style={s.headRight}>
            <span style={s.live}>
              <span style={s.liveDot} />
              {t("autoRefresh")}
            </span>
            <Button kind="secondary" size="sm" icon="RefreshCw" loading={refresh.isRefreshing} onClick={refresh.refresh}>
              {refresh.isRefreshing ? t("refreshing") : t("refresh")}
            </Button>
          </div>
        </div>

        <div style={s.filters} role="group" aria-label={t("table.label")}>
          <FilterSelect
            label={t("filters.timeLabel")}
            icon={FILTER_ICONS.time}
            value={range}
            onChange={(v) => setRange(v as TimeRangeKey)}
            options={TIME_RANGES.map((r) => ({ value: r.key, label: t(`filters.${r.labelKey}`) }))}
            active={range !== DEFAULT_RANGE}
          />
          <FilterSelect
            label={t("filters.agentLabel")}
            icon={FILTER_ICONS.agent}
            value={agentId}
            onChange={onAgent}
            options={[{ value: "", label: t("filters.allAgents") }, ...(agents.data ?? []).map((a) => ({ value: a.id, label: a.name }))]}
            active={agentId !== ""}
          />
          <FilterSelect
            label={t("filters.repoLabel")}
            icon={FILTER_ICONS.repo}
            value={repo}
            onChange={setRepo}
            options={[{ value: "", label: t("filters.allRepos") }, ...(repos.data ?? []).map((r) => ({ value: r.full_name, label: r.full_name }))]}
            active={repo !== ""}
          />
          <FilterSelect
            label={t("filters.statusLabel")}
            icon={FILTER_ICONS.status}
            value={status}
            onChange={(v) => setStatus(v as CiRunStatus | "")}
            options={[{ value: "", label: t("filters.allStatuses") }, ...STATUS_OPTIONS.map((o) => ({ value: o.value, label: t(`status.${o.key}`) }))]}
            active={status !== ""}
          />
          <FilterSelect
            label={t("filters.sourceLabel")}
            icon={FILTER_ICONS.source}
            value={source}
            onChange={setSource}
            options={[{ value: "", label: t("filters.allSources") }, ...SOURCE_OPTIONS.map((o) => ({ value: o, label: t(`source.${o}`) }))]}
            active={source !== ""}
          />
        </div>

        {(refresh.error || refresh.hasPartialErrors) && (
          <div style={s.banner}>
            <CiRefreshBanner onRetry={refresh.refresh} retrying={refresh.isRefreshing} />
          </div>
        )}

        <CiRunsTable
          runs={runs.data}
          isLoading={runs.isLoading}
          isError={runs.isError}
          onRetry={() => void runs.refetch()}
          empty={
            <EmptyState
              icon="Workflow"
              title={t("emptyTitle")}
              body={t("emptyBody")}
              cta={t("emptyCta")}
              onCta={() => router.push("/agents")}
            />
          }
        />
      </div>
    </AppShell>
  );
}
