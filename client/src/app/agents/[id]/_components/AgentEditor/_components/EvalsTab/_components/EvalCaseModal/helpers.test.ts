import { describe, it, expect } from "vitest";
import { addSkeleton, formatCost, formatDuration, parseDiffFiles, serverReason, validateCaseForm } from "./helpers";
import { DIFF_MAX_CHARS } from "./constants";

const GIT_DIFF = [
  "diff --git a/src/a.ts b/src/a.ts",
  "index 111..222 100644",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -1,3 +1,4 @@",
  " keep",
  "-old",
  "+new1",
  "+new2",
  "diff --git a/src/b.ts b/src/b.ts",
  "--- a/src/b.ts",
  "+++ b/src/b.ts",
  "@@ -10,2 +20,3 @@",
  " ctx",
  "+added",
  "\\ No newline at end of file",
].join("\n");

describe("parseDiffFiles", () => {
  it("counts additions/deletions per file and finds the first added line on the new side", () => {
    // Catches: wrong +a/-d in the Files tab, and a skeleton pre-filled with the wrong start_line.
    expect(parseDiffFiles(GIT_DIFF)).toMatchObject([
      { path: "src/a.ts", additions: 2, deletions: 1, firstAddedLine: 2 },
      { path: "src/b.ts", additions: 1, deletions: 0, firstAddedLine: 21 },
    ]);
    expect(parseDiffFiles(GIT_DIFF)).toHaveLength(2);
  });

  it("parses a hand-pasted ---/+++ diff with sloppy hunk counts, and /dev/null uses the real path", () => {
    // Catches: parser depending on hunk line counts / `diff --git` headers (plan 1.20: shape-based parsing).
    const pasted = ["--- a/src/config.ts", "+++ b/src/config.ts", "@@ -10,6 +10,7 @@", '+  stripeKey: "sk_live"'].join("\n");
    expect(parseDiffFiles(pasted)).toMatchObject([{ path: "src/config.ts", additions: 1, deletions: 0, firstAddedLine: 10 }]);
    const created = ["--- /dev/null", "+++ b/new.ts", "@@ -0,0 +1,2 @@", "+a", "+b"].join("\n");
    expect(parseDiffFiles(created)).toMatchObject([{ path: "new.ts", additions: 2, deletions: 0, firstAddedLine: 1 }]);
    const removed = ["--- a/gone.ts", "+++ /dev/null", "@@ -1,1 +0,0 @@", "-x"].join("\n");
    expect(parseDiffFiles(removed)).toMatchObject([{ path: "gone.ts", additions: 0, deletions: 1, firstAddedLine: null }]);
  });

  it("returns no files for prose or empty input (a diff needs >= 1 file)", () => {
    // Catches: arbitrary text being accepted as a diff.
    expect(parseDiffFiles("")).toEqual([]);
    expect(parseDiffFiles("just some words\n+not in a hunk")).toEqual([]);
  });
});

describe("validateCaseForm", () => {
  const ok = { name: "case-1", diff: GIT_DIFF, expected: "[]" };

  it("returns no reasons for a valid form and one reason per broken field", () => {
    // Catches: Save/Run enabled with a blank name, junk diff or invalid expected JSON (P1-AC-10).
    expect(validateCaseForm(ok)).toEqual({});
    expect(validateCaseForm({ ...ok, name: "   " }).name).toEqual({ key: "nameRequired" });
    expect(validateCaseForm({ ...ok, diff: "hello" }).diff).toEqual({ key: "noFileInDiff" });
    expect(validateCaseForm({ ...ok, expected: "[" }).expected).toEqual({ key: "invalidJsonReason" });
    expect(validateCaseForm({ ...ok, expected: '[{"file":"a.ts"}]' }).expected).toMatchObject({ key: "contractError" });
  });

  it("flags a diff over the size limit as too large (not as 'no file')", () => {
    // Catches: client allowing a body the server rejects with diff_too_large.
    const big = GIT_DIFF + "x".repeat(DIFF_MAX_CHARS);
    expect(validateCaseForm({ ...ok, diff: big }).diff).toEqual({ key: "diffTooLarge" });
  });
});

describe("addSkeleton", () => {
  it("appends a skeleton pre-filled with the first diff file/added line and keeps existing items", () => {
    // Catches: skeleton overwriting the user's JSON or pointing at a file not in the diff.
    const out = JSON.parse(addSkeleton('[{"file":"x.ts","start_line":1}]', GIT_DIFF));
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ file: "x.ts", start_line: 1 });
    expect(out[1]).toEqual({ severity: "WARNING", category: "bug", title: "", file: "src/a.ts", start_line: 2 });
  });

  it("starts from [] when the text is invalid, and falls back to line 1 without a diff", () => {
    // Catches: a throw on invalid JSON when clicking "Finding skeleton".
    const out = JSON.parse(addSkeleton("{oops", ""));
    expect(out).toEqual([{ severity: "WARNING", category: "bug", title: "", file: "", start_line: 1 }]);
  });
});

describe("serverReason / formatters", () => {
  it("maps server codes onto the field they concern, with a 1-based expectation index", () => {
    // Catches: a 422 shown as a generic failure instead of next to the diff / expected field.
    expect(serverReason({ code: "diff_too_large" })).toEqual({ field: "diff", key: "diffTooLarge" });
    expect(serverReason({ code: "diff_unparsable" })).toEqual({ field: "diff", key: "diffUnparsable" });
    expect(serverReason({ code: "expectation_outside_diff", details: { index: 1 } })).toEqual({
      field: "expected",
      key: "expectationOutsideDiff",
      values: { index: "2" },
    });
    expect(serverReason(new Error("boom"))).toEqual({ field: "general", key: "saveFailed" });
    expect(serverReason(null)).toEqual({ field: "general", key: "saveFailed" });
  });

  it("formats duration and cost with a dash for null", () => {
    // Catches: "$null"/"NaNs" in the result panel (plan: cost '—' when null).
    expect(formatDuration(1800)).toBe("1.8s");
    expect(formatDuration(null)).toBe("—");
    expect(formatCost(0.0216)).toBe("$0.02");
    expect(formatCost(null)).toBe("—");
  });
});
