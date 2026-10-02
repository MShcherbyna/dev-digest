import { describe, it, expect } from "vitest";
import { shortDate } from "./helpers";

describe("shortDate", () => {
  it("keeps the calendar day of an ISO timestamp and rejects non-dates", () => {
    expect(shortDate("2026-03-18T10:00:00Z")).toBe("2026-03-18");
    expect(shortDate("not a date")).toBe("");
  });
});
