/* VersionsTab — body history from /skills/:id/versions (newest first).
   The current version starts expanded; the others expand via Diff. Restore
   rolls back by creating a NEW version with the PREVIOUS version's text
   (v1 has no Restore). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Skeleton } from "@devdigest/ui";
import { useRestoreSkillVersion, useSkillVersions } from "@/lib/hooks/skills";
import { estimateTokens } from "@/lib/skill-format";
import { canRestore, formatVersionDate } from "./helpers";
import { s } from "./styles";

export function VersionsTab({ skillId, currentVersion }: { skillId: string; currentVersion: number }) {
  const t = useTranslations("skills");
  const { data, isLoading, isError, refetch } = useSkillVersions(skillId);
  const restore = useRestoreSkillVersion();
  const [toggled, setToggled] = React.useState<ReadonlySet<number>>(new Set());

  if (isLoading) return <Skeleton height={120} />;
  if (isError) return <ErrorState body={t("versions.loadError")} onRetry={() => refetch()} />;
  if (!data || data.length === 0) return <div style={s.empty}>{t("versions.empty")}</div>;

  const flip = (version: number) =>
    setToggled((prev) => {
      const next = new Set(prev);
      if (!next.delete(version)) next.add(version);
      return next;
    });

  return (
    <ul style={s.list}>
      {data.map((v) => {
        const isCurrent = v.version === currentVersion;
        // Current is open by default, everything else closed; `toggled` flips that.
        const open = isCurrent !== toggled.has(v.version);
        return (
          <li key={v.version} style={s.item}>
            <div style={s.row(open)}>
              <span className="mono" style={s.version}>
                {t("detail.version", { version: v.version })}
              </span>
              {isCurrent && (
                <Badge dot color="var(--ok)" bg="transparent">
                  {t("versions.current")}
                </Badge>
              )}
              <span style={s.meta}>{formatVersionDate(v.created_at)}</span>
              <span className="mono tnum" style={s.meta}>
                {t("versions.tokens", { count: estimateTokens(v.body) })}
              </span>
              <div style={s.actions}>
                <Button kind="secondary" size="sm" aria-expanded={open} onClick={() => flip(v.version)}>
                  {open ? t("versions.hide") : t("versions.diff")}
                </Button>
                {canRestore(v.version) && (
                  <Button
                    kind="secondary"
                    size="sm"
                    disabled={restore.isPending}
                    onClick={() => {
                      if (window.confirm(t("versions.restoreConfirm", { version: v.version, previous: v.version - 1 }))) {
                        restore.mutate({ id: skillId, version: v.version });
                      }
                    }}
                  >
                    {t("versions.restore")}
                  </Button>
                )}
              </div>
            </div>
            {open && (
              <pre className="mono" style={s.body}>
                {v.body}
              </pre>
            )}
          </li>
        );
      })}
    </ul>
  );
}
