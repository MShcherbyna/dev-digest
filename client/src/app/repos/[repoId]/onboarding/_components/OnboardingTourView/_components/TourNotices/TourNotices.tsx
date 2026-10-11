"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import { s } from "./styles";

/** Text rows (icon + words, never colour only) for partial index, stale and not cloned. */
export function TourNotices({
  partial,
  stale,
  cloned,
  generating,
  onRegenerate,
}: {
  partial: boolean;
  stale: boolean;
  cloned: boolean;
  generating: boolean;
  onRegenerate: () => void;
}) {
  const t = useTranslations("onboarding");
  if (!partial && !stale && cloned) return null;
  return (
    <div style={s.list}>
      {!cloned && (
        <div role="status" style={s.row}>
          <Icon.Info size={14} />
          <span>{t("notices.notCloned")}</span>
        </div>
      )}
      {partial && (
        <div role="status" style={s.row}>
          <Icon.AlertTriangle size={14} />
          <span>{t("notices.partial")}</span>
        </div>
      )}
      {stale && (
        <div role="status" style={s.row}>
          <Icon.AlertTriangle size={14} />
          <span>{t("notices.stale")}</span>
          {cloned && (
            <Button kind="tertiary" size="sm" onClick={onRegenerate} disabled={generating}>
              {t("regenerate")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
