"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import { s } from "./styles";

export type BriefErrorKind = "missingKey" | "generic" | "load";

/** Inline failure line (AC-24): missing key links to Settings → API Keys; the rest offer Retry. */
export function BriefError({ kind, onRetry }: { kind: BriefErrorKind; onRetry?: () => void }) {
  const t = useTranslations("brief.panel");
  return (
    <div role="alert" style={s.wrap}>
      <Icon.AlertOctagon size={14} aria-hidden style={s.icon} />
      {kind === "missingKey" ? (
        <span>
          {t("error.missingKeyBody")}{" "}
          <Link href="/settings/api-keys" style={s.link}>
            {t("error.apiKeysLink")}
          </Link>
        </span>
      ) : (
        <span>{kind === "load" ? t("loadError") : t("error.generic")}</span>
      )}
      {kind !== "missingKey" && onRetry && (
        <Button size="sm" kind="secondary" icon="RefreshCw" onClick={onRetry}>
          {t("retry")}
        </Button>
      )}
    </div>
  );
}
