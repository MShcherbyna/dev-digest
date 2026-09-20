/* StatsTab — 30-day agent usage: headline tiles, most-used skills / pulled
   memory, severity + category findings, and run history. Nulls render as "—";
   nothing is fabricated when there is no data. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Card, ErrorState, SectionLabel, Skeleton } from "@devdigest/ui";
import { useAgentStats } from "@/lib/hooks/agents";
import { CategoryDonut } from "@/components/category-donut";
import { MEMORY_BAR_COLOR, SKILL_BAR_COLOR } from "@/lib/chart-colors";
import { StatTiles } from "./_components/StatTiles";
import { UsageBars } from "./_components/UsageBars";
import { SeverityWeeklyChart } from "./_components/SeverityWeeklyChart";
import { RunHistoryTable } from "./_components/RunHistoryTable";
import { s } from "./styles";

export function StatsTab({ agentId }: { agentId: string }) {
  const t = useTranslations("agents");
  const { data, isLoading, isError, refetch } = useAgentStats(agentId);

  if (isLoading) return <Skeleton height={160} />;
  if (isError || !data) return <ErrorState body={t("stats.loadError")} onRetry={() => refetch()} />;

  const skillRows = data.skill_usage.map((sk) => ({
    key: sk.id,
    label: sk.name,
    pct: sk.pct,
    dim: !sk.enabled,
    hint: sk.enabled ? sk.name : `${sk.name} (${t("stats.skillDisabled")})`,
  }));
  const memoryRows = data.memory_usage.map((m) => ({ key: m.label, label: m.label, pct: m.pct }));
  const categories = data.by_category.filter((c) => c.count > 0);

  return (
    <div style={s.wrap}>
      <StatTiles
        runs_30d={data.runs_30d}
        runs_trend={data.runs_trend}
        avg_cost_usd={data.avg_cost_usd}
        cost_delta_usd={data.cost_delta_usd}
        avg_duration_ms={data.avg_duration_ms}
        accept_pct={data.accept_pct}
      />

      <div style={s.pair}>
        <Card>
          <SectionLabel icon="Sparkles">{t("stats.skillsTitle")}</SectionLabel>
          <UsageBars rows={skillRows} color={SKILL_BAR_COLOR} mono emptyLabel={t("stats.noSkills")} />
        </Card>
        <Card>
          <SectionLabel icon="Database">{t("stats.memoryTitle")}</SectionLabel>
          <UsageBars rows={memoryRows} color={MEMORY_BAR_COLOR} emptyLabel={t("stats.noMemory")} />
        </Card>
      </div>

      <div style={s.pair}>
        <Card>
          <SectionLabel icon="AlertTriangle">{t("stats.severityTitle")}</SectionLabel>
          <SeverityWeeklyChart weeks={data.severity_weekly} />
        </Card>
        <Card>
          <SectionLabel icon="Layers">{t("stats.categoriesTitle")}</SectionLabel>
          {categories.length === 0 ? (
            <div style={s.empty}>{t("stats.noCategories")}</div>
          ) : (
            <CategoryDonut categories={categories} />
          )}
        </Card>
      </div>

      <Card>
        <SectionLabel icon="History">{t("stats.historyTitle")}</SectionLabel>
        <RunHistoryTable runs={data.recent_runs} />
      </Card>
    </div>
  );
}
