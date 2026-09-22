/* SkillListItem — one row of the Skills list: name, global enabled toggle,
   description, type + source badges and a usage footer. Pure/presentational. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, Toggle } from "@devdigest/ui";
import type { SkillSummary } from "@devdigest/shared";
import { SKILL_TYPE_COLOR, formatPct } from "@/lib/skill-format";
import { s } from "./styles";

export function SkillListItem({
  skill,
  active,
  onClick,
  onToggle,
  onDelete,
  deleting,
}: {
  skill: SkillSummary;
  active?: boolean;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
  onDelete?: () => void;
  deleting?: boolean;
}) {
  const t = useTranslations("skills");
  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={active ? "true" : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick?.();
        }
      }}
      style={s.card(!!active, skill.enabled)}
    >
      <div style={s.headerRow}>
        <span style={s.name}>{skill.name}</span>
        <Badge color={SKILL_TYPE_COLOR[skill.type]}>{t(`listItem.type.${skill.type}`)}</Badge>
        {onToggle && (
          <div onClick={(e) => e.stopPropagation()} aria-label={skill.name}>
            <Toggle on={skill.enabled} onChange={onToggle} size={14} />
          </div>
        )}
        {onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            disabled={deleting}
            title={t("card.delete")}
            aria-label={t("card.delete")}
            style={s.deleteBtn(!!deleting)}
          >
            <Icon.Trash size={14} style={deleting ? s.spin : undefined} />
          </button>
        )}
      </div>
      <div style={s.description}>{skill.description || t("listItem.noDescription")}</div>
      <div style={s.meta}>
        {t("listItem.source.label", { source: t(`listItem.source.${skill.source}`), version: skill.version })}
      </div>
      <div style={s.footer}>
        <span style={s.agentsChip}>
          <Icon.Settings size={13} />
          {t("listItem.agents", { count: skill.agents_count })}
        </span>
        <span>{t("listItem.pull", { pct: formatPct(skill.pull_pct) })}</span>
        <span>{t("listItem.accept", { pct: formatPct(skill.accept_pct) })}</span>
      </div>
    </div>
  );
}
