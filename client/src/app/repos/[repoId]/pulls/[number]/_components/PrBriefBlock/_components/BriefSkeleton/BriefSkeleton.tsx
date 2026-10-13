"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Skeleton } from "@devdigest/ui";
import { s } from "./styles";

/**
 * Plain loading: three placeholders (banner, risk areas, review focus). `busy`
 * marks a first generation in progress (AC-40): banner and review-focus
 * placeholders wrap `children` (the Intent/Blast cards, whose Risk areas slot
 * carries its own placeholder), so Risk areas is not duplicated.
 */
export function BriefSkeleton({ busy, children }: { busy?: boolean; children?: React.ReactNode }) {
  const t = useTranslations("brief.panel");
  return (
    <div style={s.wrap} aria-busy={busy ? true : undefined} aria-label={busy ? t("busyLabel") : undefined}>
      <Skeleton height={96} />
      {busy ? children : <Skeleton height={140} />}
      <Skeleton height={110} />
    </div>
  );
}
