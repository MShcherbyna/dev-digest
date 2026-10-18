/* PrStep — step 1 of Configure run: pick the PR to review (S2/S3). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SearchableSelect, Button } from "@devdigest/ui";
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

  const prById = new Map((pulls ?? []).filter((p): p is PrMeta & { id: string } => !!p.id).map((p) => [p.id, p]));
  const options = [...prById.values()].map((p) => ({ value: p.id, label: t("page.prItem", { number: p.number, title: p.title }) }));

  return (
    <SearchableSelect
      value={selectedPrId ?? ""}
      onChange={(id) => {
        const p = prById.get(id);
        if (p) onSelect(id, p);
      }}
      options={options}
      placeholder={t("configure.selectPrPlaceholder")}
      mono={false}
    />
  );
}
