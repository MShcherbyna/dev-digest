"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { useResyncAndRefresh } from "@/lib/hooks/repo-intel";

const errorStyle = { fontSize: 12, color: "var(--text-muted)" } satisfies React.CSSProperties;

/** Re-indexes the repo and, once the index state advances, refetches the blast map. */
export function ResyncButton({ repoId }: { repoId: string }) {
  const t = useTranslations("blast.degraded");
  const { start, pending, isError } = useResyncAndRefresh(repoId);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
      {isError && (
        <span role="alert" style={errorStyle}>
          {t("resyncFailed")}
        </span>
      )}
      <Button size="sm" kind="secondary" disabled={pending} onClick={start}>
        {pending ? t("resyncing") : t("resync")}
      </Button>
    </span>
  );
}
