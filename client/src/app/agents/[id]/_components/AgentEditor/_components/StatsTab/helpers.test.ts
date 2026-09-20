import { describe, it, expect } from "vitest";
import { clampPct, formatCost, formatCostDelta, formatDuration, formatTimestamp, formatTokens } from "./helpers";

describe("stats helpers", () => {
  it("formats cost and cost delta", () => {
    expect(formatCost(0.0412)).toBe("$0.04");
    expect(formatCost(0.003)).toBe("$0.003");
    expect(formatCost(0)).toBe("$0.00");
    expect(formatCost(null)).toBe("—");
    expect(formatCostDelta(0.012)).toBe("+$0.01");
    expect(formatCostDelta(-0.02)).toBe("-$0.02");
    expect(formatCostDelta(0)).toBeNull();
    expect(formatCostDelta(null)).toBeNull();
  });

  it("formats tokens compactly", () => {
    expect(formatTokens(950)).toBe("950");
    expect(formatTokens(16_000)).toBe("16k");
    expect(formatTokens(1_250)).toBe("1.3k");
    expect(formatTokens(2_500_000)).toBe("2.5M");
    expect(formatTokens(null)).toBe("—");
  });

  it("formats durations", () => {
    expect(formatDuration(850)).toBe("850ms");
    expect(formatDuration(6200)).toBe("6.2s");
    expect(formatDuration(65_000)).toBe("1m 5s");
    expect(formatDuration(null)).toBe("—");
  });

  it("formats timestamps in local time and clamps percentages", () => {
    expect(formatTimestamp(new Date(2026, 5, 1, 9, 14).toISOString())).toBe("2026-06-01 09:14");
    expect(formatTimestamp("not a date")).toBe("—");
    expect(clampPct(140)).toBe(100);
    expect(clampPct(-5)).toBe(0);
    expect(clampPct(92)).toBe(92);
  });
});
