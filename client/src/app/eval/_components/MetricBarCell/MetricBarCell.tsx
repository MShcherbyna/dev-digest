/* MetricBarCell — a horizontal bar plus "82%" for one metric; "—" (no data) for null. */
import React from "react";
import { pct, NO_DATA } from "../../_lib/format";
import { s } from "./styles";

export function MetricBarCell({
  value,
  color,
  noDataLabel,
}: {
  value: number | null | undefined;
  color: string;
  /** Accessible label of the "—" placeholder (from messages). */
  noDataLabel: string;
}) {
  return (
    <div style={s.wrap}>
      <div style={s.track} aria-hidden>
        {value != null && <div style={s.fill(value, color)} />}
      </div>
      {value == null ? (
        <span className="mono tnum" style={s.value} aria-label={noDataLabel}>
          {NO_DATA}
        </span>
      ) : (
        <span className="mono tnum" style={s.value}>
          {pct(value)}
        </span>
      )}
    </div>
  );
}
