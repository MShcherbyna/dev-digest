/* ContextTab — project docs attached to this agent. Persists on every change
   (no Save step); the list is shown optimistically by the mutation hook. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { ContextDocList } from "@/components/context-doc-list";
import { SerializesAs } from "@/components/serializes-as";
import { useAgentContext, useSetAgentContext } from "@/lib/hooks/project-context";
import { useActiveRepo } from "@/lib/repo-context";

export function ContextTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const { activeRepo } = useActiveRepo();
  const repoId = activeRepo?.id ?? null;
  const repo = activeRepo ? { id: activeRepo.id, name: activeRepo.full_name } : null;
  const q = useAgentContext(agent.id, repoId);
  const save = useSetAgentContext(agent.id);

  // No active repo: the query is disabled, show the hint with no rows (AC-20).
  const attached = repoId ? q.data?.paths : [];
  if (repoId && q.isError) return <ErrorState body={t("context.loadError")} onRetry={() => void q.refetch()} />;
  if (!attached) return <Skeleton height={200} />;

  return (
    // key: a repo switch remounts the list so filter, drag and open preview reset (AC-37).
    <ContextDocList
      key={repoId ?? "none"}
      repo={repo}
      attached={attached}
      onChange={(paths) => {
        if (repoId) save.mutate({ repoId, paths });
      }}
      title={t("context.title")}
      hint={t.rich("context.orderHint", { code: (chunks) => <code className="mono">{chunks}</code> })}
      variant="agent"
      footerNote={t("context.footerNote")}
    >
      <SerializesAs paths={attached} />
    </ContextDocList>
  );
}
