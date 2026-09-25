import { describe, it, expect } from "vitest";
import type { FindingRecord } from "@devdigest/shared";
import { partitionFindings, worstSeverity } from "./findings";

function finding(overrides: Partial<FindingRecord>): FindingRecord {
  return {
    id: "f1",
    severity: "WARNING",
    category: "bug",
    title: "t",
    file: "a.ts",
    start_line: 10,
    end_line: 10,
    rationale: "r",
    confidence: 0.8,
    kind: "finding",
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...overrides,
  };
}

describe("partitionFindings", () => {
  it("matches a finding keyed on RIGHT:start_line when the line is rendered", () => {
    const f = finding({ id: "f1", start_line: 10 });
    const { matched, unanchored } = partitionFindings([f], new Set(["RIGHT:10"]));
    expect(matched.get("RIGHT:10")).toEqual([f]);
    expect(unanchored).toHaveLength(0);
  });

  it("puts a finding whose line isn't rendered into unanchored", () => {
    const f = finding({ id: "f2", start_line: 999 });
    const { matched, unanchored } = partitionFindings([f], new Set(["RIGHT:10"]));
    expect(matched.size).toBe(0);
    expect(unanchored).toEqual([f]);
  });

  it("groups two findings anchored to the same line under one key", () => {
    const a = finding({ id: "f1", start_line: 10 });
    const b = finding({ id: "f2", start_line: 10 });
    const { matched } = partitionFindings([a, b], new Set(["RIGHT:10"]));
    expect(matched.get("RIGHT:10")).toEqual([a, b]);
  });
});

describe("worstSeverity", () => {
  it("returns the highest-ranked severity among the findings", () => {
    const findings = [finding({ severity: "SUGGESTION" }), finding({ severity: "CRITICAL" }), finding({ severity: "WARNING" })];
    expect(worstSeverity(findings)).toBe("CRITICAL");
  });
});
