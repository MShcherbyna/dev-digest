/* RangeFilter — date-range dropdown ("30 days" in screenshot 4). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Dropdown } from "@devdigest/ui";
import type { EvalRange } from "@/lib/hooks/eval";
import { RANGES } from "../../constants";

export function RangeFilter({ range, onChange }: { range: EvalRange; onChange: (r: EvalRange) => void }) {
  const t = useTranslations("eval.agentDashboard");
  return (
    <Dropdown
      width={160}
      align="right"
      trigger={
        <Button icon="Calendar" aria-label={`${t("rangeLabel")}: ${t(`range.${range}`)}`}>
          {t(`range.${range}`)}
        </Button>
      }
      items={RANGES.map((r) => ({ label: t(`range.${r}`), hint: r === range ? "✓" : undefined, onClick: () => onChange(r) }))}
    />
  );
}
