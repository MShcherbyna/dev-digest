/* MultiAgentRunView — /multi-agent-review/:runId results page (S4/S5). One
   shared data hook (`useMultiAgentRun`, R5) feeds both the Columns and Tabs
   views; the Columns/Tabs choice and the "Show only conflicts" toggle both
   survive a mode switch (AC-27/AC-30, kept in this component so switching
   views doesn't remount the page). */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, Icon, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useMultiAgentRun, useCancelMultiAgentRun, useCancelMultiAgentChild, useRetryMultiAgentChild } from "@/lib/hooks/multi-agent";
import { usePrReviews } from "@/lib/hooks/reviews";
import RunTraceDrawer from "@/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer";
import { buildFindingMap, headerMeta } from "./helpers";
import { ColumnsView } from "./_components/ColumnsView";
import { TabsView } from "./_components/TabsView";
import { DisagreementBlock } from "./_components/DisagreementBlock";
import { VIEW_MODE_KEY, type ViewMode } from "./constants";
import { s } from "./styles";

export function MultiAgentRunView({ runId }: { runId: string }) {
  const t = useTranslations("runs");
  const router = useRouter();
  const { data: run, isLoading, isError } = useMultiAgentRun(runId);
  const { data: reviews } = usePrReviews(run?.pr_id);
  const findingsById = React.useMemo(() => buildFindingMap(reviews), [reviews]);

  const [mode, setMode] = React.useState<ViewMode>("columns");
  React.useEffect(() => {
    try {
      const stored = sessionStorage.getItem(VIEW_MODE_KEY) as ViewMode | null;
      if (stored === "columns" || stored === "tabs") setMode(stored);
    } catch {
      /* ignore */
    }
  }, []);
  const changeMode = (m: ViewMode) => {
    setMode(m);
    try {
      sessionStorage.setItem(VIEW_MODE_KEY, m);
    } catch {
      /* ignore */
    }
  };

  const [onlyConflicts, setOnlyConflicts] = React.useState(false);
  const [trace, setTrace] = React.useState<{ runId: string; agentName: string } | null>(null);

  const cancelRun = useCancelMultiAgentRun();
  const cancelChild = useCancelMultiAgentChild();
  const retryChild = useRetryMultiAgentChild();

  if (isLoading) {
    return (
      <AppShell crumb={[{ label: t("page.crumb"), href: "/multi-agent-review" }]}>
        <div style={s.page}>
          <Skeleton height={200} />
        </div>
      </AppShell>
    );
  }

  if (isError || !run) {
    return (
      <AppShell crumb={[{ label: t("page.crumb"), href: "/multi-agent-review" }]}>
        <div style={s.page}>
          <EmptyState icon="AlertOctagon" title={t("page.notFound.title")} body={t("page.notFound.body")} />
        </div>
      </AppShell>
    );
  }

  const openTrace = (childRunId: string, agentName: string) => setTrace({ runId: childRunId, agentName });

  return (
    <AppShell crumb={[{ label: t("page.crumb"), href: "/multi-agent-review" }, { label: `#${run.pr_number ?? ""}` }]}>
      <div style={s.page}>
        <div style={s.headerTop}>
          <div style={s.headerLeft}>
            <Button kind="secondary" size="sm" icon="Settings" onClick={() => router.push(`/multi-agent-review/configure?pr=${run.pr_id}`)}>
              {t("page.configureRun")}
            </Button>
            <div>
              <h1 style={s.h1}>{t("page.title")}</h1>
              <div style={s.subtitle}>{t("page.selectedCount", { count: run.requested_agent_ids.length })}</div>
            </div>
          </div>
          <div style={s.headerRight}>
            {run.status === "running" && (
              <Button kind="secondary" size="sm" icon="X" onClick={() => cancelRun.mutate(run.id)}>
                {t("page.cancelRun")}
              </Button>
            )}
            <div style={s.segmented} role="group" aria-label={t("page.view.columns") + "/" + t("page.view.tabs")}>
              <button type="button" aria-pressed={mode === "columns"} style={s.segmentBtn(mode === "columns")} onClick={() => changeMode("columns")}>
                {t("page.view.columns")}
              </button>
              <button type="button" aria-pressed={mode === "tabs"} style={s.segmentBtn(mode === "tabs")} onClick={() => changeMode("tabs")}>
                {t("page.view.tabs")}
              </button>
            </div>
          </div>
        </div>

        <div style={s.metaRow}>
          <span style={s.prTitle}>
            #{run.pr_number} {/* title not carried on the multi-run view; shown via the PR link above */}
          </span>
          <span className="mono" style={s.metaMono}>
            <Icon.Workflow size={13} aria-hidden />
            {headerMeta(run, t)}
          </span>
        </div>

        <div aria-live="polite" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
          {run.columns.map((c) => `${c.agent_name}: ${c.status}`).join(", ")}
        </div>

        {mode === "columns" ? (
          <ColumnsView
            columns={run.columns}
            onOpenTrace={openTrace}
            onCancel={(childRunId) => cancelChild.mutate({ id: run.id, runId: childRunId })}
            onRetry={(childRunId) => retryChild.mutate({ id: run.id, runId: childRunId })}
          />
        ) : (
          <TabsView columns={run.columns} prId={run.pr_id} findingsById={findingsById} onOpenTrace={openTrace} />
        )}

        <DisagreementBlock
          conflicts={run.conflicts}
          columns={run.columns}
          onlyConflicts={onlyConflicts}
          onToggleOnlyConflicts={setOnlyConflicts}
        />
      </div>

      {trace && (
        <RunTraceDrawer
          runId={trace.runId}
          agentName={trace.agentName}
          prNumber={run.pr_number}
          running={run.columns.find((c) => c.run_id === trace.runId)?.status === "running"}
          onClose={() => setTrace(null)}
        />
      )}
    </AppShell>
  );
}
