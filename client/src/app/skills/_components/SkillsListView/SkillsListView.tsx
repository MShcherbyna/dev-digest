/* /skills — Skills list. SkillCards + Add Skill (create / import .md). Selecting
   a skill opens the master-detail workspace at /skills/:id. Mirrors AgentsListView. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useSkills } from "@/lib/hooks/skills";
import { AddSkillMenu } from "../AddSkillMenu";
import { ImportSkillModal } from "../ImportSkillModal";
import { SkillCard } from "../SkillCard";
import { filterSkills } from "./helpers";
import { s } from "./styles";

export function SkillsListView() {
  const t = useTranslations("skills");
  const router = useRouter();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const [importing, setImporting] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const all = skills ?? [];
  const list = filterSkills(all, search);
  const create = () => router.push("/skills/new");

  return (
    <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbSkills") }]}>
      {importing && (
        <ImportSkillModal
          onClose={() => setImporting(false)}
          onImported={(newId) => {
            setImporting(false);
            router.push(`/skills/${newId}?tab=config`);
          }}
        />
      )}
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>{t("list.title")}</h1>
            <p style={s.subtitle}>{t("list.subtitle")}</p>
          </div>
          <div style={s.search}>
            <Icon.Search size={13} style={s.searchIcon} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("list.searchPlaceholder")}
              aria-label={t("list.searchPlaceholder")}
              style={s.searchInput}
            />
          </div>
          <AddSkillMenu onCreate={create} onImport={() => setImporting(true)} />
        </div>

        {isLoading && (
          <div style={s.grid}>
            <Skeleton height={120} />
            <Skeleton height={120} />
            <Skeleton height={120} />
          </div>
        )}
        {isError && <ErrorState body={t("list.loadError")} onRetry={() => refetch()} />}
        {!isLoading && !isError && all.length === 0 && (
          <EmptyState
            icon="Sparkles"
            title={t("list.emptyTitle")}
            body={t("list.emptyBody")}
            cta={t("list.emptyCta")}
            onCta={create}
          />
        )}
        {!isLoading && !isError && all.length > 0 && list.length === 0 && (
          <div style={s.noMatch}>{t("list.noMatch")}</div>
        )}
        {list.length > 0 && (
          <div style={s.grid}>
            {list.map((sk) => (
              <SkillCard key={sk.id} skill={sk} onClick={() => router.push(`/skills/${sk.id}?tab=config`)} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
