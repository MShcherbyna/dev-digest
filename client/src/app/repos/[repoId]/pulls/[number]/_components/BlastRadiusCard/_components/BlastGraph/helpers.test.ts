import { describe, it, expect } from "vitest";
import { layoutGraph, truncate } from "./helpers";
import { NODE_H, ROW_H } from "./constants";

const GROUP = {
  symbol: "rateLimit",
  callers: [
    { name: "publicRouter", file: "a.ts", line: 1 },
    { name: "app", file: "b.ts", line: 2 },
    { name: "healthCheck", file: "c.ts", line: 3 },
  ],
  endpoints_affected: ["GET /api/public/items"],
  crons_affected: ["reset-rate-buckets (hourly)"],
};

describe("layoutGraph", () => {
  it("builds three columns with symbol->caller and caller->target edges", () => {
    const g = layoutGraph(GROUP, "rateLimit()", 560);
    expect(g.callers).toHaveLength(3);
    expect(g.targets.map((n) => n.kind)).toEqual(["endpoint", "cron"]);
    expect(g.edges).toHaveLength(3 + 3 * 2);
    expect(new Set(g.edges.map((e) => e.id)).size).toBe(g.edges.length);
    // Columns are vertically centered: the lone symbol sits at the callers' midline.
    expect(g.symbol.y + NODE_H / 2).toBeCloseTo(g.callers[1]!.y + NODE_H / 2);
    expect(g.callers[1]!.y - g.callers[0]!.y).toBe(ROW_H);
    expect(g.height).toBeGreaterThanOrEqual(3 * NODE_H);
  });

  it("truncates long endpoint labels but keeps the full text as the title", () => {
    const g = layoutGraph({ ...GROUP, endpoints_affected: ["GET /api/public/items/long"] }, "x", 560);
    expect(g.targets[0]!.label).toBe("GET /api/publi…");
    expect(g.targets[0]!.title).toBe("GET /api/public/items/long");
    expect(truncate("short", 15)).toBe("short");
  });

  it("handles a symbol with callers but no endpoints", () => {
    const g = layoutGraph({ ...GROUP, endpoints_affected: [], crons_affected: [] }, "x", 560);
    expect(g.targets).toEqual([]);
    expect(g.edges).toHaveLength(3);
  });

  it("places cron nodes below every endpoint node, as their own kind", () => {
    const g = layoutGraph(GROUP, "x", 560);
    const endpoints = g.targets.filter((n) => n.kind === "endpoint");
    const crons = g.targets.filter((n) => n.kind === "cron");
    expect(crons).toHaveLength(1);
    for (const c of crons) for (const e of endpoints) expect(c.y).toBeGreaterThan(e.y + e.h);
  });
});
