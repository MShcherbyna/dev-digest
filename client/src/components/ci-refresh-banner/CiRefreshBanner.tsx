/* CiRefreshBanner — non-blocking "Couldn't refresh CI runs" notice with Retry (AC-24).
   Stored runs stay visible underneath; this only reports the failed pull. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import { s } from "./styles";

export function CiRefreshBanner({ onRetry, retrying }: { onRetry: () => void; retrying?: boolean }) {
  const t = useTranslations("ci.runs");
  return (
    <div role="alert" style={s.banner}>
      <Icon.AlertTriangle size={15} style={s.icon} />
      <span style={s.text}>{t("refreshError")}</span>
      <Button kind="secondary" size="sm" icon="RefreshCw" onClick={onRetry} loading={retrying}>
        {t("retry")}
      </Button>
    </div>
  );
}
