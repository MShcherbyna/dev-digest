"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { StoredBrief } from "@/lib/hooks/brief";
import { s } from "./styles";

/** Muted one-liners under the banner: missing facts (AC-15), stale (AC-22), truncation (AC-30). */
export function BriefNotices({
  brief,
  stale,
  busy,
  onRegenerate,
}: {
  brief: StoredBrief;
  stale: boolean;
  busy: boolean;
  onRegenerate: () => void;
}) {
  const t = useTranslations("brief.panel");
  const hasNotice = brief.intent === null || brief.blast === null || stale || brief.truncated;
  if (!hasNotice) return null;
  return (
    <div style={s.wrap}>
      {brief.intent === null && <div style={s.note}>{t("missingIntent")}</div>}
      {brief.blast === null && <div style={s.note}>{t("missingBlast")}</div>}
      {brief.truncated && (
        <div style={s.note}>{t("truncated", { shown: brief.files_sent, total: brief.files_total })}</div>
      )}
      {stale && (
        <div style={s.note}>
          <span>{t("stale")}</span>
          <Button size="sm" kind="secondary" disabled={busy} onClick={onRegenerate}>
            {t("regenerate")}
          </Button>
        </div>
      )}
    </div>
  );
}
