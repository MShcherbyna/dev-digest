import type { EvalMetric, TrendPoint } from "@/lib/hooks/eval";

/** A metric's values over the runs, nulls dropped. MetricCard's Sparkline needs >= 2 points. */
export function sparkValues(trend: TrendPoint[], metric: EvalMetric): number[] | undefined {
  const values = trend.map((p) => p[metric]).filter((v): v is number => v != null);
  return values.length >= 2 ? values : undefined;
}
