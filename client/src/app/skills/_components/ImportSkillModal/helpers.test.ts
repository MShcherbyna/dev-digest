import { describe, it, expect } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { ArchiveError, extractSkillFromZip, isZipFile, pickSkillEntry } from "./helpers";

const zip = (files: Record<string, string>) =>
  zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])));

describe("pickSkillEntry", () => {
  it("prefers the shallowest SKILL.md", () => {
    expect(pickSkillEntry(["a/b/SKILL.md", "x/skill.md", "notes.md"])).toBe("x/skill.md");
  });
  it("falls back to a single .md and ignores junk", () => {
    expect(pickSkillEntry(["__MACOSX/._a.md", "docs/", "my.md", "img.png"])).toBe("my.md");
  });
  it("returns null when ambiguous or empty", () => {
    expect(pickSkillEntry(["a.md", "b.md"])).toBeNull();
    expect(pickSkillEntry(["img.png"])).toBeNull();
  });
});

describe("extractSkillFromZip", () => {
  it("returns the text of SKILL.md", () => {
    const r = extractSkillFromZip(zip({ "pkg/SKILL.md": "# Hi", "pkg/run.sh": "rm -rf /" }));
    expect(r).toEqual({ filename: "SKILL.md", content: "# Hi" });
  });
  it("rejects non-zip data, missing skill and oversized entries", () => {
    const code = (fn: () => unknown) => {
      try {
        fn();
      } catch (e) {
        return (e as ArchiveError).code;
      }
    };
    expect(code(() => extractSkillFromZip(new Uint8Array([1, 2, 3])))).toBe("invalid");
    expect(code(() => extractSkillFromZip(zip({ "a.txt": "x" })))).toBe("noSkill");
    expect(code(() => extractSkillFromZip(zip({ "SKILL.md": "x".repeat(101 * 1024) })))).toBe("tooLarge");
  });
  it("detects .zip names", () => {
    expect(isZipFile("A.ZIP")).toBe(true);
    expect(isZipFile("a.md")).toBe(false);
  });
});
