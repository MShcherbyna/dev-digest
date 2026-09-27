"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import { s } from "./styles";

export type FileOrder = "smart" | "original";

export function OrderHeader({
  filesCount,
  additions,
  deletions,
  order,
  onOrderChange,
}: {
  filesCount: number;
  additions: number;
  deletions: number;
  order: FileOrder;
  onOrderChange: (order: FileOrder) => void;
}) {
  const t = useTranslations("prReview");
  return (
    <div style={s.wrap}>
      <div style={s.eyebrow}>
        <Icon.Code size={12} style={s.eyebrowIcon} />
        {t("smartDiff.eyebrow")}
      </div>
      <div style={s.row}>
        <span style={s.stats}>
          {t("smartDiff.statsLine", { count: filesCount })}{" "}
          <span className="mono" style={s.add}>
            +{additions}
          </span>{" "}
          <span className="mono" style={s.del}>
            −{deletions}
          </span>
        </span>
        <span style={s.spacer} />
        <div role="group" aria-label={t("smartDiff.orderToggleLabel")} style={s.segmented}>
          <Button kind="ghost" size="sm" active={order === "smart"} onClick={() => onOrderChange("smart")}>
            {t("smartDiff.smartOrder")}
          </Button>
          <Button
            kind="ghost"
            size="sm"
            active={order === "original"}
            onClick={() => onOrderChange("original")}
          >
            {t("smartDiff.originalOrder")}
          </Button>
        </div>
      </div>
    </div>
  );
}
