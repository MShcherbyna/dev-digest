import type { SmartDiffRole } from "@devdigest/shared";

/** Docs and Boilerplate groups start collapsed; the others start expanded. */
export const DEFAULT_COLLAPSED_ROLES: ReadonlySet<SmartDiffRole> = new Set(["docs", "boilerplate"]);

/** i18n keys (not resolved strings) for each role's header label + description. */
export const ROLE_TEXT: Record<SmartDiffRole, { label: string; description: string }> = {
  core: { label: "smartDiff.coreLabel", description: "smartDiff.coreDescription" },
  tests: { label: "smartDiff.testsLabel", description: "smartDiff.testsDescription" },
  wiring: { label: "smartDiff.wiringLabel", description: "smartDiff.wiringDescription" },
  docs: { label: "smartDiff.docsLabel", description: "smartDiff.docsDescription" },
  boilerplate: { label: "smartDiff.boilerplateLabel", description: "smartDiff.boilerplateDescription" },
};

/** Marker colour per role (design: core blue, wiring amber, boilerplate grey). */
export const ROLE_COLOR: Record<SmartDiffRole, string> = {
  core: "var(--accent)",
  tests: "var(--ok)",
  wiring: "var(--warn)",
  docs: "#a78bfa",
  boilerplate: "var(--text-muted)",
};
