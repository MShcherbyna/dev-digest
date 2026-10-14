import type { TrendPoint } from "@/lib/hooks/eval";

export interface SeriesPoint {
  run_id: string;
  recall: number | null;
  precision: number | null;
  citation_accuracy: number | null;
}

/** Chart rows in chronological order. Nulls stay null so recharts leaves a gap instead of drawing 0. */
export function buildSeries(trend: TrendPoint[]): SeriesPoint[] {
  return [...trend]
    .sort((a, b) => a.started_at.localeCompare(b.started_at))
    .map(({ run_id, recall, precision, citation_accuracy }) => ({ run_id, recall, precision, citation_accuracy }));
}

/** Y domain: 0.6 to 1.0 by default, widened (floored to 0.1) when a value falls below 0.6. */
export function yDomain(series: SeriesPoint[]): [number, number] {
  const values = series.flatMap((p) => [p.recall, p.precision, p.citation_accuracy]).filter((v): v is number => v != null);
  const lowest = values.length ? Math.min(...values) : 1;
  const floor = Math.floor(Math.round(lowest * 100) / 10) / 10;
  return [Math.min(0.6, floor), 1];
}

/** Ticks every 0.1 across the domain. */
export function yTicks([lo, hi]: [number, number]): number[] {
  const out: number[] = [];
  for (let i = Math.round(lo * 10); i <= Math.round(hi * 10); i++) out.push(i / 10);
  return out;
}
