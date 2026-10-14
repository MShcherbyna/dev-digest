/* Formatters shared by the all-agents and per-agent eval dashboards. Fractions in, strings out. */

export const NO_DATA = "—";

/** 0.82 -> "82%"; null -> "—". */
export function pct(v: number | null | undefined): string {
  return v == null ? NO_DATA : `${Math.round(v * 100)}%`;
}

/** Whole-point delta of two fractions (a delta fraction 0.04 -> 4); null stays null. */
export function points(delta: number | null | undefined): number | null {
  return delta == null ? null : Math.round(delta * 100);
}

/** 0.2345 -> "$0.23"; null -> "—". */
export function usd(v: number | null | undefined): string {
  return v == null ? NO_DATA : `$${v.toFixed(2)}`;
}

const two = (n: number) => String(n).padStart(2, "0");

/** ISO timestamp -> "YYYY-MM-DD HH:mm" in the viewer's local time. */
export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return NO_DATA;
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
}
