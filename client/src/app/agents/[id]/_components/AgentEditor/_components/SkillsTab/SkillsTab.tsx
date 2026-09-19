/* SkillsTab — which skills this agent uses and in what order. Rows are
   draggable (native HTML5 DnD); the checkbox is the per-agent enabled switch.
   Edits are a local draft persisted with Save via the agent-skills hook. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useAgentSkills, useSetAgentSkills, useSkills } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { SKILL_TYPE_COLOR } from "@/lib/skill-format";
import { buildRows, countEnabled, matchesFilter, moveRow, setChecked, toLinks, type SkillRow } from "./helpers";
import { s } from "./styles";

export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const ts = useTranslations("skills");
  const toast = useToast();
  const skillsQ = useSkills();
  const linksQ = useAgentSkills(agent.id);
  const save = useSetAgentSkills(agent.id);

  const [draft, setDraft] = React.useState<SkillRow[] | null>(null);
  const [filter, setFilter] = React.useState("");
  const [dragId, setDragId] = React.useState<string | null>(null);

  const skills = skillsQ.data;
  const links = linksQ.data;
  const base = React.useMemo(() => (skills && links ? buildRows(skills, links) : []), [skills, links]);

  if (skillsQ.isError || linksQ.isError) {
    return (
      <ErrorState
        body={t("skills.loadError")}
        onRetry={() => {
          void skillsQ.refetch();
          void linksQ.refetch();
        }}
      />
    );
  }
  if (!skills || !links) return <Skeleton height={200} />;

  const rows = draft ?? base;
  const byId = new Map(skills.map((sk) => [sk.id, sk]));
  const visible = rows.filter((r) => matchesFilter(byId.get(r.id)?.name ?? "", filter));

  const onSave = () =>
    save.mutate(toLinks(rows), {
      onSuccess: () => {
        setDraft(null);
        toast.success(t("skills.savedToast"));
      },
    });

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <span className="tnum" style={s.count}>
          {t("skills.enabledCount", { linked: countEnabled(rows), total: rows.length })}
        </span>
        {draft && <Badge color="var(--warn)">{t("skills.unsaved")}</Badge>}
      </div>
      <p style={s.hint}>{t("skills.orderHint")}</p>
      <div style={s.filter}>
        <Icon.Search size={13} style={s.filterIcon} />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t("skills.filterPlaceholder")}
          aria-label={t("skills.filterPlaceholder")}
          style={s.filterInput}
        />
      </div>

      {rows.length === 0 && <div style={s.empty}>{t("skills.empty")}</div>}
      {rows.length > 0 && visible.length === 0 && <div style={s.empty}>{t("skills.noMatch")}</div>}
      <ul style={s.list}>
        {visible.map((r) => {
          const sk = byId.get(r.id);
          if (!sk) return null;
          return (
            <li
              key={r.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", r.id);
                setDragId(r.id);
              }}
              onDragOver={(e) => {
                if (dragId && dragId !== r.id) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId) setDraft(moveRow(rows, dragId, r.id));
                setDragId(null);
              }}
              onDragEnd={() => setDragId(null)}
              style={s.row(dragId === r.id, r.checked)}
            >
              <span
                role="img"
                aria-label={t("skills.dragHandle", { name: sk.name })}
                style={s.handle}
              >
                <Icon.Menu size={14} />
              </span>
              <input
                type="checkbox"
                checked={r.checked}
                aria-label={t("skills.enableFor", { name: sk.name })}
                onChange={(e) => setDraft(setChecked(rows, r.id, e.target.checked))}
              />
              <span style={s.name}>{sk.name}</span>
              {!sk.enabled && <Badge color="var(--text-muted)">{t("skills.globallyOff")}</Badge>}
              <Badge color={SKILL_TYPE_COLOR[sk.type]}>{ts(`listItem.type.${sk.type}`)}</Badge>
            </li>
          );
        })}
      </ul>

      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={onSave} disabled={!draft || save.isPending}>
          {save.isPending ? t("skills.saving") : t("skills.save")}
        </Button>
        {draft && (
          <Button kind="ghost" onClick={() => setDraft(null)} disabled={save.isPending}>
            {t("skills.reset")}
          </Button>
        )}
      </div>
    </div>
  );
}
