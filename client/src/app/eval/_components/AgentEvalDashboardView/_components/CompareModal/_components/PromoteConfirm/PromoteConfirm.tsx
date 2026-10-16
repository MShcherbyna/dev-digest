/* PromoteConfirm — the confirm step shown in the Compare modal footer before a promote is sent. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";

export function PromoteConfirm({
  version,
  pending,
  onConfirm,
  onCancel,
}: {
  version: number;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("eval.compare");
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{t("confirmTitle", { version })}</div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{t("confirmBody")}</div>
      </div>
      <Button onClick={onCancel} disabled={pending}>
        {t("cancel")}
      </Button>
      <Button kind="primary" icon="GitBranch" onClick={onConfirm} loading={pending}>
        {t("confirm")}
      </Button>
    </div>
  );
}
