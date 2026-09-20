/* SkillCard — one card of the /skills grid: icon, mono name, global enabled
   toggle, delete, 2-line description and a type / source / version / agents-count row. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, Toggle } from "@devdigest/ui";
import type { SkillSummary } from "@devdigest/shared";
import { useDeleteSkill, useUpdateSkill } from "@/lib/hooks/skills";
import { SKILL_TYPE_COLOR } from "@/lib/skill-format";
import { ConfirmDeleteModal } from "@/components/confirm-delete-modal";
import { s } from "./styles";

export function SkillCard({ skill, onClick }: { skill: SkillSummary; onClick?: () => void }) {
  const t = useTranslations("skills");
  const update = useUpdateSkill();
  const del = useDeleteSkill();
  const [confirming, setConfirming] = React.useState(false);

  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={skill.name}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick?.();
        }
      }}
      style={s.card(skill.enabled)}
    >
      <div style={s.headerRow}>
        <div style={s.iconBox}>
          <Icon.Sparkles size={15} />
        </div>
        <span className="mono" style={s.name}>
          {skill.name}
        </span>
        <div onClick={(e) => e.stopPropagation()}>
          <Toggle
            on={skill.enabled}
            onChange={(enabled) => update.mutate({ id: skill.id, patch: { enabled } })}
            size={14}
          />
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setConfirming(true);
          }}
          disabled={del.isPending}
          title={t("card.delete")}
          aria-label={t("card.delete")}
          style={s.deleteBtn(del.isPending)}
        >
          <Icon.Trash size={14} style={del.isPending ? s.spin : undefined} />
        </button>
      </div>
      <div style={s.description}>{skill.description || t("listItem.noDescription")}</div>
      <div style={s.metaRow}>
        <Badge color={SKILL_TYPE_COLOR[skill.type]}>{t(`listItem.type.${skill.type}`)}</Badge>
        <Badge>{t(`listItem.source.${skill.source}`)}</Badge>
        <Badge mono>{t("detail.version", { version: skill.version })}</Badge>
        <span style={s.agents}>{t("listItem.agents", { count: skill.agents_count })}</span>
      </div>
      {confirming && (
        <div onClick={(e) => e.stopPropagation()}>
          <ConfirmDeleteModal
            title={t("card.delete")}
            message={t("card.deleteConfirm", { name: skill.name })}
            pending={del.isPending}
            onConfirm={() => del.mutate(skill.id, { onSuccess: () => setConfirming(false) })}
            onClose={() => setConfirming(false)}
          />
        </div>
      )}
    </div>
  );
}
