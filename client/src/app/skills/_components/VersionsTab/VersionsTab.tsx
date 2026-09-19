/* VersionsTab — body history from /skills/:id/versions (newest first). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, ErrorState, Skeleton } from "@devdigest/ui";
import { useSkillVersions } from "@/lib/hooks/skills";
import { estimateTokens } from "@/lib/skill-format";
import { formatVersionDate } from "./helpers";
import { s } from "./styles";

export function VersionsTab({ skillId, currentVersion }: { skillId: string; currentVersion: number }) {
  const t = useTranslations("skills");
  const { data, isLoading, isError, refetch } = useSkillVersions(skillId);

  if (isLoading) return <Skeleton height={120} />;
  if (isError) return <ErrorState body={t("versions.loadError")} onRetry={() => refetch()} />;
  if (!data || data.length === 0) return <div style={s.empty}>{t("versions.empty")}</div>;

  return (
    <ul style={s.list}>
      {data.map((v) => (
        <li key={v.version} style={s.item}>
          <div style={s.row}>
            <span className="mono" style={s.version}>
              {t("detail.version", { version: v.version })}
            </span>
            {v.version === currentVersion && <Badge color="var(--ok)">{t("versions.current")}</Badge>}
            <span style={s.meta}>{formatVersionDate(v.created_at)}</span>
            <span className="mono tnum" style={s.meta}>
              {t("versions.tokens", { count: estimateTokens(v.body) })}
            </span>
          </div>
          <pre className="mono" style={s.body}>
            {v.body}
          </pre>
        </li>
      ))}
    </ul>
  );
}
