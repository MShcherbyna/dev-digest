/* EvalLoadError — inline load failure with a retry button. The vendored ErrorState hard-codes
   its English "Retry" label (client/INSIGHTS.md), so this uses Button + a message-file label. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";

export function EvalLoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const t = useTranslations("eval.dashboard");
  return (
    <div
      role="alert"
      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "48px 28px", textAlign: "center" }}
    >
      <Icon.AlertTriangle size={22} style={{ color: "var(--crit)" }} />
      <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>{message}</div>
      <Button size="sm" icon="RefreshCw" onClick={onRetry}>
        {t("retry")}
      </Button>
    </div>
  );
}
