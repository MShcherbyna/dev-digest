/* PrStep — step 1 of Configure run: pick the PR to review (S2/S3). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Dropdown, Icon, Button, type DropdownItemDef } from "@devdigest/ui";
import { usePulls } from "@/lib/hooks";
import type { PrMeta } from "@/lib/types";

export function PrStep({
  repoId,
  selectedPrId,
  onSelect,
}: {
  repoId: string | null;
  selectedPrId: string | null;
  onSelect: (prId: string, pr: PrMeta) => void;
}) {
  const t = useTranslations("runs");
  const { data: pulls, isError, refetch } = usePulls(repoId);
  const selected = (pulls ?? []).find((p) => p.id === selectedPrId) ?? null;

  if (isError) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 13, color: "var(--crit)" }}>{t("configure.prListError")}</span>
        <Button kind="secondary" size="sm" icon="RefreshCw" onClick={() => void refetch()}>
          {t("configure.retry")}
        </Button>
      </div>
    );
  }

  const items: DropdownItemDef[] = (pulls ?? [])
    .filter((p): p is PrMeta & { id: string } => !!p.id)
    .map((p) => ({
      label: t("page.prItem", { number: p.number, title: p.title }),
      icon: "GitPullRequest" as const,
      onClick: () => onSelect(p.id, p),
    }));

  return (
    <Dropdown
      width={360}
      items={items.length ? items : [{ label: t("configure.selectPrPlaceholder"), muted: true }]}
      trigger={
        <button
          type="button"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "9px 14px",
            borderRadius: 7,
            border: "1px solid var(--border-strong)",
            background: "var(--bg-elevated)",
            color: "var(--text-primary)",
            fontSize: 13.5,
            cursor: "pointer",
          }}
        >
          <Icon.GitPullRequest size={14} style={{ color: "var(--text-muted)" }} />
          {selected ? t("page.prItem", { number: selected.number, title: selected.title }) : t("configure.selectPrPlaceholder")}
          <Icon.ChevronDown size={14} style={{ color: "var(--text-muted)" }} />
        </button>
      }
    />
  );
}
