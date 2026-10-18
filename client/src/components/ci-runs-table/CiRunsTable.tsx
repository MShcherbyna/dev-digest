/* CiRunsTable — the CI runs list shared by the CI Runs page and an agent's CI tab (AC-29, AC-30).
   Owns the four states: loading skeleton, error with Retry, empty, rows. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Skeleton } from "@devdigest/ui";
import type { CiRun } from "@devdigest/shared";
import { COLUMNS } from "./constants";
import { CiRunRow } from "./_components/CiRunRow";
import { s } from "./styles";

export function CiRunsTable({
  runs,
  isLoading,
  isError,
  onRetry,
  empty,
}: {
  /** `undefined` until the first load completes. */
  runs: CiRun[] | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  /** Rendered instead of the table when the list is empty. */
  empty: React.ReactNode;
}) {
  const t = useTranslations("ci.runs");

  if (isLoading) {
    return (
      <div style={{ ...s.scroll, ...s.skeletons }} aria-busy="true">
        <Skeleton height={36} />
        <Skeleton height={36} />
        <Skeleton height={36} />
      </div>
    );
  }
  if (isError) {
    return (
      <div role="alert" style={s.errorBox}>
        <span>{t("loadError")}</span>
        <Button kind="secondary" size="sm" icon="RefreshCw" onClick={onRetry}>
          {t("retry")}
        </Button>
      </div>
    );
  }
  if (!runs || runs.length === 0) return <>{empty}</>;

  return (
    <div style={s.scroll}>
      <div role="table" aria-label={t("table.label")} style={s.inner}>
        <div role="row" style={s.head}>
          {COLUMNS.map((c) => (
            <div key={c} role="columnheader">
              {t(`table.${c}`)}
            </div>
          ))}
        </div>
        {runs.map((r, i) => (
          <CiRunRow key={r.id} run={r} divider={i < runs.length - 1} />
        ))}
      </div>
    </div>
  );
}
