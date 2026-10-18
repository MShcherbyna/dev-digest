/* TabsView — S5: one tab per agent, a summary card, then FindingCards (exactly
   Accept / Dismiss / Turn into eval case — AC-33), plus similar-findings from
   other agents in the same group (AC-22). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Tabs } from "@devdigest/ui";
import type { EvalAwareFinding } from "@/lib/hooks/eval";
import { useFindingAction } from "@/lib/hooks/reviews";
import { FindingCard } from "@/app/repos/[repoId]/pulls/[number]/_components/FindingCard";
import type { AgentColumnView } from "@/lib/types";
import { agentLook } from "@/lib/agent-look";
import { similarMembers } from "../../helpers";
import { AgentSummaryCard } from "../AgentSummaryCard";
import { SimilarFindings } from "../SimilarFindings";

export function TabsView({
  columns,
  prId,
  findingsById,
  onOpenTrace,
}: {
  columns: AgentColumnView[];
  prId: string;
  findingsById: Map<string, EvalAwareFinding>;
  onOpenTrace: (runId: string, agentName: string) => void;
}) {
  const t = useTranslations("runs");
  const [active, setActive] = React.useState(columns[0]?.run_id ?? "");
  const activeColumn = columns.find((c) => c.run_id === active) ?? columns[0];
  const findingAction = useFindingAction();

  const tabs = columns.map((c) => {
    const look = agentLook({ name: c.agent_name });
    return {
      key: c.run_id,
      label: c.status === "done" && c.score != null ? `${c.agent_name} ${c.score}` : c.agent_name,
      icon: look.icon,
    };
  });

  if (!activeColumn) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Tabs tabs={tabs} value={activeColumn.run_id} onChange={setActive} pad="0" />
      <AgentSummaryCard column={activeColumn} onOpenTrace={() => onOpenTrace(activeColumn.run_id, activeColumn.agent_name)} />

      {activeColumn.status !== "done" ? null : activeColumn.findings.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{t("column.noFindings")}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {activeColumn.findings.map((f, i) => {
            const full = findingsById.get(f.id);
            const members = similarMembers(f, columns);
            if (!full) return null;
            return (
              <div key={f.id}>
                <FindingCard
                  f={full}
                  prId={prId}
                  agentId={activeColumn.agent_id}
                  showTranslate={false}
                  defaultExpanded={i === 0}
                  pending={findingAction.isPending}
                  onAction={(action) => findingAction.mutate({ findingId: f.id, action, prId })}
                />
                <SimilarFindings members={members} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
