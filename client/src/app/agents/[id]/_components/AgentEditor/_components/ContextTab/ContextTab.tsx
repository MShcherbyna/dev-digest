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
  const q = useAgentContext(agent.id);
  const save = useSetAgentContext(agent.id, activeRepo?.id);

  if (q.isError) return <ErrorState body={t("context.loadError")} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Skeleton height={200} />;

  return (
    <ContextDocList
      repo={activeRepo ? { id: activeRepo.id, name: activeRepo.full_name } : null}
      attached={q.data.paths}
      onChange={(paths) => save.mutate(paths)}
      title={t("context.title")}
      hint={t.rich("context.orderHint", { code: (chunks) => <code className="mono">{chunks}</code> })}
      variant="agent"
      footerNote={t("context.footerNote")}
    >
      <SerializesAs paths={q.data.paths} />
    </ContextDocList>
  );
}
