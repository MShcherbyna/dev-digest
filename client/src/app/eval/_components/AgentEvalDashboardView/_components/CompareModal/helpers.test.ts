import { describe, it, expect } from "vitest";
import { compareResponse } from "@/test/eval-fixtures";
import { diffLines, promoteCandidates } from "./helpers";

describe("PromptDiff helpers (diffLines)", () => {
  it("marks only the changed line, keeps order, and reports identical text as all-same", () => {
    // Catches: an LCS regression that marks unchanged lines as removed+added, reorders lines,
    // or loses a line; identical prompts must yield no add/del (drives "System prompts are identical").
    expect(diffLines("a\nb\nc", "a\nB\nc")).toEqual([
      { type: "same", text: "a" },
      { type: "del", text: "b" },
      { type: "add", text: "B" },
      { type: "same", text: "c" },
    ]);
    expect(diffLines("a\nb", "a\nb").every((l) => l.type === "same")).toBe(true);
  });

  it("handles pure additions, pure removals and an empty side", () => {
    // Catches: the trailing-lines loops dropping the tail when one prompt is a prefix of the other.
    expect(diffLines("a", "a\nb\nc")).toEqual([
      { type: "same", text: "a" },
      { type: "add", text: "b" },
      { type: "add", text: "c" },
    ]);
    expect(diffLines("a\nb", "a")).toEqual([
      { type: "same", text: "a" },
      { type: "del", text: "b" },
    ]);
    expect(diffLines("", "x")).toEqual([
      { type: "del", text: "" },
      { type: "add", text: "x" },
    ]);
  });
});

describe("promoteCandidates", () => {
  it("returns only sides that are not the current config and still have a snapshot", () => {
    // Catches: offering to promote the already-current config (409) or a version whose
    // snapshot is gone (404) (P2-AC-16).
    const c = compareResponse();
    expect(promoteCandidates(c).map((x) => x.version)).toEqual([2, 3]);
    expect(promoteCandidates({ ...c, b: { ...c.b, is_current_config: true } }).map((x) => x.version)).toEqual([2]);
    expect(promoteCandidates({ ...c, a: { ...c.a, version_available: false } }).map((x) => x.version)).toEqual([3]);
    expect(
      promoteCandidates({ ...c, a: { ...c.a, is_current_config: true }, b: { ...c.b, version_available: false } }),
    ).toEqual([]);
  });
});
