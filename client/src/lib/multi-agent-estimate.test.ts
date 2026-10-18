import { describe, expect, it } from "vitest";
import {
  agentEstimate,
  combineEstimates,
  defaultSelection,
  formatCombinedEstimate,
  formatEstimate,
} from "./multi-agent-estimate";
import type { AgentUsageStats } from "@devdigest/shared";

function stats(partial: Partial<AgentUsageStats>): AgentUsageStats {
  return {
    runs_30d: 10,
    runs_trend: [],
    accept_pct: null,
    avg_cost_usd: 0.05,
    cost_delta_usd: null,
    avg_duration_ms: 8000,
    findings_30d: 0,
    skill_usage: [],
    memory_usage: [],
    severity_weekly: [],
    by_category: [],
    recent_runs: [],
    ...partial,
  };
}

describe("agentEstimate", () => {
  it("returns null when runs_30d is 0 (AC-11 no estimate yet)", () => {
    expect(agentEstimate(stats({ runs_30d: 0 }))).toBeNull();
  });

  it("returns null when stats are missing", () => {
    expect(agentEstimate(null)).toBeNull();
  });

  it("returns ms/usd from avg_duration_ms/avg_cost_usd", () => {
    expect(agentEstimate(stats({ avg_duration_ms: 8200, avg_cost_usd: 0.06 }))).toEqual({
      ms: 8200,
      usd: 0.06,
    });
  });
});

describe("formatEstimate", () => {
  it("formats 8.2s · $0.06", () => {
    expect(formatEstimate({ ms: 8200, usd: 0.06 })).toBe("8.2s · $0.06");
  });
});

describe("combineEstimates / formatCombinedEstimate", () => {
  it("AC-12: 8.2s/$0.06 + 7.4s/$0.05 + 6.9s/$0.04 -> ≈ 8.2s · $0.15", () => {
    const combined = combineEstimates([
      { ms: 8200, usd: 0.06 },
      { ms: 7400, usd: 0.05 },
      { ms: 6900, usd: 0.04 },
    ]);
    expect(combined.missing).toBe(0);
    expect(formatCombinedEstimate(combined)).toBe("≈ 8.2s · $0.15");
  });

  it("one agent without history renders a partial estimate", () => {
    const combined = combineEstimates([{ ms: 8200, usd: 0.06 }, { ms: 7400, usd: 0.05 }, null]);
    expect(combined.missing).toBe(1);
    expect(formatCombinedEstimate(combined)).toBe("≥ $0.11 · 1 without history");
  });

  it("no agent has history at all", () => {
    const combined = combineEstimates([null, null]);
    expect(formatCombinedEstimate(combined)).toBe("2 without history");
  });
});

describe("defaultSelection", () => {
  it("AC-10: uses the last selection filtered to enabled agents", () => {
    expect(defaultSelection(["a", "b", "c"], ["b", "c"])).toEqual(["b", "c"]);
  });

  it("falls back to every enabled agent when there is no last selection", () => {
    expect(defaultSelection(["a", "b"], null)).toEqual(["a", "b"]);
  });

  it("falls back to every enabled agent when the last selection has none left enabled", () => {
    expect(defaultSelection(["a", "b"], ["z"])).toEqual(["a", "b"]);
  });

  it("caps at MAX_AGENTS", () => {
    const enabled = Array.from({ length: 10 }, (_, i) => `a${i}`);
    expect(defaultSelection(enabled, null)).toHaveLength(8);
  });
});
