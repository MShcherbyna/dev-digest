"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import { s } from "./styles";

/** No brief stored yet: a single call to action (AC-10, AC-29). */
export function BriefEmptyState({ onGenerate, disabled }: { onGenerate: () => void; disabled?: boolean }) {
  const t = useTranslations("brief.panel");
  return (
    <div style={s.wrap}>
      <Icon.FileText size={22} aria-hidden style={s.icon} />
      <div style={s.title}>{t("emptyTitle")}</div>
      <div style={s.hint}>{t("emptyHint")}</div>
      <Button kind="primary" size="sm" icon="Sparkles" disabled={disabled} onClick={onGenerate}>
        {t("generate")}
      </Button>
    </div>
  );
}
