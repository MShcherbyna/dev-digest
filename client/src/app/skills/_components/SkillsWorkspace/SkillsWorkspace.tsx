/* SkillsWorkspace — master-detail shell shared by /skills and /skills/[id]:
   list column + (detail | "select a skill" prompt) + the import modal. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useSkills, useUpdateSkill } from "@/lib/hooks/skills";
import { ImportSkillModal } from "../ImportSkillModal";
import { SkillDetail } from "../SkillDetail";
import { SkillsList } from "../SkillsList";
import { s } from "./styles";

export function SkillsWorkspace({ id }: { id?: string }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const update = useUpdateSkill();
  const [importing, setImporting] = React.useState(false);

  const crumb = [{ label: t("page.crumbLab") }, { label: t("page.crumbSkills"), href: id ? "/skills" : undefined }];

  return (
    <AppShell crumb={crumb}>
      {importing && (
        <ImportSkillModal
          onClose={() => setImporting(false)}
          onImported={(newId) => {
            setImporting(false);
            router.push(`/skills/${newId}?tab=config`);
          }}
        />
      )}
      <div style={s.layout}>
        <SkillsList
          skills={skills ?? []}
          isLoading={isLoading}
          isError={isError}
          onRetry={() => refetch()}
          activeId={id}
          onSelect={(sid) => router.push(`/skills/${sid}?tab=config`)}
          onToggle={(sid, enabled) => update.mutate({ id: sid, patch: { enabled } })}
          onCreate={() => router.push("/skills/new")}
          onImport={() => setImporting(true)}
        />
        {id ? (
          <SkillDetail key={id} id={id} />
        ) : (
          <div style={s.prompt}>
            <EmptyState icon="Sparkles" title={t("page.selectPrompt.title")} body={t("page.selectPrompt.body")} />
          </div>
        )}
      </div>
    </AppShell>
  );
}
