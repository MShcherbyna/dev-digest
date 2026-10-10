import { describe, expect, it } from "vitest";
import { areaOf, baseName, dirOf } from "./helpers";

describe("project context row helpers", () => {
  it("splits a path into file name, directory and area", () => {
    // Catches: a root file getting a directory/area from its own name, or a nested path losing its top-level area.
    expect(baseName("client/src/vendor/ui/README.md")).toBe("README.md");
    expect(dirOf("client/src/vendor/ui/README.md")).toBe("client/src/vendor/ui/");
    expect(areaOf("client/src/vendor/ui/README.md")).toBe("client");
    expect(areaOf("docs/agent-prompts/security-reviewer.md")).toBe("docs");
    expect(areaOf("reviewer-core/README.md")).toBe("reviewer-core");
    expect(baseName("TESTING.md")).toBe("TESTING.md");
    expect(dirOf("TESTING.md")).toBe("");
    expect(areaOf("TESTING.md")).toBe("root");
  });
});
