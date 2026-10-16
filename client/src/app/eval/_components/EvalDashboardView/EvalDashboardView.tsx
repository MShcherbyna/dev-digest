/* EvalDashboardView — /eval: every agent's latest metrics + the latest runs across agents (screenshot 3). */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState, SectionLabel, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useEvalDashboard } from "@/lib/hooks/eval";
import { EvalLoadError } from "../EvalLoadError";
import { AgentEvalCard } from "./_components/AgentEvalCard";
import { RecentEvalRunsTable } from "./_components/RecentEvalRunsTable";
import { RunAllAgentsButton } from "./_components/RunAllAgentsButton";
import { s } from "./styles";

export function EvalDashboardView() {
  const t = useTranslations("eval");
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useEvalDashboard();
  const agents = data?.agents ?? [];
  const anyRunning = agents.some((a) => a.has_running_run);

  return (
    <AppShell crumb={[{ label: t("page.crumbSkillsLab") }, { label: t("page.crumbEvalDashboard") }]}>
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>{t("dashboard.defaultTitle")}</h1>
            <p style={s.subtitle}>{t("allAgents.subtitle")}</p>
          </div>
          {agents.length > 0 && <RunAllAgentsButton running={anyRunning} />}
        </div>

        {isLoading ? (
          <div style={s.list}>
            <Skeleton height={86} />
            <Skeleton height={86} />
          </div>
        ) : isError ? (
          <EvalLoadError message={t("allAgents.loadError")} onRetry={() => void refetch()} />
        ) : agents.length === 0 ? (
          <EmptyState
            icon="FlaskConical"
            title={t("allAgents.emptyTitle")}
            body={t("allAgents.emptyBody")}
            cta={t("allAgents.emptyCta")}
            onCta={() => router.push("/agents")}
          />
        ) : (
          <>
            <div style={s.sectionGap}>
              <SectionLabel icon="Cpu">{t("allAgents.agentsHeading")}</SectionLabel>
            </div>
            <div style={s.list}>
              {agents.map((a) => (
                <AgentEvalCard key={a.id} agent={a} />
              ))}
            </div>
            <SectionLabel icon="History">{t("allAgents.recentHeading")}</SectionLabel>
            <RecentEvalRunsTable runs={data?.recent_runs ?? []} />
          </>
        )}
      </div>
    </AppShell>
  );
}
