import { describe, it, expect } from "vitest";
import { parseExpected } from "./expected-output";

describe("parseExpected (client mirror of the server ExpectedOutput contract)", () => {
  it("accepts a valid array, defaulting expect to must_find", () => {
    // Catches: the valid badge rejecting what the server accepts (item without `expect`).
    const r = parseExpected('[{"file":"src/a.ts","start_line":3,"severity":"WARNING"}]');
    expect(r).toEqual({ ok: true, items: [{ expect: "must_find", file: "src/a.ts", start_line: 3, severity: "WARNING" }] });
    expect(parseExpected("[]")).toEqual({ ok: true, items: [] });
  });

  it("rejects unparsable JSON as 'json' and contract violations as 'contract' with a path", () => {
    // Catches: unknown keys, traversal/absolute paths, bad line ranges slipping past the live badge.
    expect(parseExpected("[{")).toMatchObject({ ok: false, reason: "json" });
    expect(parseExpected('{"file":"a"}')).toMatchObject({ ok: false, reason: "contract" });
    expect(parseExpected('[{"file":"a.ts","start_line":1,"bogus":1}]')).toMatchObject({ ok: false, reason: "contract" });
    expect(parseExpected('[{"file":"../etc/passwd","start_line":1}]')).toMatchObject({
      ok: false,
      reason: "contract",
      detail: expect.stringContaining("file"),
    });
    expect(parseExpected('[{"file":"/abs.ts","start_line":1}]')).toMatchObject({ ok: false });
    expect(parseExpected('[{"file":"C:\\\\x.ts","start_line":1}]')).toMatchObject({ ok: false });
    expect(parseExpected('[{"file":"a.ts","start_line":0}]')).toMatchObject({ ok: false });
    expect(parseExpected('[{"file":"a.ts","start_line":5,"end_line":2}]')).toMatchObject({
      ok: false,
      detail: expect.stringContaining("end_line"),
    });
  });
});
