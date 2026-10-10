/* ContextTab (skill) — project docs any agent using this skill inherits.
   Persists on every change; shows what the attachments serialize as. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState, Skeleton } from "@devdigest/ui";
import { ContextDocList } from "@/components/context-doc-list";
import { SerializesAs } from "@/components/serializes-as";
import { useSetSkillContext, useSkillContext } from "@/lib/hooks/project-context";
import { useActiveRepo } from "@/lib/repo-context";

export function ContextTab({ skillId }: { skillId: string }) {
  const t = useTranslations("skills");
  const { activeRepo } = useActiveRepo();
  const repoId = activeRepo?.id ?? null;
  const repo = activeRepo ? { id: activeRepo.id, name: activeRepo.full_name } : null;
  const q = useSkillContext(skillId, repoId);
  const save = useSetSkillContext(skillId);

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
      hint={t("context.hint")}
      variant="skill"
    >
      <SerializesAs paths={attached} />
    </ContextDocList>
  );
}
