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

  it("highlights Eval Dashboard on /eval and /eval/<agentId>, without stealing neighbouring keys", () => {
    // Catches: the Eval Dashboard sidebar item not lighting up on the all-agents or per-agent
    // page (P2-AC-1), or a neighbouring /agents path being mapped to "eval".
    expect(activeKeyFor("/eval")).toBe("eval");
    expect(activeKeyFor("/eval/ag1")).toBe("eval");
    expect(activeKeyFor("/agents/ag1")).toBe("agents");
    expect(activeKeyFor("/skills")).toBe("skills");
  });
});
