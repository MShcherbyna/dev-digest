/* SkillsTab — which skills this agent uses and in what order. Rows are
   draggable (native HTML5 DnD); the checkbox is the per-agent enabled switch.
   There is no Save step: every checkbox toggle and every drop persists
   immediately. The new order is shown optimistically and rolled back if the
   request fails (the global mutation handler raises the error toast). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useAgentSkills, useSetAgentSkills, useSkills } from "@/lib/hooks/skills";
import { SKILL_TYPE_BG, SKILL_TYPE_COLOR } from "@/lib/skill-format";
import { buildRows, countEnabled, matchesFilter, moveRow, setChecked, toLinks, type SkillRow } from "./helpers";
import { s } from "./styles";

export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const ts = useTranslations("skills");
  const skillsQ = useSkills();
  const linksQ = useAgentSkills(agent.id);
  const save = useSetAgentSkills(agent.id);

  const [optimistic, setOptimistic] = React.useState<SkillRow[] | null>(null);
  const inflight = React.useRef(0);
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

  const rows = optimistic ?? base;
  const byId = new Map(skills.map((sk) => [sk.id, sk]));
  const visible = rows.filter((r) => matchesFilter(byId.get(r.id)?.name ?? "", filter));

  /** Show `next` right away and persist it; on failure fall back to server state. */
  const persist = async (next: SkillRow[]) => {
    setOptimistic(next);
    inflight.current += 1;
    try {
      await save.mutateAsync(toLinks(next));
    } catch {
      setOptimistic(null);
    } finally {
      inflight.current -= 1;
      if (inflight.current === 0) setOptimistic(null);
    }
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <span className="tnum" style={s.count}>
          {t("skills.enabledCount", { linked: countEnabled(rows), total: rows.length })}
        </span>
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
      </div>
      <p style={s.hint}>{t("skills.orderHint")}</p>

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
              title={sk.enabled ? undefined : t("skills.globallyOff")}
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
                if (dragId) {
                  const next = moveRow(rows, dragId, r.id);
                  if (next !== rows) void persist(next);
                }
                setDragId(null);
              }}
              onDragEnd={() => setDragId(null)}
              style={s.row(dragId === r.id, r.checked, sk.enabled)}
            >
              <span role="img" aria-label={t("skills.dragHandle", { name: sk.name })} style={s.handle}>
                <Icon.Menu size={14} />
              </span>
              <input
                type="checkbox"
                checked={r.checked}
                aria-label={t("skills.enableFor", { name: sk.name })}
                style={s.checkbox(r.checked)}
                onChange={(e) => void persist(setChecked(rows, r.id, e.target.checked))}
              />
              <span className="mono" style={s.name(r.checked)}>
                {sk.name}
              </span>
              <Badge color={SKILL_TYPE_COLOR[sk.type]} bg={SKILL_TYPE_BG[sk.type]} style={s.badge(r.checked)}>{ts(`listItem.type.${sk.type}`)}</Badge>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
