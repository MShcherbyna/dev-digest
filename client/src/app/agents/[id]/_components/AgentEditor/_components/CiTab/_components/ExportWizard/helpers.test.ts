import { describe, it, expect } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { installation, PREVIEW } from "@/test/ci-fixtures";
import { applyWorkflowEdit, buildZip, initialWizardState, wizardReducer, workflowParseError } from "./helpers";

describe("export wizard helpers", () => {
  it("reports the line of a YAML error and accepts valid YAML", () => {
    // Catches: invalid workflow not blocking Continue (AC-9).
    const err = workflowParseError("a: 1\nb: [1, 2\n");
    expect(err).not.toBeNull();
    expect(err?.line).toBeGreaterThan(0);
    expect(workflowParseError("name: ok\non: pull_request\n")).toBeNull();
  });
  it("defaults triggers and keeps them ordered; update mode prefills from the installation", () => {
    let s = initialWizardState({ mode: "add", activeRepo: { full_name: "acme/api" } });
    expect(s.triggers).toEqual(["opened", "synchronize"]);
    s = wizardReducer(s, { type: "toggleTrigger", trigger: "reopened" });
    s = wizardReducer(s, { type: "toggleTrigger", trigger: "opened" });
    expect(s.triggers).toEqual(["synchronize", "reopened"]);
    const u = initialWizardState({ mode: "update", activeRepo: null, installation: installation({ triggers: ["reopened"], post_as: "none" }) });
    expect(u).toMatchObject({ step: 1, repo: "acme/api", triggers: ["reopened"], postAs: "none" });
  });
  it("zips exactly the files with the edited workflow at their paths (AC-17)", () => {
    const files = applyWorkflowEdit(PREVIEW.files, "name: edited\n");
    const out = unzipSync(buildZip(files));
    expect(Object.keys(out).sort()).toEqual(PREVIEW.files.map((f) => f.path).sort());
    expect(strFromU8(out[".github/workflows/devdigest-review.yml"]!)).toBe("name: edited\n");
  });
});
