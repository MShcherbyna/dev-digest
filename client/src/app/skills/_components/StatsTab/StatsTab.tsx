/* StatsTab — usage tiles, agents using the skill, findings-by-category donut.
   Nulls render as "—"; nothing is fabricated when there is no data. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Card, CircularScore, ErrorState, Icon, SectionLabel, Skeleton } from "@devdigest/ui";
import { CategoryDonut } from "@/components/category-donut";
import { useSkillStats } from "@/lib/hooks/skills";
import { s } from "./styles";

/** Big number with a small unit next to it ("3 agents", "71 %"); "—" without data. */
function Value({ value, unit }: { value: number | null; unit?: string }) {
  if (value == null) {
    return (
      <span className="tnum" style={s.tileValue}>
        —
      </span>
    );
  }
  return (
    <span style={s.valueWrap}>
      <span className="tnum" style={s.tileValue}>
        {Math.round(value)}
      </span>
      {unit && <span style={s.tileUnit}>{unit}</span>}
    </span>
  );
}

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={s.tile}>
      <div style={s.tileLabel}>{label}</div>
      <div style={s.tileValueRow}>{children}</div>
    </div>
  );
}

export function StatsTab({ skillId }: { skillId: string }) {
  const t = useTranslations("skills");
  const { data, isLoading, isError, refetch } = useSkillStats(skillId);

  if (isLoading) return <Skeleton height={160} />;
  if (isError || !data) return <ErrorState body={t("stats.loadError")} onRetry={() => refetch()} />;

  const categories = data.by_category.filter((c) => c.count > 0);

  return (
    <div style={s.wrap}>
      <div style={s.tiles}>
        <Tile label={t("stats.usedBy")}>
          <Value value={data.used_by} unit={t("stats.agentsUnit", { count: data.used_by })} />
        </Tile>
        <Tile label={t("stats.pull")}>
          <Value value={data.pull_pct} unit="%" />
        </Tile>
        <Tile label={t("stats.accept")}>
          <Value value={data.accept_pct} unit="%" />
          {data.accept_pct != null && <CircularScore score={data.accept_pct} size={36} />}
        </Tile>
        <Tile label={t("stats.findings")}>
          <Value value={data.findings_30d} />
        </Tile>
      </div>

      <div style={s.pair}>
        <Card>
          <SectionLabel icon="Cpu">{t("stats.agentsTitle")}</SectionLabel>
          {data.agents.length === 0 ? (
            <div style={s.empty}>{t("stats.noAgents")}</div>
          ) : (
            <ul style={s.agentList}>
              {data.agents.map((a) => (
                <li key={a.id}>
                  <Link href={`/agents/${a.id}`} style={s.agentRow}>
                    <span style={s.agentIcon}>
                      <Icon.Cpu size={13} />
                    </span>
                    <span style={s.agentName}>{a.name}</span>
                    <span style={s.agentOpen}>{t("stats.open")}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <SectionLabel icon="Layers">{t("stats.categoriesTitle")}</SectionLabel>
          {categories.length === 0 ? (
            <div style={s.empty}>{t("stats.noCategories")}</div>
          ) : (
            <CategoryDonut categories={categories} />
          )}
        </Card>
      </div>
    </div>
  );
}
