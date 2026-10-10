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
  const q = useSkillContext(skillId);
  const save = useSetSkillContext(skillId, activeRepo?.id);

  if (q.isError) return <ErrorState body={t("context.loadError")} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Skeleton height={200} />;

  return (
    <ContextDocList
      repo={activeRepo ? { id: activeRepo.id, name: activeRepo.full_name } : null}
      attached={q.data.paths}
      onChange={(paths) => save.mutate(paths)}
      title={t("context.title")}
      hint={t("context.hint")}
      variant="skill"
    >
      <SerializesAs paths={q.data.paths} />
    </ContextDocList>
  );
}
