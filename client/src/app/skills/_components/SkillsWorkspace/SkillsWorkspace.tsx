/* SkillsWorkspace — master-detail shell for /skills/[id] and /skills/new:
   list column + skill detail + the import modal. (Bare /skills is SkillsListView.) */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/app-shell";
import { useDeleteSkill, useSkills, useUpdateSkill } from "@/lib/hooks/skills";
import { ImportSkillModal } from "../ImportSkillModal";
import { SkillDetail } from "../SkillDetail";
import { SkillsList } from "../SkillsList";
import { s } from "./styles";

export function SkillsWorkspace({ id }: { id: string }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const update = useUpdateSkill();
  const del = useDeleteSkill();
  const [importing, setImporting] = React.useState(false);

  const crumb = [{ label: t("page.crumbLab") }, { label: t("page.crumbSkills"), href: "/skills" }];

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
          onDelete={(sk) => {
            if (!window.confirm(t("card.deleteConfirm", { name: sk.name }))) return;
            del.mutate(sk.id, { onSuccess: () => sk.id === id && router.push("/skills") });
          }}
          deletingId={del.isPending ? del.variables : null}
          onCreate={() => router.push("/skills/new")}
          onImport={() => setImporting(true)}
        />
        <SkillDetail key={id} id={id} />
      </div>
    </AppShell>
  );
}
