/* SkillsList — left column of the Skills master-detail: title, Add menu,
   search and the skill items. Pure view: data + callbacks come from the parent. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { SkillSummary } from "@devdigest/shared";
import { AddSkillMenu } from "../AddSkillMenu";
import { SkillListItem } from "../SkillListItem";
import { filterSkills } from "./helpers";
import { s } from "./styles";

export function SkillsList({
  skills,
  isLoading,
  isError,
  onRetry,
  activeId,
  onSelect,
  onToggle,
  onCreate,
  onImport,
}: {
  skills: SkillSummary[];
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  activeId?: string | null;
  onSelect: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onCreate: () => void;
  onImport: () => void;
}) {
  const t = useTranslations("skills");
  const [search, setSearch] = React.useState("");
  const list = filterSkills(skills, search);

  return (
    <div style={s.column}>
      <div style={s.top}>
        <div style={s.titleRow}>
          <h1 style={s.h1}>{t("page.heading")}</h1>
          <AddSkillMenu onCreate={onCreate} onImport={onImport} />
        </div>
        <div style={s.search}>
          <Icon.Search size={13} style={s.searchIcon} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("page.searchPlaceholder")}
            aria-label={t("page.searchPlaceholder")}
            style={s.searchInput}
          />
        </div>
      </div>
      <div style={s.scroll}>
        {isLoading && (
          <div style={s.skeletons}>
            <Skeleton height={110} />
            <Skeleton height={110} />
            <Skeleton height={110} />
          </div>
        )}
        {isError && <ErrorState body={t("page.loadError")} onRetry={onRetry} />}
        {!isLoading && !isError && skills.length === 0 && (
          <EmptyState
            icon="Sparkles"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={t("page.empty.cta")}
            onCta={onCreate}
          />
        )}
        {!isLoading && !isError && skills.length > 0 && list.length === 0 && (
          <div style={s.noMatch}>{t("page.noMatch")}</div>
        )}
        {list.map((sk) => (
          <SkillListItem
            key={sk.id}
            skill={sk}
            active={sk.id === activeId}
            onClick={() => onSelect(sk.id)}
            onToggle={(enabled) => onToggle(sk.id, enabled)}
          />
        ))}
      </div>
    </div>
  );
}
