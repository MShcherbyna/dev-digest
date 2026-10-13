import { describe, it, expect } from "vitest";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import type { BriefState, StoredBrief } from "@/lib/hooks/brief";
import { briefView, costText, formatTokensK, isInDiff, kindLook, latestReviewBanner, refTarget } from "./helpers";

const BRIEF = { cost_usd: 0.014, tokens_in: 8200, tokens_out: 1300 } as StoredBrief;
const STATE = (over: Partial<BriefState>): BriefState => ({ brief: null, stale: false, generating: false, ...over });
const FULL = { summary: "s" } as StoredBrief;

function finding(over: Partial<FindingRecord>): FindingRecord {
  return {
    id: "f",
    severity: "CRITICAL",
    category: "bug",
    title: "t",
    file: "a.ts",
    start_line: 1,
    end_line: 1,
    rationale: "r",
    confidence: 0.9,
    kind: "finding",
    review_id: "r",
    accepted_at: null,
    dismissed_at: null,
    ...over,
  };
}

function review(over: Partial<ReviewRecord>): ReviewRecord {
  return {
    id: "r",
    pr_id: "pr1",
    agent_id: null,
    run_id: null,
    agent_name: "Security Reviewer",
    kind: "review",
    verdict: "request_changes",
    summary: null,
    score: 61,
    model: null,
    created_at: "2026-01-01T00:00:00Z",
    findings: [],
    ...over,
  };
}

describe("briefView", () => {
  // Catches: the view state diagram drifting (e.g. the server `generating` flag or this tab's
  // pending POST being ignored, so a reload / second tab shows Generate instead of "generating").
  it("derives the six views from query + mutation flags", () => {
    const q = (data: BriefState | undefined, isLoading = false, isError = false) => ({ isLoading, isError, data });
    const idle = { isPending: false };
    expect(briefView({ query: q(undefined, true), mutation: idle })).toBe("loading");
    expect(briefView({ query: q(undefined, false, true), mutation: idle })).toBe("loadError");
    expect(briefView({ query: q(STATE({})), mutation: idle })).toBe("empty");
    expect(briefView({ query: q(STATE({})), mutation: { isPending: true } })).toBe("firstGeneration");
    expect(briefView({ query: q(STATE({ generating: true })), mutation: idle })).toBe("firstGeneration");
    expect(briefView({ query: q(STATE({ brief: FULL })), mutation: idle })).toBe("brief");
    expect(briefView({ query: q(STATE({ brief: FULL })), mutation: { isPending: true } })).toBe("regenerating");
    expect(briefView({ query: q(STATE({ brief: FULL, generating: true })), mutation: idle })).toBe("regenerating");
  });
});

describe("latestReviewBanner", () => {
  // Catches: picking a non-"review" run (e.g. a derive run) or counting dismissed / non-critical
  // findings as blockers, which would make the banner disagree with the Agent runs tab.
  it("uses the first kind:review record and counts only live CRITICAL findings as blockers", () => {
    const banner = latestReviewBanner([
      review({ id: "x", kind: "summary", verdict: "approve" }),
      review({
        id: "new",
        findings: [
          finding({ id: "1" }),
          finding({ id: "2", dismissed_at: "2026-01-02T00:00:00Z" }),
          finding({ id: "3", severity: "WARNING" }),
        ],
      }),
      review({ id: "old", verdict: "approve" }),
    ]);
    expect(banner).toMatchObject({ verdict: "request_changes", findingsCount: 3, blockers: 1, score: 61, agentName: "Security Reviewer" });
  });

  it("is null without a review or without a verdict (summary-only mode)", () => {
    expect(latestReviewBanner(undefined)).toBeNull();
    expect(latestReviewBanner([])).toBeNull();
    expect(latestReviewBanner([review({ verdict: null })])).toBeNull();
  });
});

describe("costText / formatTokensK", () => {
  // Catches: AC-25 text format drift ("$0.014 8.2K→1.3K") and a null cost rendering "$0.00" / "—".
  it("formats cost and tokens, and is null when the cost is unknown", () => {
    expect(costText(BRIEF)).toBe("$0.014 8.2K→1.3K");
    expect(costText({ ...BRIEF, cost_usd: null })).toBeNull();
    expect(costText({ ...BRIEF, tokens_in: null })).toBe("$0.014");
    expect(formatTokensK(850)).toBe("850");
    expect(formatTokensK(12000)).toBe("12K");
  });
});

describe("refTarget / isInDiff / kindLook", () => {
  // Catches: AC-21 - a risk ref range must open at its FIRST line; bare paths have no line;
  // paths containing ':' keep it; garbage line numbers (0) never reach the URL.
  it("parses path, path:N, path:N-M and rejects non-positive lines", () => {
    expect(refTarget("src/middleware/ratelimit.ts:12-18")).toEqual({ path: "src/middleware/ratelimit.ts", line: 12 });
    expect(refTarget("src/a.ts:61")).toEqual({ path: "src/a.ts", line: 61 });
    expect(refTarget("package.json")).toEqual({ path: "package.json", line: null });
    expect(refTarget("src/a.ts:0")).toEqual({ path: "src/a.ts", line: null });
  });

  // Catches: AC-27 - only exact diff paths may navigate (a blast-only file must not).
  it("isInDiff is an exact path match", () => {
    expect(isInDiff("src/a.ts", ["src/a.ts", "b.ts"])).toBe(true);
    expect(isInDiff("src/a", ["src/a.ts"])).toBe(false);
  });

  // Catches: AC-38 - unknown kinds must fall back to the warning icon, not crash.
  it("maps kinds to icons with a default", () => {
    expect(kindLook("security").icon).toBe("Shield");
    expect(kindLook("dependency").icon).toBe("Boxes");
    expect(kindLook("performance").icon).toBe("Zap");
    expect(kindLook("whatever").icon).toBe("AlertTriangle");
  });
});
