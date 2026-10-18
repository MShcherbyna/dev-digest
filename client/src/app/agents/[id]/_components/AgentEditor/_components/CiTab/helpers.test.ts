import { describe, it, expect } from "vitest";
import { installation } from "@/test/ci-fixtures";
import { activeCount, pickUpdateTarget, relativeTime, rowStatus } from "./helpers";

describe("CiTab helpers", () => {
  it("counts active and outdated installations only", () => {
    // Catches: pending/removing rows inflating "Active in N repos" (AC-1).
    const list = [installation({ status: "active" }), installation({ status: "outdated" }), installation({ status: "pending" }), installation({ status: "removing" })];
    expect(activeCount(list)).toBe(2);
  });
  it("preselects the first outdated installation, else the first (AC-28)", () => {
    const a = installation({ id: "a" }), b = installation({ id: "b", status: "outdated" });
    expect(pickUpdateTarget([a, b])?.id).toBe("b");
    expect(pickUpdateTarget([a])?.id).toBe("a");
  });
  it("derives the row status and relative time", () => {
    expect(rowStatus({ last_run_status: null, mode: "manual" })).toEqual({ kind: "manualPending" });
    expect(rowStatus({ last_run_status: "failed", mode: "pr" })).toEqual({ kind: "run", status: "failed" });
    const now = Date.parse("2026-10-01T01:00:00Z");
    expect(relativeTime("2026-10-01T00:56:00Z", now)).toEqual({ unit: "minutesAgo", count: 4 });
    expect(relativeTime(null, now)).toBeNull();
  });
});
