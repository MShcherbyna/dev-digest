import { describe, it, expect } from "vitest";
import type { FindingRecord, PrFile, ReviewRecord, SmartDiffResponse } from "@devdigest/shared";
import { buildViewGroups, findingsByPath, latestReview, linesByPath } from "./helpers";

function file(path: string): PrFile {
  return { path, additions: 1, deletions: 0, patch: "" };
}

function finding(overrides: Partial<FindingRecord>): FindingRecord {
  return {
    id: "f1",
    severity: "CRITICAL",
    category: "bug",
    title: "t",
    file: "a.ts",
    start_line: 1,
    end_line: 1,
    rationale: "r",
    confidence: 0.9,
    kind: "finding",
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...overrides,
  };
}

function review(overrides: Partial<ReviewRecord>): ReviewRecord {
  return {
    id: "rev1",
    pr_id: "pr1",
    agent_id: null,
    run_id: null,
    agent_name: null,
    kind: "review",
    verdict: null,
    summary: null,
    score: null,
    model: null,
    created_at: "2026-01-01T00:00:00Z",
    findings: [],
    ...overrides,
  };
}

describe("latestReview", () => {
  it("returns the newest review whose kind is 'review', skipping 'summary' rows", () => {
    const reviews = [review({ id: "s1", kind: "summary" }), review({ id: "r1", kind: "review" })];
    expect(latestReview(reviews)?.id).toBe("r1");
  });

  it("returns undefined for an empty/undefined list", () => {
    expect(latestReview(undefined)).toBeUndefined();
    expect(latestReview([])).toBeUndefined();
  });
});

describe("findingsByPath", () => {
  it("groups findings by their file path", () => {
    const findings = [finding({ file: "a.ts" }), finding({ file: "b.ts" }), finding({ file: "a.ts" })];
    const map = findingsByPath(findings);
    expect(map.get("a.ts")).toHaveLength(2);
    expect(map.get("b.ts")).toHaveLength(1);
  });
});

describe("linesByPath", () => {
  it("maps each file's finding_lines from the SmartDiff response", () => {
    const sd: SmartDiffResponse = {
      groups: [
        { role: "core", files: [{ path: "a.ts", additions: 1, deletions: 0, pseudocode_summary: null, finding_lines: [3, 8] }] },
      ],
      split_suggestion: { too_big: false, total_lines: 1, proposed_splits: [] },
    };
    expect(linesByPath(sd).get("a.ts")).toEqual([3, 8]);
  });
});

describe("buildViewGroups", () => {
  const sd: SmartDiffResponse = {
    groups: [
      {
        role: "core",
        files: [
          { path: "b.ts", additions: 1, deletions: 0, pseudocode_summary: null, finding_lines: [] },
          { path: "a.ts", additions: 1, deletions: 0, pseudocode_summary: null, finding_lines: [5] },
        ],
      },
      { role: "docs", files: [{ path: "README.md", additions: 1, deletions: 0, pseudocode_summary: null, finding_lines: [] }] },
    ],
    split_suggestion: { too_big: false, total_lines: 3, proposed_splits: [] },
  };

  it("keeps GitHub order within a role, regardless of the SmartDiff response's file order", () => {
    const files = [file("a.ts"), file("b.ts"), file("README.md")];
    const groups = buildViewGroups(files, sd);
    expect(groups.map((g) => g.role)).toEqual(["core", "docs"]);
    expect(groups[0]!.files.map((f) => f.path)).toEqual(["a.ts", "b.ts"]);
  });

  it("puts a file missing from the response into core, and drops empty groups", () => {
    const files = [file("a.ts"), file("unknown.ts")];
    const sdWithoutB: SmartDiffResponse = {
      groups: [{ role: "core", files: [{ path: "a.ts", additions: 1, deletions: 0, pseudocode_summary: null, finding_lines: [] }] }],
      split_suggestion: { too_big: false, total_lines: 1, proposed_splits: [] },
    };
    const groups = buildViewGroups(files, sdWithoutB);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.role).toBe("core");
    expect(groups[0]!.files.map((f) => f.path)).toEqual(["a.ts", "unknown.ts"]);
  });

  it("findingFiles counts files with findings, not the number of findings", () => {
    const files = [file("a.ts"), file("b.ts")];
    const groups = buildViewGroups(files, sd);
    expect(groups[0]!.findingFiles).toBe(1);
  });
});
