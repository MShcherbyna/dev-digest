import { describe, it, expect } from "vitest";
import { activeKeyFor } from "./helpers";

describe("activeKeyFor (AC-13)", () => {
  it("highlights Onboarding Tour only on /repos/:id/onboarding, not on a bare /onboarding or other repo pages", () => {
    // Catches: the old `includes("/onboarding")` match lighting the item on unrelated paths,
    // and the new item stealing / losing neighbouring keys (context, pulls).
    expect(activeKeyFor("/repos/r1/onboarding")).toBe("onboarding-tour");
    expect(activeKeyFor("/repos/r1/onboarding/")).toBe("onboarding-tour");
    expect(activeKeyFor("/onboarding")).toBe("");
    expect(activeKeyFor("/settings/onboarding")).toBe("settings");
    expect(activeKeyFor("/repos/r1/context")).toBe("context");
    expect(activeKeyFor("/repos/r1/pulls")).toBe("pulls");
  });
});
