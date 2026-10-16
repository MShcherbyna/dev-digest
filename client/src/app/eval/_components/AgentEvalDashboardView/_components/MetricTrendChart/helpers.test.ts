import { describe, it, expect } from "vitest";
import { trendPoint } from "@/test/eval-fixtures";
import { buildSeries, yDomain, yTicks } from "./helpers";

describe("MetricTrendChart helpers", () => {
  it("orders chronologically and keeps null as null (a gap), never 0", () => {
    // Catches: nulls coerced to 0 (a false cliff on the chart) and a newest-first API order
    // being drawn right-to-left.
    const series = buildSeries([
      trendPoint({ run_id: "late", started_at: "2026-10-10T10:00:00.000Z", recall: 0.9 }),
      trendPoint({ run_id: "early", started_at: "2026-10-01T10:00:00.000Z", recall: null, precision: 0.8 }),
    ]);
    expect(series.map((p) => p.run_id)).toEqual(["early", "late"]);
    expect(series[0]!.recall).toBeNull();
    expect(series[0]!.precision).toBe(0.8);
  });

  it("keeps the 0.6-1.0 domain, widens it for a lower value, and ignores nulls", () => {
    // Catches: a value below 0.6 clipped off the chart, a null (treated as 0) dragging the
    // floor to 0, and ticks not covering the domain.
    const base = buildSeries([trendPoint({ recall: 0.9, precision: 0.7, citation_accuracy: null })]);
    expect(yDomain(base)).toEqual([0.6, 1]);

    const low = buildSeries([trendPoint({ recall: 0.52, precision: 0.9, citation_accuracy: null })]);
    expect(yDomain(low)).toEqual([0.5, 1]);
    expect(yTicks(yDomain(low))).toEqual([0.5, 0.6, 0.7, 0.8, 0.9, 1]);

    expect(yDomain([])).toEqual([0.6, 1]);
    expect(yDomain(buildSeries([trendPoint({ recall: null, precision: null, citation_accuracy: null })]))).toEqual([0.6, 1]);
  });
});
