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
      <div style={s.badgeRow}>
        <Badge color={SKILL_TYPE_COLOR[skill.type]}>{t(`listItem.type.${skill.type}`)}</Badge>
        <Badge>{t(`listItem.source.${skill.source}`)}</Badge>
      </div>
      <div style={s.footer}>
        <span>{t("listItem.agents", { count: skill.agents_count })}</span>
        <span>·</span>
        <span>{t("listItem.pull", { pct: formatPct(skill.pull_pct) })}</span>
        <span>·</span>
        <span>{t("listItem.accept", { pct: formatPct(skill.accept_pct) })}</span>
      </div>
    </div>
  );
}
