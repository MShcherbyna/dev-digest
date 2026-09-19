/* StatsTab — usage tiles, agents using the skill, findings-by-category donut.
   Nulls render as "—"; nothing is fabricated when there is no data. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { PieChart, Pie, Cell } from "recharts";
import { CircularScore, ErrorState, SectionLabel, Skeleton } from "@devdigest/ui";
import { useSkillStats } from "@/lib/hooks/skills";
import { formatPct } from "@/lib/skill-format";
import { categoryColor, DONUT_SIZE, DONUT_STROKE } from "./constants";
import { s } from "./styles";

function Tile({ label, value, ring }: { label: string; value: string; ring?: number | null }) {
  return (
    <div style={s.tile}>
      <div style={s.tileLabel}>{label}</div>
      <div style={s.tileValueRow}>
        <span className="tnum" style={s.tileValue}>
          {value}
        </span>
        {ring != null && <CircularScore score={ring} size={36} />}
      </div>
    </div>
  );
}

export function StatsTab({ skillId }: { skillId: string }) {
  const t = useTranslations("skills");
  const { data, isLoading, isError, refetch } = useSkillStats(skillId);

  if (isLoading) return <Skeleton height={160} />;
  if (isError || !data) return <ErrorState body={t("stats.loadError")} onRetry={() => refetch()} />;

  const segments = data.by_category.filter((c) => c.count > 0);

  return (
    <div style={s.wrap}>
      <div style={s.tiles}>
        <Tile label={t("stats.usedBy")} value={String(data.used_by)} />
        <Tile label={t("stats.pull")} value={formatPct(data.pull_pct)} />
        <Tile label={t("stats.accept")} value={formatPct(data.accept_pct)} ring={data.accept_pct} />
        <Tile label={t("stats.findings")} value={String(data.findings_30d)} />
      </div>

      <section>
        <SectionLabel>{t("stats.agentsTitle")}</SectionLabel>
        {data.agents.length === 0 ? (
          <div style={s.empty}>{t("stats.noAgents")}</div>
        ) : (
          <ul style={s.agentList}>
            {data.agents.map((a) => (
              <li key={a.id}>
                <Link href={`/agents/${a.id}`} style={s.agentLink}>
                  {a.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionLabel>{t("stats.categoriesTitle")}</SectionLabel>
        {segments.length === 0 ? (
          <div style={s.empty}>{t("stats.noCategories")}</div>
        ) : (
          <div style={s.donutRow}>
            <PieChart width={DONUT_SIZE} height={DONUT_SIZE}>
              <Pie
                data={segments}
                dataKey="count"
                nameKey="category"
                cx="50%"
                cy="50%"
                innerRadius={(DONUT_SIZE - DONUT_STROKE) / 2 - DONUT_STROKE / 2}
                outerRadius={(DONUT_SIZE - DONUT_STROKE) / 2 + DONUT_STROKE / 2}
                startAngle={90}
                endAngle={-270}
                isAnimationActive={false}
                stroke="none"
              >
                {segments.map((c, i) => (
                  <Cell key={c.category} fill={categoryColor(i)} />
                ))}
              </Pie>
            </PieChart>
            <ul style={s.legend}>
              {segments.map((c, i) => (
                <li key={c.category} style={s.legendRow}>
                  <span style={s.swatch(categoryColor(i))} />
                  <span style={s.legendLabel}>{c.category}</span>
                  <span className="mono tnum" style={s.legendValue}>
                    {c.count}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
