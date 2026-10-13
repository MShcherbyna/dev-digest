import { describe, it, expect } from "vitest";
import { compactRelativeTime } from "./relative-time";

const NOW = Date.parse("2026-10-13T12:00:00Z");

describe("compactRelativeTime", () => {
  it("renders just now, minutes, hours, days and the raw string when unparsable", () => {
    // Catches: wrong unit boundary, a future timestamp going negative, NaN leaking into the footer.
    expect(compactRelativeTime("2026-10-13T11:59:30Z", NOW)).toBe("just now");
    expect(compactRelativeTime("2026-10-13T12:00:30Z", NOW)).toBe("just now"); // clock skew: future clamps to 0
    expect(compactRelativeTime("2026-10-13T11:55:00Z", NOW)).toBe("5m ago");
    expect(compactRelativeTime("2026-10-13T11:00:00Z", NOW)).toBe("1h ago");
    expect(compactRelativeTime("2026-10-10T12:00:00Z", NOW)).toBe("3d ago");
    expect(compactRelativeTime("not-a-date", NOW)).toBe("not-a-date");
  });
});
