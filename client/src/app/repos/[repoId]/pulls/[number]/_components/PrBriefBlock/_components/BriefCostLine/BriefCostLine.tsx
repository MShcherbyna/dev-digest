"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { formatCost } from "@/lib/format";
import type { StoredBrief } from "@/lib/hooks/brief";
import { costText, formatTokensK } from "../../helpers";
import { s } from "./styles";

/** "$ $0.014 8.2K→1.3K" under the score (AC-25). Hidden when the cost is unknown. */
export function BriefCostLine({ brief }: { brief: StoredBrief }) {
  const t = useTranslations("brief.panel");
  const text = costText(brief);
  if (text === null) return null;
  const [cost, ...tokens] = text.split(" ");
  const label = t("costLabel", {
    cost: formatCost(brief.cost_usd),
    in: brief.tokens_in == null ? "—" : formatTokensK(brief.tokens_in),
    out: brief.tokens_out == null ? "—" : formatTokensK(brief.tokens_out),
  });
  return (
    <span className="mono tnum" role="img" aria-label={label} style={s.wrap}>
      <Icon.DollarSign size={12} aria-hidden style={s.icon} />
      <span style={s.cost}>{cost}</span>
      {tokens.length > 0 && <span style={s.tokens}>{tokens.join(" ")}</span>}
    </span>
  );
}
