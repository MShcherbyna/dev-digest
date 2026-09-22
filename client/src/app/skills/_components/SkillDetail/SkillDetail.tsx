/* SkillDetail — right column: header (name, type, version, Run on evals) and
   the Config / Preview / Evals / Stats / Versions tabs. Tab state lives in
   ?tab=. `id === "new"` renders the empty Create form (Config tab only). */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, ErrorState, Skeleton, Tabs } from "@devdigest/ui";
import { useDeleteSkill, useSkill } from "@/lib/hooks/skills";
import { ApiError } from "@/lib/api";
import { SKILL_TYPE_COLOR } from "@/lib/skill-format";
import { SKILLS_SELECT_ROUTE } from "../SkillsWorkspace/constants";
import { ConfirmDeleteModal } from "@/components/confirm-delete-modal";
import { ConfigTab } from "../ConfigTab";
import { EvalsTab } from "../EvalsTab";
import { PreviewTab } from "../PreviewTab";
import { StatsTab } from "../StatsTab";
import { VersionsTab } from "../VersionsTab";
import { NEW_SKILL_ID, TABS } from "./constants";
import { resolveTab } from "./helpers";
import { s } from "./styles";

export function SkillDetail({ id }: { id: string }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const search = useSearchParams();
  const isNew = id === NEW_SKILL_ID;
  const { data: skill, isLoading, isError, error, refetch } = useSkill(isNew ? null : id);
  const del = useDeleteSkill();
  const [confirming, setConfirming] = React.useState(false);

  const tab = isNew ? "config" : resolveTab(search.get("tab"));
  const setTab = (next: string) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("tab", next);
    router.replace(`/skills/${id}?${sp.toString()}`);
  };

  if (!isNew && isError) {
    const notFound = error instanceof ApiError && error.status === 404;
    return notFound ? (
      <EmptyState icon="Sparkles" title={t("detail.notFound.title")} body={t("detail.notFound.body")} />
    ) : (
      <ErrorState body={t("detail.loadError")} onRetry={() => refetch()} />
    );
  }
  if (!isNew && (isLoading || !skill)) {
    return (
      <div style={s.loading}>
        <Skeleton height={24} width={240} />
        <Skeleton height={200} />
      </div>
    );
  }

  const tabs = (isNew ? TABS.filter((tb) => tb.key === "config") : TABS).map((tb) => ({
    key: tb.key,
    label: t(tb.labelKey),
    icon: tb.icon,
  }));

  const remove = () => {
    if (skill) del.mutate(skill.id, { onSuccess: () => router.push(SKILLS_SELECT_ROUTE) });
  };

  return (
    <div style={s.wrap}>
      {confirming && skill && (
        <ConfirmDeleteModal
          title={t("detail.delete")}
          message={t("detail.deleteConfirm", { name: skill.name })}
          pending={del.isPending}
          onConfirm={remove}
          onClose={() => setConfirming(false)}
        />
      )}
      <div style={s.header}>
        <h2 style={s.title}>{skill ? skill.name : t("detail.newTitle")}</h2>
        {skill && <Badge color={SKILL_TYPE_COLOR[skill.type]}>{t(`listItem.type.${skill.type}`)}</Badge>}
        {skill && (
          <Badge mono>{t("detail.version", { version: skill.version })}</Badge>
        )}
        <div style={s.headerActions}>
          {skill && (
            <Button kind="ghost" size="sm" icon="Trash" onClick={() => setConfirming(true)} disabled={del.isPending}>
              {t("detail.delete")}
            </Button>
          )}
          <Button kind="secondary" size="sm" icon="Play" disabled title={t("detail.comingSoon")}>
            {t("detail.runOnEvals")}
          </Button>
        </div>
      </div>
      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={setTab} pad="0 28px" />
      </div>
      <div style={s.body}>
        {tab === "config" && (
          <ConfigTab
            key={skill ? `${skill.id}:${skill.version}` : NEW_SKILL_ID}
            skill={skill ?? null}
            onCreated={(newId) => router.replace(`/skills/${newId}?tab=config`)}
            onCancelNew={() => router.push("/skills")}
          />
        )}
        {skill && tab === "preview" && <PreviewTab skill={skill} />}
        {skill && tab === "evals" && <EvalsTab />}
        {skill && tab === "stats" && <StatsTab skillId={skill.id} />}
        {skill && tab === "versions" && <VersionsTab skillId={skill.id} currentVersion={skill.version} />}
      </div>
    </div>
  );
}
