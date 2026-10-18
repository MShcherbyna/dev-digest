import { describe, expect, it } from "vitest";
import { agentLook } from "./agent-look";

describe("agentLook", () => {
  it("maps Security -> Shield", () => {
    expect(agentLook({ name: "Security Reviewer" })).toEqual({ icon: "Shield", color: "var(--crit)" });
  });

  it("maps Performance -> Zap", () => {
    expect(agentLook({ name: "Performance Reviewer" }).icon).toBe("Zap");
  });

  it("maps Junior Mentor -> Lightbulb", () => {
    expect(agentLook({ name: "Junior Mentor" }).icon).toBe("Lightbulb");
  });

  it("maps Customer-Facing -> Users", () => {
    expect(agentLook({ name: "Customer-Facing" }).icon).toBe("Users");
  });

  it("maps Architecture -> Boxes", () => {
    expect(agentLook({ name: "Architecture" }).icon).toBe("Boxes");
  });

  it("falls back to Cpu for an unrecognized name", () => {
    expect(agentLook({ name: "Docs Checker" })).toEqual({ icon: "Cpu", color: "var(--text-muted)" });
  });

  it("falls back for a missing agent", () => {
    expect(agentLook(null)).toEqual({ icon: "Cpu", color: "var(--text-muted)" });
  });
});
