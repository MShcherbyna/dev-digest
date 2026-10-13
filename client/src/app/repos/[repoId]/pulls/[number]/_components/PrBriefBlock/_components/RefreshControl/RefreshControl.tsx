"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";

/** The banner's refresh icon; shows "Generating…" and is disabled while a run is in flight (AC-17, AC-23). */
export function RefreshControl({ generating, onClick }: { generating: boolean; onClick: () => void }) {
  const t = useTranslations("brief.panel");
  return (
    <Button
      kind="tertiary"
      size="sm"
      icon="RefreshCw"
      loading={generating}
      aria-label={generating ? undefined : t("regenerateLabel")}
      title={generating ? undefined : t("regenerateLabel")}
      onClick={onClick}
    >
      {generating ? t("generating") : undefined}
    </Button>
  );
}
