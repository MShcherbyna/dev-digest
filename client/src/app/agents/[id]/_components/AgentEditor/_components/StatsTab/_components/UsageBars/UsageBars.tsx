/* UsageBars — label · horizontal bar · right-aligned percent rows. Shared by
   the most-used skills and most-pulled memory panels. */
import React from "react";
import { clampPct } from "../../helpers";
import { formatPct } from "@/lib/skill-format";
import { s } from "./styles";

export interface UsageRow {
  key: string;
  label: string;
  pct: number;
  /** Render the row dimmed (e.g. a disabled skill). */
  dim?: boolean;
  /** Title/tooltip for the label. */
  hint?: string;
}

export interface UsageBarsProps {
  rows: readonly UsageRow[];
  /** Bar fill colour (CSS colour / token). */
  color: string;
  /** Monospace labels (skill names). */
  mono?: boolean;
  /** Shown instead of the list when there are no rows. */
  emptyLabel: string;
}

export function UsageBars({ rows, color, mono = false, emptyLabel }: UsageBarsProps) {
  if (rows.length === 0) return <div style={s.empty}>{emptyLabel}</div>;
  return (
    <ul style={s.list}>
      {rows.map((r) => (
        <li key={r.key} style={s.row(r.dim)}>
          <span className={mono ? "mono" : undefined} style={s.label} title={r.hint ?? r.label}>
            {r.label}
          </span>
          <span style={s.track} aria-hidden>
            <span style={s.fill(clampPct(r.pct), color)} />
          </span>
          <span className="mono tnum" style={s.pct}>
            {formatPct(r.pct)}
          </span>
        </li>
      ))}
    </ul>
  );
}
