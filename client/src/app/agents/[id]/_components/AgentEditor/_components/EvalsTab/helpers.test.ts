import { describe, it, expect } from "vitest";
import type { EvalAgentRun, EvalCaseSummary, ExpectedItem } from "@/lib/hooks/eval";
import { deltaPoints, formatPct, latestTwoFinished, passingBadge, rowLabel, rowStatus } from "./helpers";

const run = (o: Partial<EvalAgentRun>): EvalAgentRun => ({ id: "r", status: "done", recall: 0.5, ...o }) as EvalAgentRun;
const kase = (status?: string): EvalCaseSummary =>
  ({ id: "c", latest_result: status ? { status } : null }) as unknown as EvalCaseSummary;

describe("EvalsTab helpers", () => {
  it("rowLabel: first must_find wins, absent parts are omitted, no chip when both are absent", () => {
    // Catches: a "must_not_flag" item hijacking the chip, a dangling " · " separator, or an empty chip (answer 6).
    const nf: ExpectedItem = { expect: "must_not_flag", file: "a.ts", start_line: 1, severity: "CRITICAL" };
    const mf = (o: Partial<ExpectedItem>): ExpectedItem => ({ expect: "must_find", file: "a.ts", start_line: 1, ...o });
    expect(rowLabel([])).toEqual({ kind: "empty" });
    expect(rowLabel([nf])).toEqual({ kind: "mustNotFlag" });
    expect(rowLabel([nf, mf({ severity: "WARNING", category: "bug" })])).toEqual({ kind: "expectation", text: "WARNING · bug" });
    expect(rowLabel([mf({ category: "bug" })])).toEqual({ kind: "expectation", text: "bug" });
    expect(rowLabel([mf({ severity: "CRITICAL" })])).toEqual({ kind: "expectation", text: "CRITICAL" });
    expect(rowLabel([mf({})])).toBeNull();
  });

  it("rowStatus / passingBadge count only passed cases and treat unrun cases as never", () => {
    // Catches: failed/error/running cases counted as passing in the "x / y passing" badge.
    const cases = [kase("passed"), kase("failed"), kase("error"), kase("running"), kase()];
    expect(rowStatus(cases[4]!)).toBe("never");
    expect(passingBadge(cases)).toEqual({ passed: 1, total: 5 });
    expect(passingBadge([])).toEqual({ passed: 0, total: 0 });
  });

  it("latestTwoFinished skips running and failed runs and keeps newest-first order", () => {
    // Catches: deltas computed against a failed/running run whose metrics are null/partial.
    const runs = [
      run({ id: "a", status: "running" }),
      run({ id: "b", status: "partial" }),
      run({ id: "c", status: "failed" }),
      run({ id: "d", status: "done" }),
      run({ id: "e", status: "done" }),
    ];
    const [latest, prev] = latestTwoFinished(runs);
    expect([latest?.id, prev?.id]).toEqual(["b", "d"]);
    expect(latestTwoFinished(undefined)).toEqual([null, null]);
    const [only, none] = latestTwoFinished([run({ id: "x" })]);
    expect(only?.id).toBe("x");
    expect(none).toBeNull();
  });

  it("deltaPoints rounds to whole points and is null when either side is missing; formatPct renders the dash", () => {
    // Catches: float noise in deltas, and a null metric shown as 0%.
    expect(deltaPoints(0.8, 0.6)).toBe(20);
    expect(deltaPoints(0.5, 0.8)).toBe(-30);
    expect(deltaPoints(0.3, 0.1)).toBe(20);
    expect(deltaPoints(null, 0.5)).toBeNull();
    expect(deltaPoints(0.5, undefined)).toBeNull();
    expect(formatPct(0.857)).toBe("86%");
    expect(formatPct(0)).toBe("0%");
    expect(formatPct(null)).toBe("—");
  });
});
